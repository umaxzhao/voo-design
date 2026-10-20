// Warp mesh subdivision caching and coordinate transformation for node rendering.

import { fromNodeLocal } from "./scene_geometry.js";
import { readNodeTransform } from "./scene_state_contract.js";

const warpSubdivisionCache = new Map();
const WARP_SUBDIVISION_CACHE_MAX = 32;

export function warpOutputScale(ctx) {
  const transform = ctx.getTransform?.();
  return Math.min(
    8,
    Math.max(1, Math.abs(transform?.a ?? 1), Math.abs(transform?.d ?? 1)),
  );
}

export function cachedSubdivision(kind, node, ctx, build) {
  const scale = warpOutputScale(ctx);
  const transform = readNodeTransform(node);
  const statePayload = kind === "bicubic" ? transform.mesh : transform.corners;
  const key = `${kind}|${node.id ?? "node"}|${node.x},${node.y},${node.width},${node.height}|${JSON.stringify(statePayload)}|${scale}`;
  const cached = warpSubdivisionCache.get(key);
  if (cached) return cached;
  const mesh = build(scale);
  while (warpSubdivisionCache.size >= WARP_SUBDIVISION_CACHE_MAX) {
    warpSubdivisionCache.delete(warpSubdivisionCache.keys().next().value);
  }
  warpSubdivisionCache.set(key, mesh);
  return mesh;
}

/**
 * A warp mesh's control points in document space.
 *
 * Mesh points are stored as node-local ratios (0..1 of the node's box) so a
 * moved, scaled or rotated node carries its grid with it — the same host-local
 * convention reference regions use. This maps them onto the node's current
 * box, ready for the renderer's doc-space transform (which also applies the
 * node's own rotation/shear).
 */
export function warpMeshPointsInDoc(node) {
  const points = readNodeTransform(node).mesh?.points;
  if (!Array.isArray(points)) return [];
  return points.map((p) => ({
    x: node.x + (p.x ?? 0) * node.width,
    y: node.y + (p.y ?? 0) * node.height,
  }));
}

/** A node's perspective corners as doc-space points, from local ratios. */
export function perspectiveCornersInDoc(node) {
  const corners = readNodeTransform(node).corners;
  if (!Array.isArray(corners) || corners.length < 4) return [];
  return corners.map((c) => ({
    x: node.x + (c.x ?? 0) * node.width,
    y: node.y + (c.y ?? 0) * node.height,
  }));
}

/**
 * A warp control point mapped through the node's own transform (rotation,
 * shear and position), for chrome drawn outside the node's ctx — the overlay
 * sits in screen space, so the node transform has to be baked in here.
 */
export function warpPointTransformed(node, p) {
  return fromNodeLocal(node, {
    x: (p.x ?? 0) * node.width,
    y: (p.y ?? 0) * node.height,
  });
}

/**
 * Which warp path a text node takes, or null when it renders flat.
 *
 * Mirrors the image warp routing exactly: a 3×3 curved patch (Photoshop
 * presets) subdivides bicubically, any other mesh renders cell by cell, and
 * the four perspective corners become a subdivided quad. Text nodes reach
 * this state through the same tools and presets as image nodes — the warp
 * chrome and the preset generators are node-agnostic — so all that was
 * missing was the render side.
 */
export function textWarpRoute(node) {
  const transform = readNodeTransform(node);
  if (
    transform.kind === "warp" &&
    transform.mesh &&
    Array.isArray(transform.mesh.points)
  ) {
    const mesh = transform.mesh;
    const isCurve =
      mesh.type === "bicubic" ||
      (mesh.cols === 3 &&
        mesh.rows === 3 &&
        mesh.points.length === 16 &&
        mesh.isCurve !== false);
    return isCurve ? "bicubic" : "mesh";
  }
  if (
    transform.kind === "perspective" &&
    transform.corners &&
    transform.corners.length === 4
  ) {
    return "perspective";
  }
  return null;
}
