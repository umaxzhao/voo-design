/**
 * Pure bounding-box and intersection maths for nodes and rectangles.
 */

import { fromNodeLocal, nodeCorners } from "./scene_geometry_transform.js";

/** Turns any two corners into a rectangle with positive width and height. */
export function normaliseRect(rect) {
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

export function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * The axis-aligned bounding box of the (possibly rotated) node.
 *
 * Snapping and cropping reason about this box rather than the stored rect:
 * it is what actually covers the page. Without a transform it is exactly the
 * stored rect, so rect-in/rect-out consumers keep their old numbers.
 */
export function nodeAABB(node) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  if (
    Array.isArray(node.perspectiveQuad) &&
    node.perspectiveQuad.length === 4
  ) {
    for (const p of node.perspectiveQuad) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }

  if (
    Array.isArray(node.perspectiveCorners) &&
    node.perspectiveCorners.length === 4
  ) {
    for (const c of node.perspectiveCorners) {
      // Corners are node-local ratios; the node's own rotation/shear applies
      // to them the same way the renderer applies it (fromNodeLocal), or a
      // rotated warp node's box silently describes a shape nobody drew.
      const p = fromNodeLocal(node, {
        x: (c.x ?? 0) * node.width,
        y: (c.y ?? 0) * node.height,
      });
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }

  if (
    node.warpMesh &&
    Array.isArray(node.warpMesh.points) &&
    node.warpMesh.points.length > 0
  ) {
    for (const raw of node.warpMesh.points) {
      const p = fromNodeLocal(node, {
        x: (raw.x ?? 0) * node.width,
        y: (raw.y ?? 0) * node.height,
      });
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }

  if (
    node.effectiveLocal &&
    !(
      (node.rotation ?? 0) ||
      (node.shear ?? 0) ||
      Boolean(node.flipH) ||
      Boolean(node.flipV)
    )
  ) {
    return {
      x: node.x + node.effectiveLocal.x,
      y: node.y + node.effectiveLocal.y,
      width: node.effectiveLocal.width,
      height: node.effectiveLocal.height,
    };
  }

  for (const corner of nodeCorners(node)) {
    if (corner.x < minX) minX = corner.x;
    if (corner.y < minY) minY = corner.y;
    if (corner.x > maxX) maxX = corner.x;
    if (corner.y > maxY) maxY = corner.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bounding box of a point list, e.g. a freehand stroke. */
export function boundsOfPoints(points) {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The smallest box covering every box given, or null for none.
 *
 * What a set of selected nodes is drawn and dragged as: the operations that
 * act on several nodes at once — the outline, the snap during a group drag,
 * aligning — all need the one box the set occupies rather than each member's.
 */
export function combinedBounds(boxes) {
  if (!boxes || boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The combined box of whole nodes, each measured by its own AABB. */
export function nodesBounds(nodes) {
  return combinedBounds((nodes ?? []).map((node) => nodeAABB(node)));
}
