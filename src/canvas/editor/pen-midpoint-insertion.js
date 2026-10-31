/** Shared fixed insertion target for the hover preview and pointer commit. */
import { fromNodeLocal } from "./scene_geometry.js";
import {
  CLOSE_THRESHOLD,
  cubicPoint,
  distance,
  splitSegment,
} from "./editor_pen_math.js";

const INSERT_RADIUS_PX = 10;

export function findPenInsertion(node, pointer, zoom = 1) {
  if (!node?.points || node.points.length < 2) return null;
  const { points } = node;
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const world = (x, y) => fromNodeLocal(node, { x: x * scaleX, y: y * scaleY });
  const radius = INSERT_RADIUS_PX / zoom;
  // Existing anchors/handles win the pointer hit, so never promise an insert there.
  const grabRadius = Math.max(CLOSE_THRESHOLD, radius);
  for (const anchor of points) {
    if (distance(pointer, world(anchor.x, anchor.y)) <= grabRadius) return null;
    for (const handle of [anchor.in, anchor.out]) {
      if (
        handle &&
        distance(pointer, world(anchor.x + handle[0], anchor.y + handle[1])) <=
          grabRadius
      )
        return null;
    }
  }
  const segmentCount = points.length - (points.at(-1).close ? 0 : 1);
  let best = null;
  for (let index = 0; index < segmentCount; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const [x, y] = cubicPoint(
      [a.x, a.y],
      [a.x + (a.out?.[0] ?? 0), a.y + (a.out?.[1] ?? 0)],
      [b.x + (b.in?.[0] ?? 0), b.y + (b.in?.[1] ?? 0)],
      [b.x, b.y],
      0.5,
    );
    const point = world(x, y);
    const dist = distance(pointer, point);
    if (dist <= radius && (!best || dist < best.dist))
      best = { index, point, dist };
  }
  return best;
}

/** Subdivide at t=0.5, preserving the curve and the closing edge's ownership. */
export function insertPenMidpoint(points, index) {
  const nextIndex = (index + 1) % points.length;
  const { left, mid, right } = splitSegment(
    [points[index], points[nextIndex]],
    0,
    0.5,
  );
  const next = [...points];
  next[index] = left;
  next[nextIndex] = right;
  if (nextIndex === 0) {
    next[index] = { ...left, close: false };
    next.push({ ...mid, close: true });
  } else next.splice(index + 1, 0, mid);
  return next;
}
