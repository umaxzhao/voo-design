/**
 * Gradient control point hit-testing, dragging, and rebuilding.
 *
 * Extracted from editor_pointer.js.
 */

import { nodeRect } from "./scene_model.js";
import {
  isCssGradient,
  parseGradient,
  formatGradient,
} from "../color_picker/gradient_fill.js";

/** The t of a point projected onto a segment, clamped to [0, 1]. */
export function projectOnSegment(point, line) {
  const dx = line.endX - line.startX;
  const dy = line.endY - line.startY;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return 0;
  const t =
    ((point.x - line.startX) * dx + (point.y - line.startY) * dy) / lengthSq;
  return Math.max(0, Math.min(1, t));
}

/** Distance from a point to a segment, in the segment's own units. */
export function pointToSegmentDistance(point, line) {
  const t = projectOnSegment(point, line);
  const px = line.startX + (line.endX - line.startX) * t;
  const py = line.startY + (line.endY - line.startY) * t;
  return Math.hypot(point.x - px, point.y - py);
}

/**
 * The gradient line of a node in document space, plus the geometry it came
 * from. A plain angle gradient (no line metadata yet) is seeded with the box
 * corners the overlay actually draws, so the first endpoint drag activates
 * the direction line without a visual jump.
 */
function gradientLineGeometry(node, parsed) {
  const geom = parsed.geometry ?? {};
  const line = {
    startX: node.x + ((geom.startX ?? 0) / 100) * node.width,
    startY: node.y + ((geom.startY ?? 0) / 100) * node.height,
    endX: node.x + ((geom.endX ?? 100) / 100) * node.width,
    endY: node.y + ((geom.endY ?? 100) / 100) * node.height,
  };
  const geometry = {
    ...geom,
    startX: geom.startX ?? 0,
    startY: geom.startY ?? 0,
    endX: geom.endX ?? 100,
    endY: geom.endY ?? 100,
  };
  return { line, geometry };
}

/**
 * Rebuilds a gradient fill string after a stop or geometry edit.
 *
 * parseGradient answers "solid" for a non-gradient fill; the callers only
 * run on gradient fills, but the guard keeps a bad fill from turning into a
 * radial gradient by accident.
 */
export function rebuildGradient(fill, { stops, geometry } = {}) {
  const parsed = parseGradient(fill);
  if (!parsed || parsed.type === "solid") return fill;
  return formatGradient(
    parsed.type,
    parsed.angle ?? "135deg",
    stops ?? parsed.stops,
    geometry ?? parsed.geometry,
  );
}

/**
 * What a press on a gradient node grabbed, or null.
 *
 * Priority: the endpoints, then the stops, then the line itself. The return
 * carries everything a drag needs — the box the geometry lives in, the line
 * at grab time and the parsed stops — so the drags stay pure.
 */
export function gradientControlGrab(node, point, grabRadius) {
  if (!isCssGradient(node.fill)) return null;
  const parsed = parseGradient(node.fill);
  if (!parsed || parsed.type === "solid") return null;
  const { line, geometry } = gradientLineGeometry(node, parsed);
  const box = nodeRect(node);
  const base = {
    id: node.id,
    start: point,
    box,
    line,
    geometry,
    stops: parsed.stops,
    fill: node.fill,
  };

  const startDist = Math.hypot(point.x - line.startX, point.y - line.startY);
  const endDist = Math.hypot(point.x - line.endX, point.y - line.endY);
  if (startDist <= grabRadius || endDist <= grabRadius) {
    return {
      ...base,
      kind: "gradientEndpoint",
      which: startDist <= endDist ? "start" : "end",
    };
  }
  for (let index = 0; index < (parsed.stops ?? []).length; index += 1) {
    const ratio = (parsed.stops[index].position ?? 0) / 100;
    const sx = line.startX + (line.endX - line.startX) * ratio;
    const sy = line.startY + (line.endY - line.startY) * ratio;
    if (Math.hypot(point.x - sx, point.y - sy) <= grabRadius + 2) {
      return { ...base, kind: "gradientStop", index };
    }
  }
  if (pointToSegmentDistance(point, line) <= grabRadius) {
    return { ...base, kind: "gradientLine" };
  }
  return null;
}

/** Drags a stop along the gradient line: the new fill string. */
export function dragGradientStop(gesture, point) {
  const t = projectOnSegment(point, gesture.line);
  const nextStops = (gesture.stops ?? []).map((stop, index) =>
    index === gesture.index ? { ...stop, position: Math.round(t * 100) } : stop,
  );
  return rebuildGradient(gesture.fill, { stops: nextStops });
}

/**
 * Drags one endpoint of the direction line: the new fill string.
 *
 * With `snap` (Shift held) the line's *visual* direction locks to 15° steps,
 * the same increment rotation snaps to. The geometry lives in the node's box
 * percentages, which are anisotropic on a non-square box, so the angle is
 * taken in visual units (percent × box size) and the snapped vector is
 * mapped back into percentages — a 45° line reads 45° however the box is
 * shaped.
 */
export function dragGradientEndpoint(gesture, point, snap = false) {
  const { box } = gesture;
  const localX = ((point.x - box.x) / Math.max(1, box.width)) * 100;
  const localY = ((point.y - box.y) / Math.max(1, box.height)) * 100;
  const isStart = gesture.which === "start";
  const fixedX = isStart ? gesture.geometry.endX : gesture.geometry.startX;
  const fixedY = isStart ? gesture.geometry.endY : gesture.geometry.startY;

  let nextX = localX;
  let nextY = localY;
  if (snap) {
    const dx = localX - fixedX;
    const dy = localY - fixedY;
    const visualDx = (dx / 100) * box.width;
    const visualDy = (dy / 100) * box.height;
    const magnitude = Math.hypot(visualDx, visualDy);
    if (magnitude > 1e-6) {
      const step = Math.PI / 12; // 15°
      const snappedAngle =
        Math.round(Math.atan2(visualDy, visualDx) / step) * step;
      nextX =
        fixedX +
        ((magnitude * Math.cos(snappedAngle)) / Math.max(1, box.width)) * 100;
      nextY =
        fixedY +
        ((magnitude * Math.sin(snappedAngle)) / Math.max(1, box.height)) * 100;
    }
  }

  const geometry = { ...gesture.geometry };
  if (isStart) {
    geometry.startX = nextX;
    geometry.startY = nextY;
  } else {
    geometry.endX = nextX;
    geometry.endY = nextY;
  }
  return rebuildGradient(gesture.fill, { geometry });
}

/** Drags the line itself: both endpoints translate together. */
export function dragGradientLine(gesture, point) {
  const dx = point.x - gesture.start.x;
  const dy = point.y - gesture.start.y;
  const { box } = gesture;
  const dxPct = (dx / Math.max(1, box.width)) * 100;
  const dyPct = (dy / Math.max(1, box.height)) * 100;
  const geometry = {
    ...gesture.geometry,
    startX: gesture.geometry.startX + dxPct,
    startY: gesture.geometry.startY + dyPct,
    endX: gesture.geometry.endX + dxPct,
    endY: gesture.geometry.endY + dyPct,
  };
  return rebuildGradient(gesture.fill, { geometry });
}
