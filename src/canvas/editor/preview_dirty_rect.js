import { isPlainRect } from "./render_plain_rects.js";
import { unionRect } from "./dirty_rect.js";

// Only flat solid rectangles have local, bounded paint dependencies. Keep the
// general path for effects, groups, page changes, reordering and insertion.
export function previewDirtyRect(before, after, zoom = 1) {
  if (before.nodes.length !== after.nodes.length) return null;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key !== "nodes" && before[key] !== after[key]) return null;
  }
  let dirty = null;
  for (let i = 0; i < before.nodes.length; i++) {
    const a = before.nodes[i], b = after.nodes[i];
    if (a.id !== b.id || !isPlainRect(a) || !isPlainRect(b)) return null;
    if (a === b) continue;
    dirty = unionRect(dirty, unionRect(a, b));
  }
  if (!dirty) return null;
  // Covers selection handles, hover outlines and antialiasing at either end.
  const pad = 32 / Math.max(zoom, .001);
  return { x: dirty.x - pad, y: dirty.y - pad,
    width: dirty.width + pad * 2, height: dirty.height + pad * 2 };
}
