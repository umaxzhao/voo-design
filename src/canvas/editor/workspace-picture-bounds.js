import { isFrameSelectionBoundary } from "./frame-selection-unit.js";

const SUPPORTED_KINDS = new Set(["group", "frame", "rect", "ellipse", "path", "text", "image"]);
const boundsCache = new WeakMap();
const hasEffects = effects => effects && Object.values(effects).some(effect => effect && effect.enabled !== false);

function rootBounds(node) {
  // Only ordinary clipping frames prove a finite paint extent. Unknown effects,
  // warps and backdrop operations keep the existing viewport-coverage path.
  if (!isFrameSelectionBoundary(node) || node.clipContent === false || node.rotation || node.shear ||
      node.flipH || node.flipV || node.warp || node.perspective || node.distort ||
      node.maskId || node.clipTo || node.layerBlur || node.shadow?.enabled || hasEffects(node.effects) ||
      ![undefined, "normal", "source-over", "pass-through"].includes(node.blendMode)) return null;
  if (![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0) return null;
  if (node.strokes && !Array.isArray(node.strokes)) return null;
  const widths = [node.strokeWidth ?? 0, ...(node.strokes ?? []).map(stroke => stroke.width ?? stroke.strokeWidth ?? 0)];
  if (!widths.every(width => Number.isFinite(width) && width >= 0)) return null;
  const pad = widths.reduce((largest, width) => Math.max(largest, width), 0);
  return { left: node.x - pad, top: node.y - pad,
    right: node.x + node.width + pad, bottom: node.y + node.height + pad };
}

/** A conservative finite extent, only when every node belongs to a clipping frame. */
export function workspacePictureBounds(doc) {
  if (!doc?.isCanvasRoot || !doc.nodes?.length || doc.timeline) return null;
  const nodes = doc.nodes;
  const cached = boundsCache.get(nodes);
  if (cached?.length === nodes.length) return cached.bounds;
  const remember = bounds => { boundsCache.set(nodes, { length: nodes.length, bounds }); return bounds; };
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) return remember(null);
  const owned = new Set();
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const node of nodes) {
    if (!SUPPORTED_KINDS.has(node.kind)) return remember(null);
    if (node.parentId) continue;
    const box = rootBounds(node);
    if (!box) return remember(null);
    owned.add(node.id);
    bounds.left = Math.min(bounds.left, box.left); bounds.top = Math.min(bounds.top, box.top);
    bounds.right = Math.max(bounds.right, box.right); bounds.bottom = Math.max(bounds.bottom, box.bottom);
  }
  if (!owned.size) return remember(null);
  for (const node of nodes) {
    const chain = new Set();
    let current = node;
    while (!owned.has(current.id)) {
      if (chain.has(current.id)) return remember(null);
      chain.add(current.id);
      current = byId.get(current.parentId);
      if (!current) return remember(null);
    }
    for (const id of chain) owned.add(id);
  }
  return remember(bounds);
}

/** Leave two device pixels for antialiasing before declaring all artwork captured. */
export function pictureCapturesScene(doc, surface, margin, dpr) {
  const bounds = workspacePictureBounds(doc);
  if (!bounds) return false;
  const { zoom, panX, panY } = surface.viewport;
  const guard = 2 / dpr;
  return bounds.left * zoom + panX >= -margin + guard &&
    bounds.top * zoom + panY >= -margin + guard &&
    bounds.right * zoom + panX <= surface.stageWidth + margin - guard &&
    bounds.bottom * zoom + panY <= surface.stageHeight + margin - guard;
}
