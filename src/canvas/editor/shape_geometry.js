/**
 * Geometry for the shape tools: regular polygons, stars, and the two-point
 * line/arrow strokes.
 *
 * Pure functions, no DOM and no React, so the maths is unit-testable and the
 * pointer layer stays a thin state machine over it. Everything here works in
 * document space; a node's own points stay relative to its box, the way
 * `createPathNode` stores them.
 */

import { NODE_KIND, createPathNode, pathBounds } from "./scene_model.js";

/**
 * Scales and translates a set of 2D points so that their outer bounds
 * (minX, maxX, minY, maxY) match the target `box` exactly.
 * Snaps extreme coordinates precisely to box boundaries to avoid floating-point
 * drift.
 */
export function fitPointsToBox(points, box) {
  if (!Array.isArray(points) || points.length === 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const targetX = box?.x ?? 0;
  const targetY = box?.y ?? 0;
  const targetW = box?.width ?? 0;
  const targetH = box?.height ?? 0;
  const scaleX = spanX > 1e-9 ? targetW / spanX : 0;
  const scaleY = spanY > 1e-9 ? targetH / spanY : 0;

  return points.map(([px, py]) => {
    let nx;
    if (spanX <= 1e-9) {
      nx = targetX;
    } else if (Math.abs(px - minX) < 1e-12) {
      nx = targetX;
    } else if (Math.abs(px - maxX) < 1e-12) {
      nx = targetX + targetW;
    } else {
      nx = targetX + (px - minX) * scaleX;
    }

    let ny;
    if (spanY <= 1e-9) {
      ny = targetY;
    } else if (Math.abs(py - minY) < 1e-12) {
      ny = targetY;
    } else if (Math.abs(py - maxY) < 1e-12) {
      ny = targetY + targetH;
    } else {
      ny = targetY + (py - minY) * scaleY;
    }

    return [nx, ny];
  });
}

/**
 * The vertices of a regular polygon inscribed and fitted in `box`, in document space.
 * The vertices' bounding box matches `box` exactly so the outer bounds never shrink
 * inside the drawing frame.
 * The first vertex sits at the top centre and the rest follow clockwise
 * (screen coordinates, so increasing angle runs clockwise).
 */
export function regularPolygonPoints(box, sides = 6) {
  const count = Math.max(3, Math.round(sides));
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    points.push([Math.cos(angle), Math.sin(angle)]);
  }
  return fitPointsToBox(points, box);
}

/**
 * The vertices of a `spikes`-pointed star inscribed and fitted in `box`:
 * the vertices' bounding box matches `box` exactly. Outer and inner
 * vertices alternating, outer first at the top centre, clockwise. `innerRatio`
 * is the inner radius as a fraction of the outer one.
 */
export function starPoints(box, spikes = 5, innerRatio = 0.382) {
  const count = Math.max(2, Math.round(spikes));
  const points = [];
  for (let i = 0; i < count * 2; i += 1) {
    const outer = i % 2 === 0;
    const scale = outer ? 1 : innerRatio;
    const angle = -Math.PI / 2 + (i * Math.PI) / count;
    points.push([
      scale * Math.cos(angle),
      scale * Math.sin(angle),
    ]);
  }
  return fitPointsToBox(points, box);
}

/**
 * The line tool's stroke: the arrow's two-point path without the head.
 * `start`/`end` are document-space `{x, y}` points.
 */
export function lineNodeFromPoints(start, end, { stroke, strokeWidth }) {
  return createPathNode({
    points: [
      [start.x, start.y],
      [end.x, end.y],
    ],
    stroke,
    strokeWidth,
    line: true,
  });
}

/**
 * A regular polygon as a closed, filled path node. Fill-only by convention:
 * the tool draws with `strokeWidth: 0`, like Figma's default shapes. The
 * generative parameters ride along so the properties panel can regrow the
 * vertices when the user edits the count.
 */
export function polygonNodeFromBox(
  box,
  { sides = 6, fill, stroke, strokeWidth = 0 },
) {
  return createPathNode({
    points: regularPolygonPoints(box, sides),
    poly: true,
    polyKind: "polygon",
    sides: Math.max(3, Math.round(sides)),
    closed: true,
    fill,
    stroke,
    strokeWidth,
  });
}

/** A star as a closed, filled path node — the polygon's spiky sibling. */
export function starNodeFromBox(
  box,
  { spikes = 5, innerRatio = 0.382, fill, stroke, strokeWidth = 0 },
) {
  return createPathNode({
    points: starPoints(box, spikes, innerRatio),
    poly: true,
    polyKind: "star",
    spikes: Math.max(3, Math.round(spikes)),
    innerRatio,
    closed: true,
    fill,
    stroke,
    strokeWidth,
  });
}

/**
 * The field set that regrows a poly node's vertices from new generative
 * parameters: a sides/spikes/innerRatio edit, or a polygon↔star switch. The
 * new outline is inscribed in the node's current box — the stroke padding is
 * stripped first, so repeated edits do not inflate the box — and re-based
 * against the fresh bounds, the way `movePathEndpoint` re-bases its stroke.
 * Nodes drawn before the parameters were stored fall back to the factory
 * defaults for whichever kind they are edited into.
 */
export function withPolyParams(node, params = {}) {
  const polyKind = params.polyKind ?? node.polyKind ?? "polygon";
  const sides = Math.max(3, Math.round(params.sides ?? node.sides ?? 6));
  const spikes = Math.max(3, Math.round(params.spikes ?? node.spikes ?? 5));
  const innerRatio = Math.min(
    0.98,
    Math.max(0.02, params.innerRatio ?? node.innerRatio ?? 0.382),
  );
  const strokeWidth = node.strokeWidth ?? 0;
  const inset = strokeWidth / 2;
  const box = {
    x: node.x + inset,
    y: node.y + inset,
    width: Math.max(1, node.width - strokeWidth),
    height: Math.max(1, node.height - strokeWidth),
  };
  // The vertices are generated and fitted so their bounds land exactly on
  // the node's box: an n-gon's or star's own vertex bounds fill the box
  // without shrinking a step on every edit. Figma's rule: the frame is the
  // contract, the outline fills it.
  const points =
    polyKind === "star"
      ? starPoints(box, spikes, innerRatio)
      : regularPolygonPoints(box, sides);
  const bounds = pathBounds(points, strokeWidth);
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    baseWidth: bounds.width,
    baseHeight: bounds.height,
    points: points.map(([px, py]) => [px - bounds.x, py - bounds.y]),
    polyKind,
    ...(polyKind === "star" ? { spikes, innerRatio } : { sides }),
  };
}

/**
 * The arrowhead shapes a two-point stroke can wear, Figma's line-cap menu:
 * the open barbs (the default, absent `arrowCap`), a filled equilateral
 * triangle, a filled dot and a filled diamond.
 */
export const ARROW_CAP = {
  LINES: "lines",
  TRIANGLE: "triangle",
  CIRCLE: "circle",
  DIAMOND: "diamond",
};

/** Barb angle off the shaft's reverse direction, for the open "lines" head. */
const ARROWHEAD_BARB_ANGLE = (25 * Math.PI) / 180;

/**
 * The geometry of one arrowhead: `tip` is where the head points and `angle`
 * the direction of travel (the last segment's). Returns one of:
 * - `{ kind: "lines", barbs }` — two stroke segments from the tip, ±25° off
 *   the reverse direction (the same construction as `arrowheadPoints`);
 * - `{ kind: "polygon", points }` — a closed outline to fill (triangle,
 *   diamond), tip first;
 * - `{ kind: "circle", center, radius }` — a dot whose edge kisses the tip.
 *
 * Filled heads paint in the node's stroke colour: the head reads as part of
 * the shaft whatever the shape.
 */
export function arrowheadGeometry(tip, angle, size, cap = ARROW_CAP.LINES) {
  const back = angle + Math.PI;
  const backX = Math.cos(back);
  const backY = Math.sin(back);
  if (cap === ARROW_CAP.TRIANGLE) {
    // Equilateral: `size` is the height, so the half-width is size·tan(30°).
    const half = size * Math.tan(Math.PI / 6);
    const cx = tip.x + size * backX;
    const cy = tip.y + size * backY;
    const nx = -backY;
    const ny = backX;
    return {
      kind: "polygon",
      points: [
        { x: tip.x, y: tip.y },
        { x: cx + nx * half, y: cy + ny * half },
        { x: cx - nx * half, y: cy - ny * half },
      ],
    };
  }
  if (cap === ARROW_CAP.CIRCLE) {
    const radius = size * 0.35;
    return {
      kind: "circle",
      center: { x: tip.x + radius * backX, y: tip.y + radius * backY },
      radius,
    };
  }
  if (cap === ARROW_CAP.DIAMOND) {
    const half = size * 0.35;
    const mx = tip.x + size * 0.5 * backX;
    const my = tip.y + size * 0.5 * backY;
    const nx = -backY;
    const ny = backX;
    return {
      kind: "polygon",
      points: [
        { x: tip.x, y: tip.y },
        { x: mx + nx * half, y: my + ny * half },
        { x: tip.x + size * backX, y: tip.y + size * backY },
        { x: mx - nx * half, y: my - ny * half },
      ],
    };
  }
  return {
    kind: "lines",
    barbs: [ARROWHEAD_BARB_ANGLE, -ARROWHEAD_BARB_ANGLE].map((offset) => ({
      x: tip.x + size * Math.cos(back + offset),
      y: tip.y + size * Math.sin(back + offset),
    })),
  };
}

/**
 * Whether a node offers its two endpoints as direct-edit handles instead of
 * the bounding-box chrome: a two-point open stroke from the line or arrow
 * tool, sitting unrotated and unsheared. A transformed node keeps the bbox —
 * the endpoints would not track the rotated outline the handles sit on.
 */
export function isEndpointEditable(node) {
  return (
    node?.kind === NODE_KIND.PATH &&
    (node.arrow === true || node.line === true) &&
    // Converted lines retain their style flags, but Bezier anchors are objects
    // and must use pen editing, never the array-only primitive endpoint path.
    node.pen !== true &&
    Array.isArray(node.points) &&
    node.points.length === 2 &&
    node.points.every(Array.isArray) &&
    !node.closed &&
    !node.rotation &&
    !node.shear
  );
}

/**
 * The two endpoints of a two-point path node in document space, with the
 * resize scale applied — the same mapping `drawPathNode`'s `at()` uses.
 */
export function absolutePathEndpoints(node) {
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  return node.points.slice(0, 2).map(([px, py]) => ({
    x: node.x + px * scaleX,
    y: node.y + py * scaleY,
  }));
}

/**
 * The field set that moves one endpoint of a two-point stroke to a new
 * document-space position: the box is recomputed around the two endpoints
 * (padded by the stroke's own width, floored at 1px like every path node) and
 * both points are re-based against it, so the other endpoint stays exactly
 * where it was.
 */
export function movePathEndpoint(node, index, docPoint) {
  const endpoints = absolutePathEndpoints(node);
  endpoints[index] = { x: docPoint.x, y: docPoint.y };
  const bounds = pathBounds(
    endpoints.map((p) => [p.x, p.y]),
    node.strokeWidth ?? 0,
  );
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    baseWidth: bounds.width,
    baseHeight: bounds.height,
    points: endpoints.map((p) => [p.x - bounds.x, p.y - bounds.y]),
  };
}
