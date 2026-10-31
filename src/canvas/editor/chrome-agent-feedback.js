/** Agent feedback is interaction chrome: never artwork, selection or history. */
const ACCENT = "#E5B2FF";
let focus = null;
let cursor = null;
let focusTimer;
let cursorTimer;
let animationFrame;

function hostEditor() {
  return typeof window === "undefined" ? null : window.__vooEditor;
}
function readDocument(editor) {
  return editor?.getDocument?.() ?? editor?.getDoc?.();
}
function ownsDocument(feedback, doc) {
  return !doc || !feedback?.canvasId || feedback.canvasId === doc.canvasId;
}
function repaint(editor) {
  editor?.requestRender?.();
}
function reducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function setAgentCursor({ x, y, label = "VOO", active = true, durationMs = 3000, editor = hostEditor(), owner, drag, travelMs = 110 } = {}) {
  if (!active || !Number.isFinite(x) || !Number.isFinite(y)) {
    clearAgentCursor(owner);
    return;
  }
  const previous = cursor && cursor.editor === editor ? cursorPosition(cursor) : { x, y };
  clearTimeout(cursorTimer);
  cursor = {
    x, y, label, owner, editor, drag,
    canvasId: readDocument(editor)?.canvasId,
    from: previous, timestamp: Date.now(), travelMs: reducedMotion() ? 0 : travelMs,
  };
  cursorTimer = setTimeout(() => clearAgentCursor(owner), durationMs);
  cursorTimer.unref?.();
  repaint(editor);
}

export function getAgentCursor(doc) {
  return ownsDocument(cursor, doc) ? cursor : null;
}
export function clearAgentCursor(owner) {
  if (owner !== undefined && cursor?.owner !== owner) return;
  const editor = cursor?.editor;
  cursor = null;
  clearTimeout(cursorTimer);
  if (animationFrame !== undefined) globalThis.cancelAnimationFrame?.(animationFrame);
  animationFrame = undefined;
  repaint(editor);
}
export function setAgentFocusNode(node, status = "", options = {}) {
  const editor = options.editor ?? hostEditor();
  clearTimeout(focusTimer);
  if (!node) { clearAgentFocusNode(options.owner); return; }
  focus = {
    layerId: node.id, x: node.x ?? 0, y: node.y ?? 0,
    width: node.width ?? 100, height: node.height ?? 100, status,
    editor, owner: options.owner, canvasId: readDocument(editor)?.canvasId,
  };
  if (options.cursor !== false) setAgentCursor({
    x: focus.x + Math.min(focus.width / 2, 24), y: focus.y,
    label: options.label ?? "VOO", editor, owner: options.owner,
  });
  focusTimer = setTimeout(() => clearAgentFocusNode(options.owner), 1400);
  focusTimer.unref?.();
  repaint(editor);
}
export function getAgentFocusNode(doc) {
  return ownsDocument(focus, doc) ? focus : null;
}
export function clearAgentFocusNode(owner) {
  if (owner !== undefined && focus?.owner !== owner) return;
  const editor = focus?.editor;
  focus = null;
  clearTimeout(focusTimer);
  repaint(editor);
}
function cursorPosition(value) {
  const fraction = value.travelMs ? Math.min(1, (Date.now() - value.timestamp) / value.travelMs) : 1;
  const eased = 1 - (1 - fraction) ** 3;
  return {
    x: value.from.x + (value.x - value.from.x) * eased,
    y: value.from.y + (value.y - value.from.y) * eased,
    moving: fraction < 1,
  };
}
export function drawAgentFocusOverlay(ctx, value, viewport) {
  if (!value || !viewport) return;
  const { zoom, panX, panY } = viewport;
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(value.x * zoom + panX, value.y * zoom + panY, value.width * zoom, value.height * zoom);
  ctx.restore();
}
export function drawAgentCursorOverlay(ctx, value, viewport) {
  if (!value || !viewport) return;
  const position = cursorPosition(value);
  const x = position.x * viewport.zoom + viewport.panX;
  const y = position.y * viewport.zoom + viewport.panY;
  ctx.save();
  if (value.drag && position.moving) {
    // The carried outline follows the pointer; the real layer lands at full geometry.
    const { width, height, offsetX = 0, offsetY = 0 } = value.drag;
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = "rgba(229, 178, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const rect = [x - offsetX * viewport.zoom, y - offsetY * viewport.zoom, width * viewport.zoom, height * viewport.zoom];
    ctx.fillRect(...rect);
    ctx.strokeRect(...rect);
    ctx.setLineDash([]);
  }
  ctx.translate(x, y);
  ctx.fillStyle = ACCENT;
  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4, 12);
  ctx.lineTo(8, 19); ctx.lineTo(11, 17); ctx.lineTo(7, 10);
  ctx.lineTo(13, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (value.label) {
    ctx.font = "500 11px sans-serif";
    const width = ctx.measureText(value.label).width + 16;
    ctx.fillStyle = ACCENT;
    ctx.beginPath(); ctx.roundRect(16, 15, width, 22, 6); ctx.fill();
    ctx.fillStyle = "#171717";
    ctx.textBaseline = "middle";
    ctx.fillText(value.label, 24, 26);
  }
  ctx.restore();
  if (position.moving && animationFrame === undefined && !globalThis.document?.hidden) {
    animationFrame = globalThis.requestAnimationFrame?.(() => {
      animationFrame = undefined;
      if (cursor === value) repaint(value.editor);
    });
  }
}
