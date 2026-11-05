import { useSyncExternalStore } from "react";
import { createCollabSession, STATUS } from "./session.js";
import { createLoopbackTransport } from "./loopback_transport.js";
import { accessFromLink, ownerKeyFromLink, parseRoomId, roomSecretFromLink } from "./room.js";
import { loadIdentity } from "./identity.js";

let state = { status: "off", link: null, error: null, guest: false, session: null };
let session = null, transport = null, detach = null, revision = 0, endpoint = null;
const listeners = new Set();
const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
export const getLoopbackState = () => state;
export const getLoopbackSession = () => session;
export const subscribeLoopback = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const useLoopbackState = () => useSyncExternalStore(subscribeLoopback, getLoopbackState, getLoopbackState);

function updateSession(snapshot) {
  let link = null;
  if (endpoint && !state.guest && snapshot.link) {
    const online = new URL(snapshot.link);
    link = `${endpoint}/?local=1${online.search.replace(/^\?/, "&")}${online.hash}`;
  }
  publish({ session: snapshot, link, status: snapshot.status === STATUS.CONNECTED ? "ready" : "starting" });
}

async function attach(current) {
  const [{ createDocumentBridge }, db, { useDesignStore }] = await Promise.all([
    import("./document_bridge.js"), import("../store/db.js"), import("../../store/design_store.js"),
  ]);
  const deadline = Date.now() + 5000;
  while (!globalThis.window?.__vooEditor?.getDocument) {
    if (revision !== current || Date.now() >= deadline) throw new Error("Editor is not ready");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (revision !== current) throw new Error("Loopback start cancelled");
  detach = createDocumentBridge({ session, engine: window.__vooEditor, store: useDesignStore, db });
}

async function open({ url, token, secret, room, ownerKey, guest, access }) {
  const current = ++revision;
  publish({ status: "starting", error: null, guest, link: null, session: null });
  const identity = loadIdentity();
  session = createCollabSession({ userId: identity.userId, name: identity.name, onChange: updateSession,
    connect: (id, handlers) => {
      transport = createLoopbackTransport(id, handlers, { url, token, initialAccess: guest ? undefined : access });
      return transport;
    } });
  if (!guest) await session.prepareAuthority();
  await attach(current);
  if (revision !== current) throw new Error("Loopback start cancelled");
  session.start(room, { secret, ownerKey, viaLink: guest });
  session.setAccess(access);
  return room;
}

export async function startLoopbackCollab(access = "edit") {
  if (state.status !== "off" && state.status !== "error") return;
  try {
    publish({ status: "starting", error: null });
    const api = globalThis.vooDesktop?.loopbackCollab;
    if (!api) throw new Error("Loopback sharing requires the desktop app");
    const info = await api.start();
    if (info.address !== "127.0.0.1") throw new Error("Invalid loopback address");
    endpoint = `http://127.0.0.1:${info.port}`;
    await open({ url: `ws://127.0.0.1:${info.port}`, token: info.hostToken, secret: info.guestToken,
      room: info.room, guest: false, access });
  } catch (error) {
    detach?.(); detach = null; session?.stop(); session = null; transport = null;
    let detail = error.message;
    try { await globalThis.vooDesktop?.loopbackCollab?.stop(); }
    catch (cleanupError) { detail = `${detail}; ${cleanupError.message}`; }
    publish({ status: "error", error: detail, link: null, session: null });
  }
}

export async function joinLoopbackCollab(location) {
  const url = new URL(location.href);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.searchParams.get("local") !== "1") throw new Error("Invalid loopback link");
  const room = parseRoomId(url.href), secret = roomSecretFromLink(url.href), ownerKey = ownerKeyFromLink(url.href);
  if (!room || !secret || !ownerKey) throw new Error("Invalid loopback room credentials");
  endpoint = url.origin;
  return open({ url: `ws://${url.host}`, token: secret, secret, room, ownerKey, guest: true, access: accessFromLink(url.href) ?? "edit" });
}

export function setLoopbackAccess(access) {
  if (!session || state.guest) return;
  transport?.setAccess(access); session.setAccess(access);
}

export async function stopLoopbackCollab() {
  revision += 1; detach?.(); detach = null; session?.stop(); session = null; transport = null;
  try {
    if (!state.guest) await globalThis.vooDesktop?.loopbackCollab?.stop();
    endpoint = null; publish({ status: "off", link: null, error: null, session: null, guest: false });
  } catch (error) { publish({ status: "error", error: error.message, link: null, session: null }); }
}
