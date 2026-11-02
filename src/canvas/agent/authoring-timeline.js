import { setAgentCursor, clearAgentCursor, setAgentFocusNode, clearAgentFocusNode } from "../editor/chrome-agent-feedback.js";

const activeEditors = new WeakSet();

/** Transactions on one engine cannot mute/restore each other's history hooks. */
export function acquireAuthoring(editor) {
  if (activeEditors.has(editor)) throw new Error("Authoring is already active on this canvas");
  activeEditors.add(editor);
  return () => activeEditors.delete(editor);
}

/** A bounded presentation of real mutations, never a replay of a finished design. */
export function createAuthoringTimeline(editor, { signal, wait = waitForPaint, now = Date.now } = {}) {
  const owner = Symbol("authoring");
  const readDocument = () => editor.getDocument?.() ?? editor.getDoc?.();
  const canvasId = readDocument()?.canvasId;
  let started = 0;
  let duration = 0;
  let index = 0;
  let animated = false;
  const assertCurrent = () => {
    signal?.throwIfAborted();
    if (canvasId && readDocument()?.canvasId !== canvasId) {
      throw new DOMException("Authoring document changed", "AbortError");
    }
  };
  const canAnimate = () => typeof globalThis.requestAnimationFrame === "function"
    && !globalThis.document?.hidden
    && !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return {
    assertCurrent,
    begin(count) {
      assertCurrent(); started = now(); index = 0;
      duration = Math.min(110, 650 / Math.max(1, count));
    },
    async before(node) {
      assertCurrent();
      animated = canAnimate() && index < 8 && now() - started < 700;
      const width = Math.max(0, Number(node.width) || 0);
      const height = Math.max(0, Number(node.height) || 0);
      const offsetX = Math.min(width / 2, 24), offsetY = Math.min(height / 2, 20);
      setAgentCursor({
        x: (Number(node.x) || 0) + offsetX, y: (Number(node.y) || 0) + offsetY,
        editor, owner, label: "VOO", travelMs: animated ? duration : 0,
        drag: animated ? { width, height, offsetX, offsetY } : null,
      });
      if (animated) await wait(duration, signal);
      assertCurrent();
    },
    async after(node) {
      assertCurrent();
      // Creation helpers have their own feedback. Reclaim this session's cursor
      // after the mutation so finishing cannot leave a helper badge behind.
      setAgentCursor({ x: (Number(node.x) || 0) + Math.min((Number(node.width) || 0) / 2, 24), y: (Number(node.y) || 0) + Math.min((Number(node.height) || 0) / 2, 20), editor, owner, label: "VOO", travelMs: 0 });
      if (animated) setAgentFocusNode(node, "", { editor, owner, cursor: false });
      editor.requestRender?.();
      // Yield only a bounded number of frames; a 200-layer batch must not take
      // 200 display frames merely to act out operations already received.
      if (canAnimate() && (animated || index % 12 === 0)) await wait(0, signal);
      index += 1;
      assertCurrent();
    },
    finish() { clearAgentCursor(owner); clearAgentFocusNode(owner); },
  };
}

/** Resolve after an actual paint opportunity; clean every frame/listener on abort. */
export function waitForPaint(duration, signal) {
  signal?.throwIfAborted();
  if (typeof globalThis.requestAnimationFrame !== "function" || globalThis.document?.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let frame, timeout, painted = false;
    const finish = error => {
      globalThis.cancelAnimationFrame(frame); clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const tick = () => {
      if (painted && Date.now() - start >= duration) finish();
      else { painted = true; frame = globalThis.requestAnimationFrame(tick); }
    };
    signal?.addEventListener("abort", abort, { once: true });
    frame = globalThis.requestAnimationFrame(tick);
    // Backgrounding can suspend RAF after scheduling; never stall generation.
    timeout = setTimeout(() => finish(), Math.max(180, duration + 100));
  });
}
