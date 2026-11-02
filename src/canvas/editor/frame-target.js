import { resolveCornerRadii } from "./scene_model_core.js";
import { isHiddenByGroup, isLockedByGroup } from "./scene_model_groups.js";
import { toNodeLocal } from "./scene_geometry.js";
import { createFrameClipContext } from "./frame-clip-context.js";
import { isFrameSelectionBoundary } from "./frame-selection-unit.js";

export function containsFramePoint(node, point) {
  if (!(node.width > 0) || !(node.height > 0)) return false;
  const local = toNodeLocal(node, point);
  const { x, y } = local, width = node.width, height = node.height;
  if (x < 0 || y < 0 || x > width || y > height) return false;
  const r = resolveCornerRadii(node.cornerRadius, width, height);
  for (const [radius, cx, cy, corner] of [
    [r.tl, r.tl, r.tl, x < r.tl && y < r.tl],
    [r.tr, width - r.tr, r.tr, x > width - r.tr && y < r.tr],
    [r.br, width - r.br, height - r.br, x > width - r.br && y > height - r.br],
    [r.bl, r.bl, height - r.bl, x < r.bl && y > height - r.bl],
  ]) {
    if (corner && (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) return false;
  }
  return true;
}

export function isEditableFrame(doc, node) {
  return isFrameSelectionBoundary(node) && node.visible !== false && !node.locked &&
    !isHiddenByGroup(doc, node) && !isLockedByGroup(doc, node);
}

/** Drawing, placement and dragging must agree on the visible frontmost Frame. */
export function visibleFrameAtPoint(doc, point) {
  if (!doc?.nodes?.length || !point) return null;
  const clips = createFrameClipContext(doc.nodes);
  for (let index = doc.nodes.length - 1; index >= 0; index--) {
    const node = doc.nodes[index];
    if (!isEditableFrame(doc, node) || !containsFramePoint(node, point)) continue;
    if (clips.framesOf(node).every(ancestor => containsFramePoint(ancestor, point))) return node;
  }
  return null;
}

/** Explicit canvas locations win; otherwise use the selected Frame/nearest ancestor. */
export function insertionTarget(doc, point, selectedIds = [], excludedIds = new Set()) {
  let target = null;
  if (point) target = visibleFrameAtPoint(doc, point);
  else if (selectedIds.length === 1) {
    const byId = new Map(doc.nodes.map(node => [node.id, node]));
    const seen = new Set();
    let current = byId.get(selectedIds[0]);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (!excludedIds.has(current.id) && isEditableFrame(doc, current)) {
        target = current; break;
      }
      current = byId.get(current.parentId);
    }
  }
  return { frame: target, point: point ?? (target ? {
    x: target.x + target.width / 2, y: target.y + target.height / 2,
  } : null) };
}
