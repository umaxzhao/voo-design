import { useSyncExternalStore } from "react";
import { createCollabSession, STATUS } from "./session.js";
import {
  accessFromLink,
  accessFromLocation,
  parseRoomId,
  roomIdFromLocation,
} from "./room.js";
import { loadIdentity, saveIdentity } from "./identity.js";
import { MSG } from "./protocol.js";
import { loadCollabConfig } from "./collab_config.js";
import {
  beginCollabOperation,
  registerCollabStop,
  stopCollabSession,
} from "./session-lifecycle.js";

let session = null;
let detachBridge = null;
let imageProgress = null;
const listeners = new Set();
let snapshot = {
  status: STATUS.OFF,
  roomId: null,
  link: null,
  selfId: null,
  peers: [],
  access: "edit",
  readOnly: false,
  active: false,
  imageProgress: null,
};

function publish(next) {
  snapshot = { ...next, imageProgress };
  listeners.forEach((listener) => listener());
}

async function connectLater(roomId, handlers) {
  const { createWebRtcTransport } = await import("./webrtc_transport.js");
  return createWebRtcTransport(roomId, handlers);
}

function deferredTransport(roomId, handlers) {
  let transport = null;
  let closed = false;
  const queued = [];
  connectLater(roomId, handlers).then((opened) => {
    if (closed) return opened.close();
    transport = opened;
    queued.splice(0).forEach(([method, args]) => transport[method](...args));
  });
  const call =
    (method) =>
    (...args) => {
      if (transport) transport[method](...args);
      else if (!closed) queued.push([method, args]);
    };
  return {
    send: call("send"),
    broadcast: call("broadcast"),
    close() {
      closed = true;
      queued.length = 0;
      transport?.close();
    },
  };
}

export function getCollabSession() {
  if (!session) {
    const identity = loadIdentity();
    session = createCollabSession({
      connect: deferredTransport,
      userId: identity.userId,
      name: identity.name,
      onChange: publish,
    });
    session.setIdentity(identity);
  }
  return session;
}

export function setCollabIdentity(identity) {
  saveIdentity(identity);
  getCollabSession().setIdentity(identity);
}

export function setCollabAccess(access) {
  getCollabSession().setAccess(access);
}

function reportIfBroken(promise) {
  promise.catch((error) =>
    console.error("collab: bridge attach failed", error),
  );
}

async function attachBridge(isCurrent) {
  if (detachBridge) return;
  const [
    { createDocumentBridge },
    { getImageBlobMap, getImageDataUrls, putImages },
    { useDesignStore },
  ] = await Promise.all([
    import("./document_bridge.js"),
    import("../store/db.js"),
    import("../../store/design_store.js"),
  ]);
  if (
    detachBridge ||
    !isCurrent() ||
    !session ||
    session.getSnapshot().status === STATUS.OFF
  )
    return;
  const engine = globalThis.window?.__vooEditor;
  if (!engine?.getDocument || !engine?.setDoc)
    throw new Error("activeEditorEngineMissing");
  detachBridge = createDocumentBridge({
    session,
    engine,
    store: useDesignStore,
    db: { getImageBlobMap, getImageDataUrls, putImages },
    onProgress: (progress) => {
      imageProgress = progress;
      if (session) publish(session.getSnapshot());
    },
  });
}

export function sendCollabCursor(cursor) {
  const live = getCollabSession();
  const state = live.getSnapshot();
  if (state.status === STATUS.OFF) return false;
  return live.broadcast(MSG.CURSOR, { peerId: state.selfId, cursor });
}

export async function startCollab(
  roomId,
  access,
  { isCurrent = () => true } = {},
) {
  const isLatest = beginCollabOperation();
  await loadCollabConfig();
  if (!isLatest() || !isCurrent()) return null;
  const live = getCollabSession();
  const joined = live.start(
    roomId ?? live.getSnapshot().roomId ?? roomIdFromLocation() ?? undefined,
    { viaLink: false },
  );
  if (access !== undefined) live.setAccess(access);
  reportIfBroken(attachBridge(() => isLatest() && isCurrent()));
  return joined;
}

export async function joinCollabByLink(text) {
  const roomId = parseRoomId(text);
  if (!roomId) return null;
  const isCurrent = beginCollabOperation();
  await loadCollabConfig();
  if (!isCurrent()) return null;
  const live = getCollabSession();
  const access = accessFromLink(text);
  if (access) live.setAccess(access);
  live.start(roomId);
  reportIfBroken(attachBridge(isCurrent));
  return roomId;
}

export async function autoJoinFromLocation() {
  const roomId = roomIdFromLocation();
  if (!roomId) return null;
  const isCurrent = beginCollabOperation();
  await loadCollabConfig();
  if (!isCurrent()) return null;
  const live = getCollabSession();
  const access = accessFromLocation();
  if (access) live.setAccess(access);
  live.start(roomId);
  reportIfBroken(attachBridge(isCurrent));
  return roomId;
}

registerCollabStop(() => {
  detachBridge?.();
  detachBridge = null;
  imageProgress = null;
  session?.stop();
});

export function stopCollab() {
  stopCollabSession();
}

export function requestCollabOriginal(ids) {
  if (ids?.length && session)
    session.broadcast(MSG.BLOB_WANT_ORIGINAL, { ids });
}

export function collabRoomWorkflowId() {
  return null;
}

export function useCollabState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}
