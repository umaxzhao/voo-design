import { nodeAABB } from "./scene_geometry.js";
import { isHiddenByGroup } from "./scene_model.js";
import { createFrameClipContext } from "./frame-clip-context.js";
import { hitRegionPath } from "./hit-region-path.js";

const regions = new WeakMap();
const contains = (outer, inner) => outer && outer.left <= inner.left && outer.top <= inner.top &&
  outer.right >= inner.right && outer.bottom >= inner.bottom;

/** Ancestor rectangles already cover their contained descendants in the hit union. */
export function artworkWorldHitRegions(doc) {
  const nodes = doc.nodes;
  const cached = regions.get(nodes);
  if (cached?.length === nodes.length) return cached.rectangles;
  const byId = new Map(nodes.map(node => [node.id, node])), boxes = new Map(), bounds = new Map();
  const clips = createFrameClipContext(nodes);
  const boxOf = node => {
    if (!boxes.has(node)) boxes.set(node, nodeAABB(node));
    return boxes.get(node);
  };
  for (const node of nodes) {
    if (node.visible === false || isHiddenByGroup(doc, node)) continue;
    const box = boxOf(node);
    if (![box?.x, box?.y, box?.width, box?.height].every(Number.isFinite)) continue;
    let left = box.x, top = box.y, right = box.x + box.width, bottom = box.y + box.height;
    for (const ancestor of clips.framesOf(node)) {
      const clip = boxOf(ancestor);
      left = Math.max(left, clip.x); top = Math.max(top, clip.y);
      right = Math.min(right, clip.x + clip.width); bottom = Math.min(bottom, clip.y + clip.height);
    }
    if (right > left && bottom > top) bounds.set(node.id, { left, top, right, bottom });
  }
  const rectangles = [];
  for (const node of nodes) {
    const box = bounds.get(node.id);
    if (!box) continue;
    const visited = new Set([node.id]);
    let parent = byId.get(node.parentId), covered = false;
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (contains(bounds.get(parent.id), box)) covered = true;
      parent = byId.get(parent.parentId);
    }
    // Malformed cycles have no root owner; never discard every member's hit area.
    if (parent) covered = false;
    if (!covered) rectangles.push(box);
  }
  regions.set(nodes, { length: nodes.length, rectangles });
  return rectangles;
}

/** Preserve the exact eight-screen-pixel pointer reach while the camera changes. */
export function artworkHitPath(doc, surface) {
  const { zoom, panX, panY } = surface.viewport;
  const rectangles = [];
  for (const box of artworkWorldHitRegions(doc)) {
    const rect = { left: box.left * zoom + panX - 8, top: box.top * zoom + panY - 8,
      right: box.right * zoom + panX + 8, bottom: box.bottom * zoom + panY + 8 };
    if (rect.right < 0 || rect.bottom < 0 || rect.left > surface.stageWidth || rect.top > surface.stageHeight) continue;
    rectangles.push(rect);
  }
  return hitRegionPath(rectangles);
}
