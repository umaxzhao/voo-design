import { mergeEditorDocuments } from "../store/merge.js";
import { MSG, CAP_BINARY_BLOBS, PROTOCOL_VERSION } from "./protocol.js";
import {
  BINARY_CHUNK_SIZE,
  CHUNK_SIZE,
  createByteReassembler,
  createReassembler,
  encodeBinaryFrame,
  splitPayload,
} from "./chunking.js";
import { emitRemoteStroke, onLocalStroke } from "./stroke_bus.js";

const PUSH_DELAY_MS = 250;
const WANT_DELAY_MS = 150;

function stripImageBytes(value) {
  if (Array.isArray(value)) return value.map(stripImageBytes);
  if (!value || typeof value !== "object") return value;
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      /^(blob|bitmap|imageData|dataUrl|src)$/i.test(key) &&
      typeof child === "string" &&
      child.startsWith("data:")
    )
      continue;
    if (typeof Blob !== "undefined" && child instanceof Blob) continue;
    if (typeof ImageBitmap !== "undefined" && child instanceof ImageBitmap)
      continue;
    clean[key] = stripImageBytes(child);
  }
  return clean;
}

function imageIds(document) {
  const ids = new Set();
  const visit = (value, key = "") => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    for (const [childKey, child] of Object.entries(value)) {
      if (/image(id|key)$/i.test(childKey) && typeof child === "string")
        ids.add(child);
      else visit(child, childKey);
    }
  };
  visit(document);
  return [...ids];
}

function createBase(document) {
  return stripImageBytes(document ?? {});
}

export function createDocumentBridge({
  session,
  engine,
  store,
  db,
  onProgress,
  delay = PUSH_DELAY_MS,
  wantDelay = WANT_DELAY_MS,
  setTimeout: schedule = globalThis.setTimeout,
  clearTimeout: unschedule = globalThis.clearTimeout,
}) {
  const stringReassembler = createReassembler();
  const byteReassembler = createByteReassembler();
  let base = createBase(engine.getDocument());
  let lastSeen = JSON.stringify(base);
  let applyingRemote = false;
  let pushTimer = 0;
  let wantTimer = 0;
  let wantsPending = new Set();
  const wanted = new Map();
  const holders = new Map();
  const incoming = new Map();
  const receiving = new Map();
  let imagesDone = 0;

  function snapshot() {
    const raw = engine.snapshotDoc?.();
    return createBase(
      typeof raw === "string" ? JSON.parse(raw) : (raw ?? engine.getDocument()),
    );
  }

  function sendDocument(peerId = null) {
    if (applyingRemote || session.getSnapshot?.().readOnly) return;
    const document = snapshot();
    const wire = JSON.stringify(document);
    if (!peerId && wire === lastSeen) return;
    lastSeen = wire;
    const payload = { document };
    if (peerId) session.sendTo(peerId, MSG.DOC, payload);
    else {
      session.broadcast(MSG.DOC, payload);
      base = createBase(document);
    }
  }

  function schedulePush() {
    if (pushTimer) return;
    pushTimer = schedule(() => {
      pushTimer = 0;
      sendDocument();
    }, delay);
  }

  function announceHave() {
    const ids = Object.keys(store.getState?.().images ?? {});
    if (ids.length) session.broadcast(MSG.BLOB_HAVE, { ids });
  }

  async function sendImages(peerId, ids) {
    const available = await db.getImageBlobMap?.(ids);
    if (session.peerSupports?.(peerId, CAP_BINARY_BLOBS)) {
      for (const [id, blob] of available ?? []) {
        if (!blob) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const total = Math.max(
          1,
          Math.ceil(bytes.byteLength / BINARY_CHUNK_SIZE),
        );
        for (let seq = 0; seq < total; seq += 1) {
          await session.whenWritable?.(peerId);
          session.sendRaw?.(
            peerId,
            encodeBinaryFrame(
              {
                t: MSG.BLOB_DATA,
                v: PROTOCOL_VERSION,
                id,
                seq,
                total,
                mime: blob.type || "image/png",
              },
              bytes.subarray(
                seq * BINARY_CHUNK_SIZE,
                (seq + 1) * BINARY_CHUNK_SIZE,
              ),
            ),
          );
        }
      }
      return;
    }
    const urls = await db.getImageDataUrls(ids);
    for (const [id, dataUrl] of Object.entries(urls ?? {})) {
      for (const chunk of splitPayload(dataUrl, CHUNK_SIZE)) {
        await session.whenWritable?.(peerId);
        session.sendTo(peerId, MSG.BLOB_DATA, {
          id,
          dataUrl: chunk.chunk,
          ...chunk,
        });
      }
    }
  }

  function requestImages(ids, peerId) {
    const held = new Set(Object.keys(store.getState?.().images ?? {}));
    ids.forEach((id) => {
      if (id && !held.has(id) && !wanted.has(id)) wantsPending.add(id);
    });
    if (!wantsPending.size || wantTimer) return;
    wantTimer = schedule(() => {
      wantTimer = 0;
      const request = [...wantsPending].filter((id) => !held.has(id));
      wantsPending = new Set();
      request.forEach((id) => wanted.set(id, peerId));
      if (request.length)
        session.sendTo(peerId, MSG.BLOB_WANT, { ids: request });
    }, wantDelay);
  }

  async function absorb(id, payload) {
    receiving.delete(id);
    wanted.delete(id);
    incoming.delete(id);
    imagesDone += 1;
    await db.putImages([[id, payload]]);
    const dataUrl = (await db.getImageDataUrls([id]))?.[id];
    if (dataUrl) store.getState?.().putImageState?.(id, dataUrl);
    session.broadcast(MSG.BLOB_HAVE, { ids: [id] });
    onProgress?.(null);
  }

  async function canAbsorb(id, peerId) {
    if (!wanted.has(id) || wanted.get(id) !== peerId) return false;
    if (receiving.has(id)) return receiving.get(id) === peerId;
    receiving.set(id, peerId);
    const stored = await db.getImageBlobMap?.([id]);
    if (
      Object.prototype.hasOwnProperty.call(store.getState?.().images ?? {}, id)
    ) {
      receiving.delete(id);
      wanted.delete(id);
      return false;
    }
    if (stored?.has?.(id)) {
      receiving.delete(id);
      wanted.delete(id);
      return false;
    }
    return true;
  }

  const onUnsubscribe = engine.subscribeRender?.(schedulePush, {
    documentOnly: true,
  });
  session.setHandlers({
    onDocRequest(peerId) {
      announceHave();
      sendDocument(peerId);
    },
    async onDocument(message, peerId) {
      if (!message?.document) return;
      const local = snapshot();
      const remote = createBase(message.document);
      applyingRemote = true;
      try {
        const merged = mergeEditorDocuments(base, local, remote);
        engine.setDoc(merged, { name: "collab.remote", commit: false });
        base = createBase(merged);
        lastSeen = JSON.stringify(remote);
        if (JSON.stringify(merged) !== JSON.stringify(remote)) schedulePush();
      } finally {
        applyingRemote = false;
      }
      requestImages(imageIds(remote), peerId);
    },
    onBlobHave(ids, peerId) {
      for (const id of ids ?? []) {
        let peers = holders.get(id);
        if (!peers) holders.set(id, (peers = new Set()));
        peers.add(peerId);
      }
      requestImages(
        (ids ?? []).filter((id) => imageIds(snapshot()).includes(id)),
        peerId,
      );
    },
    onBlobWant(ids, peerId) {
      void sendImages(peerId, ids);
    },
    onBlobWantOriginal(ids, peerId) {
      void sendImages(peerId, ids);
    },
    async onBlobData(message, peerId) {
      if (!(await canAbsorb(message.id, peerId))) return;
      const whole = stringReassembler.add(peerId, message.id, message);
      if (whole !== null) await absorb(message.id, whole);
    },
    async onBlobChunk(meta, bytes, peerId) {
      if (!(await canAbsorb(meta.id, peerId))) return;
      const whole = byteReassembler.add(peerId, meta.id, {
        seq: meta.seq,
        total: meta.total,
        chunk: bytes,
      });
      if (whole !== null)
        await absorb(meta.id, new Blob([whole], { type: meta.mime ?? "" }));
    },
    onStroke: emitRemoteStroke,
  });
  const onStroke = onLocalStroke((stroke) =>
    session.broadcast(MSG.STROKE, stroke),
  );

  return () => {
    onUnsubscribe?.();
    onStroke?.();
    if (pushTimer) unschedule(pushTimer);
    if (wantTimer) unschedule(wantTimer);
    session.setHandlers({});
    pushTimer = 0;
    wantTimer = 0;
    incoming.clear();
    holders.clear();
    wanted.clear();
    void imagesDone;
  };
}
