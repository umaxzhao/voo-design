import { drawNode } from "./render_nodes.js";
import { isHiddenByGroup } from "./scene_model.js";
import { containsFramePoint } from "./frame-target.js";
import { createFrameClipContext } from "./frame-clip-context.js";
import { toNodeLocal } from "./scene_geometry.js";

/** Only mask-bearing candidates pay for alpha readback; reuse one pixel per engine. */
export function createMaskHitTester({ getDoc, cache, maskTools }) {
  let canvas = null, lastNodes = null, byId, frameClips, lastPoint = null;
  const coverage = new Map();
  function opaqueAt(node, point) {
    if (!cache || typeof document === "undefined") {
      if (!containsFramePoint(node, point)) return false;
      if (node.kind !== "ellipse") return true;
      const p = toNodeLocal(node, point);
      return ((p.x - node.width / 2) / (node.width / 2)) ** 2 +
        ((p.y - node.height / 2) / (node.height / 2)) ** 2 <= 1;
    }
    if (coverage.has(node.id)) return coverage.get(node.id);
    if (!canvas) { canvas = document.createElement("canvas"); canvas.width = canvas.height = 1; }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return containsFramePoint(node, point);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1, 1);
    ctx.translate(0.5 - point.x, 0.5 - point.y);
    drawNode(ctx, node, value => cache.get(value), value => maskTools?.maskSourceOf?.(value) ?? cache.getMask?.(value), null, false);
    const rgba = ctx.getImageData(0, 0, 1, 1).data;
    const opaque = rgba[3] > 0 && (node.maskType !== "luminance" || rgba[0] + rgba[1] + rgba[2] > 0);
    coverage.set(node.id, opaque);
    return opaque;
  }
  function maskContains(doc, id, point, seen = new Set()) {
    const base = byId.get(id);
    if (!base || seen.has(id) || base.visible === false || isHiddenByGroup(doc, base)) return false;
    if (!frameClips.framesOf(base).every(frame => containsFramePoint(frame, point))) return false;
    seen.add(id);
    if (!opaqueAt(base, point)) return false;
    if (base.clipTo && !maskContains(doc, base.clipTo, point, seen)) return false;
    return true;
  }
  return (node, point) => {
    const doc = getDoc();
    if (lastNodes !== doc.nodes) {
      lastNodes = doc.nodes; lastPoint = null;
      // Flat unmasked scenes keep their existing cheap hit path.
      byId = doc.nodes.some(item => item.clipTo || item.maskId)
        ? new Map(doc.nodes.map(item => [item.id, item])) : null;
      frameClips = byId ? createFrameClipContext(doc.nodes) : null;
    }
    if (!byId) return false;
    const key = `${point.x}:${point.y}`;
    if (lastPoint !== key) { coverage.clear(); lastPoint = key; }
    if (node.maskId && !opaqueAt(node, point)) return true;
    const seen = new Set(); let current = node;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.clipTo && !maskContains(doc, current.clipTo, point)) return true;
      current = byId.get(current.parentId);
    }
    return false;
  };
}
