/** Browser-native stream sessions share the built-in HTML diff/authoring path. */
let session = null;
let starting = null;
let epoch = 0;
let invalidatedCanvasId = null;

export function canStreamNatively(editor) {
  return typeof globalThis.document?.createElement === "function"
    && typeof editor?.addFrameAt === "function" && typeof editor?.addRectAt === "function";
}

export async function clearNativeLayoutStream() {
  epoch += 1;
  invalidatedCanvasId = null;
  const current = session;
  if (!current) return;
  current.clearing = true;
  current.controller.abort();
  try { await current.streamer.flush(); }
  catch (error) { if (error.name !== "AbortError") throw error; }
  finally {
    // Clear removes only this stream's layers, preserving pre-existing artwork.
    const doc = current.editor.getDocument?.() ?? current.editor.getDoc?.();
    if (doc?.canvasId === current.canvasId) {
      for (const { id } of [...current.streamer.previous.values()].reverse()) current.editor.removeNode(id);
      if (!current.targetFrameId) current.editor.removeNode(current.streamer.frameId);
    }
    closeSession(current);
  }
}
function closeSession(current) {
  if (current.closed) return;
  current.closed = true;
  clearTimeout(current.idleTimer);
  current.unsubscribe?.();
  current.signal?.removeEventListener("abort", current.abort);
  current.streamer.finish({ commit: current.store.getState().activeDocumentId === current.projectId });
  if (session === current) session = null;
}

async function openSession(editor, targetId, store, signal) {
  const projectId = store.getState().activeDocumentId;
  const doc = editor.getDocument?.() ?? editor.getDoc?.();
  const canvasId = doc.canvasId;
  const pageId = store.getState().editingNodeId;
  if (session && session.editor === editor && session.canvasId === canvasId && session.targetId === targetId && session.projectId === projectId) return session;
  if (session) throw new DOMException("Stream target changed; clear before restarting", "AbortError");
  const sessionEpoch = epoch;
  const { CanvasStreamer } = await import("./html_pipeline/incremental.js");
  signal?.throwIfAborted();
  if (epoch !== sessionEpoch) throw new DOMException("Stream cleared", "AbortError");
  if (store.getState().activeDocumentId !== projectId || store.getState().editingNodeId !== pageId) throw new DOMException("Stream document or canvas changed", "AbortError");
  const target = doc.nodes?.find(node => node.id === targetId);
  if (target && !(target.isFrame || target.frame || target.kind === "group")) throw new Error("stream_layout target must be a frame");
  if (targetId && !target && targetId !== canvasId && targetId !== store.getState().editingNodeId) throw new Error("stream_layout target is not the active canvas");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const frame = target
    ? { x: target.x, y: target.y, width: target.width, height: target.height }
    : { x: 0, y: 0, width: doc.width, height: doc.height };
  const streamer = new CanvasStreamer({ editor, frame, signal: controller.signal, targetFrameId: target?.id, commitName: "AI: Stream layout" });
  const current = { editor, canvasId, projectId, targetId, targetFrameId: target?.id, streamer, controller, signal, abort, store };
  controller.signal.addEventListener("abort", () => {
    if (!current.clearing) {
      invalidatedCanvasId = canvasId;
      void streamer.flush().catch(error => {
        if (error.name !== "AbortError") console.error("[stream_layout]", error);
      }).finally(() => { if (!current.clearing) closeSession(current); });
    }
  }, { once: true });
  current.unsubscribe = store.subscribe?.(state => {
    if (state.activeDocumentId !== projectId || state.editingNodeId !== pageId) controller.abort();
  });
  session = current;
  try { streamer.start(); }
  catch (error) { closeSession(current); throw error; }
  return current;
}

export async function streamNativeLayout(content, { editor, targetId, store, signal, final }) {
  if (invalidatedCanvasId && (editor.getDocument?.() ?? editor.getDoc?.())?.canvasId === invalidatedCanvasId) throw new Error("stream_layout session ended; clear before restarting");
  // Resolve the shared constructor once even when file-watcher chunks arrive
  // during dynamic import. Snapshots themselves coalesce in CanvasStreamer.
  if (!starting) starting = openSession(editor, targetId, store, signal);
  let current;
  try {
    current = await starting;
  } finally { starting = null; }
  if (current.editor !== editor || current.targetId !== targetId) throw new Error("stream_layout already has another active target");
  const { closeSnapshot } = await import("./html_pipeline/generate_html.js");
  const html = /<body\b/i.test(content) ? content : `<html><body style="margin:0">${content}`;
  const snapshot = closeSnapshot(html);
  clearTimeout(current.idleTimer);
  // A disconnected writer must not leave the history transaction muted forever.
  current.idleTimer = setTimeout(() => {
    invalidatedCanvasId = current.canvasId;
    void current.streamer.flush().catch(error => {
      if (error.name !== "AbortError") console.error("[stream_layout]", error);
    }).finally(() => { if (!current.clearing) closeSession(current); });
  }, 60000);
  current.idleTimer.unref?.();
  try {
    signal?.throwIfAborted();
    if (!snapshot) {
      if (final) throw new Error("stream_layout has no renderable HTML snapshot");
      return { status: "streaming", length: content.length, preview: false, nodeCount: current.streamer.previous.size };
    }
    await current.streamer.snapshot(snapshot);
    if (final) closeSession(current);
    return { status: final ? "committed" : "streaming", final: Boolean(final), length: content.length, preview: false, nodeCount: current.streamer.previous.size };
  } catch (error) {
    current.controller.abort();
    if (!current.clearing) closeSession(current);
    throw error;
  }
}
