/**
 * Pure transform and local/document space coordinate mapping.
 *
 * Node render-time transform:
 *     doc = T(centre) · R(rotation) · shear(tan shear) · T(−centre) · local
 */

import { NODE_KIND } from "./scene_model.js";

const DEG_TO_RAD = Math.PI / 180;

/** The terms of the node's matrix, or null when the transform is identity. */
export function transformTerms(node) {
  const transforms = node?.kind !== NODE_KIND.REGION;
  const rotation =
    transforms && Number.isFinite(node?.rotation) ? node.rotation : 0;
  const shear = transforms && Number.isFinite(node?.shear) ? node.shear : 0;
  const isImage = node?.kind === NODE_KIND.IMAGE;
  const flipH = transforms && !isImage && Boolean(node?.flipH);
  const flipV = transforms && !isImage && Boolean(node?.flipV);
  if (!rotation && !shear && !flipH && !flipV) return null;
  return {
    cx: node.x + node.width / 2,
    cy: node.y + node.height / 2,
    cos: Math.cos(rotation * DEG_TO_RAD),
    sin: Math.sin(rotation * DEG_TO_RAD),
    tan: Math.tan(shear * DEG_TO_RAD),
    sx: flipH ? -1 : 1,
    sy: flipV ? -1 : 1,
  };
}

/** Maps a point in the node's local box space to document space. */
export function fromNodeLocal(node, point) {
  const qx = node.x + point.x;
  const qy = node.y + point.y;
  const t = transformTerms(node);
  if (!t) return { x: qx, y: qy };
  const fx = (qx - t.cx) * t.sx;
  const fy = (qy - t.cy) * t.sy;
  const dx = fx + t.tan * fy;
  const dy = fy;
  return {
    x: t.cx + t.cos * dx - t.sin * dy,
    y: t.cy + t.sin * dx + t.cos * dy,
  };
}

/** Inverse of fromNodeLocal: a document point in the node's local box space. */
export function toNodeLocal(node, point) {
  const t = transformTerms(node);
  if (!t) return { x: point.x - node.x, y: point.y - node.y };
  const qx = point.x - t.cx;
  const qy = point.y - t.cy;
  const ux = t.cos * qx + t.sin * qy;
  const uy = -t.sin * qx + t.cos * qy;
  const fx = (ux - t.tan * uy) * t.sx;
  const fy = uy * t.sy;
  return {
    x: t.cx + fx - node.x,
    y: t.cy + fy - node.y,
  };
}

/**
 * A document-space delta in the node's local frame.
 *
 * The linear part of `toNodeLocal` — the translations cancel, so a pointer
 * movement comes out in the axes `resizeRect` works in. Identity-transformed
 * nodes get the delta back unchanged.
 */
export function toNodeLocalDelta(node, delta) {
  const origin = toNodeLocal(node, { x: 0, y: 0 });
  const moved = toNodeLocal(node, { x: delta.x, y: delta.y });
  return { x: moved.x - origin.x, y: moved.y - origin.y };
}

/** The four corners of the node's box in document space, nw → ne → se → sw. */
export function nodeCorners(node) {
  const local = node.effectiveLocal ?? {
    x: 0,
    y: 0,
    width: node.width,
    height: node.height,
  };
  return [
    fromNodeLocal(node, { x: local.x, y: local.y }),
    fromNodeLocal(node, { x: local.x + local.width, y: local.y }),
    fromNodeLocal(node, {
      x: local.x + local.width,
      y: local.y + local.height,
    }),
    fromNodeLocal(node, { x: local.x, y: local.y + local.height }),
  ];
}
