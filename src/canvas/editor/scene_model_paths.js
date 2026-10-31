// Seam: Path and pen geometry plus path-node builders.
import { NODE_KIND, newId } from "./scene_model_core.js";

import { BASE_DEFAULTS } from "./scene_model_geometry.js";
import { normalizePathHardness } from "./scene_model_node_builders.js";

export function createPathNode({ points, stroke, strokeWidth, hardness, arrow, arrowSize, arrowStart, arrowEnd, arrowCap, line, poly, polyKind, sides, spikes, innerRatio, closed, fill, strokeDash }) {
  const bounds = pathBounds(points, strokeWidth);
  return {
    ...BASE_DEFAULTS,
    id: newId(),
    kind: NODE_KIND.PATH,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    baseWidth: bounds.width,
    baseHeight: bounds.height,
    points: points.map(([px, py]) => [px - bounds.x, py - bounds.y]),
    stroke,
    strokeWidth,
    hardness: normalizePathHardness(hardness),
    /**
     * An arrowhead at the last point (the arrow tool's two-point strokes).
     * Additive: the field is only ever present when true, so plain strokes
     * serialise exactly as they always have.
     */
    ...(arrow ? { arrow: true } : {}),
    // Independent arrowhead size (doc px); absent means 2.5× the stroke width.
    ...(Number.isFinite(arrowSize) && arrowSize > 0 ? { arrowSize } : {}),
    // An arrowhead at the first point too, for double-headed arrows.
    ...(arrowStart ? { arrowStart: true } : {}),
    // Only stored when off; the renderer reads it as `!== false`.
    ...(arrowEnd === false ? { arrowEnd: false } : {}),
    // The head shape; absent means the default open "lines" barbs.
    ...(arrowCap ? { arrowCap } : {}),
    ...(strokeDash && strokeDash !== "solid" ? { strokeDash } : {}),
    /**
     * The line tool's two-point strokes: the arrow's sibling without the
     * head. Same additive-only-when-true convention as `arrow`.
     */
    ...(line ? { line: true } : {}),
    /**
     * A polygon/star: straight segments through every point, closed, filled.
     * `closed` is the renderer's cue to close the outline; both are additive
     * like `arrow`. The fill only makes sense on a closed poly shape, so it
     * is carried only there (and only when set).
     */
    ...(poly ? { poly: true } : {}),
    /**
     * The generative parameters a poly node was built from — "polygon" with
     * `sides`, or "star" with `spikes` and `innerRatio` — so the properties
     * panel can regenerate the vertices when the user edits them. Additive:
     * shapes drawn before these fields existed simply keep their baked points.
     */
    ...(polyKind ? { polyKind } : {}),
    ...(Number.isFinite(sides) ? { sides } : {}),
    ...(Number.isFinite(spikes) ? { spikes } : {}),
    ...(Number.isFinite(innerRatio) ? { innerRatio } : {}),
    ...(closed ? { closed: true } : {}),
    ...(poly && fill ? { fill } : {}),
  };
}

/** Stroke bounds padded by half the brush width, which straddles the path. */
export function pathBounds(points, strokeWidth) {
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
  const pad = strokeWidth / 2;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, maxX - minX + strokeWidth),
    height: Math.max(1, maxY - minY + strokeWidth),
  };
}

/**
 * One pen anchor: the point plus optional bezier control handles.
 *
 * `in`/`out` are the incoming and outgoing cubic control points, each an
 * offset from the anchor — so moving the anchor carries its handles along.
 * `close` marks the path closed after this anchor.
 */
export function normalisePenAnchor(anchor, originX = 0, originY = 0) {
  const x = anchor.x - originX;
  const y = anchor.y - originY;
  const offset = (handle) => (Array.isArray(handle) && handle.length === 2 ? handle.slice() : null);
  return {
    x,
    y,
    in: offset(anchor.in),
    out: offset(anchor.out),
    close: Boolean(anchor.close),
  };
}

/**
 * Computes exact extrema (min/max) for a 1D cubic bezier curve segment:
 * B(t) = (1-t)^3 * p0 + 3*(1-t)^2*t * p1 + 3*(1-t)*t^2 * p2 + t^3 * p3
 */
export function cubicExtrema1D(p0, p1, p2, p3) {
  let min = Math.min(p0, p3);
  let max = Math.max(p0, p3);
  // Derivative: B'(t) = 3*a*t^2 + 2*b*t + c = 0
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 6 * (p0 - 2 * p1 + p2);
  const c = 3 * (-p0 + p1);
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) {
      const t = -c / b;
      if (t > 0 && t < 1) {
        const val = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
        min = Math.min(min, val);
        max = Math.max(max, val);
      }
    }
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b + sqrtDisc) / (2 * a);
      const t2 = (-b - sqrtDisc) / (2 * a);
      for (const t of [t1, t2]) {
        if (t > 0 && t < 1) {
          const val = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
          min = Math.min(min, val);
          max = Math.max(max, val);
        }
      }
    }
  }
  return { min, max };
}

/** Computes the accurate bounding box of bezier anchors and curves. */
export function penAnchorsBounds(anchors, strokeWidth = 1) {
  if (!anchors || anchors.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < anchors.length; i++) {
    const pt = anchors[i];
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);

    if (i > 0) {
      const from = anchors[i - 1];
      const to = pt;
      if (from.out || to.in) {
        const p0x = from.x;
        const p0y = from.y;
        const p1x = from.x + (from.out ? from.out[0] : 0);
        const p1y = from.y + (from.out ? from.out[1] : 0);
        const p2x = to.x + (to.in ? to.in[0] : 0);
        const p2y = to.y + (to.in ? to.in[1] : 0);
        const p3x = to.x;
        const p3y = to.y;

        const ex = cubicExtrema1D(p0x, p1x, p2x, p3x);
        const ey = cubicExtrema1D(p0y, p1y, p2y, p3y);

        minX = Math.min(minX, ex.min);
        maxX = Math.max(maxX, ex.max);
        minY = Math.min(minY, ey.min);
        maxY = Math.max(maxY, ey.max);
      }
    }
  }

  // Handle closing segment: last anchor back to first anchor.
  const last = anchors[anchors.length - 1];
  if (anchors.length > 1 && last.close && (last.out || anchors[0].in)) {
    const from = last;
    const to = anchors[0];
    const p0x = from.x;
    const p0y = from.y;
    const p1x = from.x + (from.out ? from.out[0] : 0);
    const p1y = from.y + (from.out ? from.out[1] : 0);
    const p2x = to.x + (to.in ? to.in[0] : 0);
    const p2y = to.y + (to.in ? to.in[1] : 0);
    const p3x = to.x;
    const p3y = to.y;
    const ex = cubicExtrema1D(p0x, p1x, p2x, p3x);
    const ey = cubicExtrema1D(p0y, p1y, p2y, p3y);
    minX = Math.min(minX, ex.min);
    maxX = Math.max(maxX, ex.max);
    minY = Math.min(minY, ey.min);
    maxY = Math.max(maxY, ey.max);
  }

  const pad = strokeWidth / 2;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, maxX - minX + strokeWidth),
    height: Math.max(1, maxY - minY + strokeWidth),
  };
}

/**
 * A pen (bezier path) node. Anchors are world-space on entry and stored
 * relative to the node's box, handles relative to their anchor — the same
 * re-basing the freehand path uses, so resizing stretches the curve without
 * rewriting any anchor.
 */
export function createPenNode(anchors, stroke, strokeWidth) {
  const bounds = penAnchorsBounds(anchors, strokeWidth);
  return {
    ...BASE_DEFAULTS,
    id: newId(),
    kind: NODE_KIND.PATH,
    pen: true,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    baseWidth: bounds.width,
    baseHeight: bounds.height,
    points: anchors.map((anchor) => normalisePenAnchor(anchor, bounds.x, bounds.y)),
    fill: "transparent",
    stroke,
    strokeWidth,
    // The stroke style defaults reproduce the historical rendering; older
    // documents simply lack the fields and normalise to the same values (see
    // stroke_style.js).
    strokeCap: "round",
    strokeJoin: "round",
    strokeDash: "solid",
    strokeAlign: "center",
    strokeMiterLimit: 4,
    strokeWidthProfile: "uniform",
    hardness: normalizePathHardness(1),
  };
}

/**
 * Snaps a 2D handle offset [dx, dy] onto the nearest 45° ray,
 * preserving magnitude (Shift angle snapping for pen handles).
 */
export function snapHandle45(handle) {
  if (
    !Array.isArray(handle) ||
    handle.length < 2 ||
    !Number.isFinite(handle[0]) ||
    !Number.isFinite(handle[1])
  ) {
    return handle;
  }
  const [dx, dy] = handle;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return [0, 0];
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const snappedX = Math.round(Math.cos(angle) * length * 1e6) / 1e6;
  const snappedY = Math.round(Math.sin(angle) * length * 1e6) / 1e6;
  return [
    Object.is(snappedX, -0) ? 0 : snappedX,
    Object.is(snappedY, -0) ? 0 : snappedY,
  ];
}

/**
 * Affinity-style Smart Curve tangent calculation for an anchor point.
 * Automatically computes C1 continuous tangent handles based on Catmull-Rom
 * curvature and neighbor chord proportions, producing organic smooth curves.
 */
export function smartSmoothPenAnchor(points, index) {
  if (
    !Array.isArray(points) ||
    points.length === 0 ||
    index < 0 ||
    index >= points.length
  ) {
    return null;
  }
  const anchor = points[index];
  const isClosed = Boolean(
    points[points.length - 1]?.close === true ||
      points.some((p) => p.close === true),
  );
  const n = points.length;

  let prev = null;
  let next = null;

  if (isClosed) {
    prev = points[(index - 1 + n) % n];
    next = points[(index + 1) % n];
  } else {
    prev = index > 0 ? points[index - 1] : null;
    next = index < n - 1 ? points[index + 1] : null;
  }

  let tx = 0;
  let ty = 0;

  if (prev && next) {
    tx = next.x - prev.x;
    ty = next.y - prev.y;
  } else if (prev) {
    tx = anchor.x - prev.x;
    ty = anchor.y - prev.y;
  } else if (next) {
    tx = next.x - anchor.x;
    ty = next.y - anchor.y;
  } else {
    return { ...anchor, in: null, out: null };
  }

  const tLen = Math.hypot(tx, ty);
  if (tLen < 1e-9) {
    return { ...anchor, in: null, out: null };
  }

  const ux = tx / tLen;
  const uy = ty / tLen;

  let inHandle = null;
  let outHandle = null;

  if (prev) {
    const dPrev = Math.hypot(anchor.x - prev.x, anchor.y - prev.y) / 3;
    const inX = Object.is(-ux * dPrev, -0) ? 0 : -ux * dPrev || 0;
    const inY = Object.is(-uy * dPrev, -0) ? 0 : -uy * dPrev || 0;
    inHandle = [Math.round(inX * 1e4) / 1e4, Math.round(inY * 1e4) / 1e4];
  }

  if (next) {
    const dNext = Math.hypot(next.x - anchor.x, next.y - anchor.y) / 3;
    const outX = Object.is(ux * dNext, -0) ? 0 : ux * dNext || 0;
    const outY = Object.is(uy * dNext, -0) ? 0 : uy * dNext || 0;
    outHandle = [Math.round(outX * 1e4) / 1e4, Math.round(outY * 1e4) / 1e4];
  }

  return {
    ...anchor,
    in: inHandle,
    out: outHandle,
  };
}

/**
 * Reverses path direction (Affinity "Reverse Curve"):
 * inverts the anchor order and maps in/out handles so curve geometry
 * is identically traced in the opposite direction.
 */
export function reversePenPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const wasClosed = Boolean(
    points[points.length - 1]?.close === true ||
      points.some((p) => p.close === true),
  );
  const reversed = points
    .slice()
    .reverse()
    .map((p) => ({
      x: p.x,
      y: p.y,
      in: p.out ? [...p.out] : null,
      out: p.in ? [...p.in] : null,
      close: false,
    }));
  if (wasClosed && reversed.length > 0) {
    reversed[reversed.length - 1].close = true;
  }
  return reversed;
}

/**
 * Toggles a path between closed and open (Affinity "Close / Open Curve").
 */
export function toggleClosePenPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const last = points[points.length - 1];
  const isClosed = Boolean(
    last?.close === true || points.some((p) => p.close === true),
  );
  return points.map((p, i) => {
    if (i === points.length - 1) {
      return { ...p, close: !isClosed };
    }
    return p.close ? { ...p, close: false } : p;
  });
}

/**
 * Joins two open pen path nodes at their closest endpoints (Affinity "Join Curves").
 */
export function joinPenNodes(nodeA, nodeB) {
  if (!nodeA?.points?.length || !nodeB?.points?.length) return null;
  const toWorld = (node, p) => ({
    x: node.x + (p.x * (node.baseWidth ? node.width / node.baseWidth : 1)),
    y: node.y + (p.y * (node.baseHeight ? node.height / node.baseHeight : 1)),
    in: p.in ? [p.in[0] * (node.baseWidth ? node.width / node.baseWidth : 1), p.in[1] * (node.baseHeight ? node.height / node.baseHeight : 1)] : null,
    out: p.out ? [p.out[0] * (node.baseWidth ? node.width / node.baseWidth : 1), p.out[1] * (node.baseHeight ? node.height / node.baseHeight : 1)] : null,
    close: false,
  });

  const ptsA = nodeA.points.map((p) => toWorld(nodeA, p));
  const ptsB = nodeB.points.map((p) => toWorld(nodeB, p));

  const startA = ptsA[0];
  const endA = ptsA[ptsA.length - 1];
  const startB = ptsB[0];
  const endB = ptsB[ptsB.length - 1];

  const d1 = Math.hypot(endA.x - startB.x, endA.y - startB.y);
  const d2 = Math.hypot(endA.x - endB.x, endA.y - endB.y);
  const d3 = Math.hypot(startA.x - startB.x, startA.y - startB.y);
  const d4 = Math.hypot(startA.x - endB.x, startA.y - endB.y);

  const minD = Math.min(d1, d2, d3, d4);
  let chainA;
  let chainB;

  if (minD === d1) {
    chainA = ptsA;
    chainB = ptsB;
  } else if (minD === d2) {
    chainA = ptsA;
    chainB = reversePenPoints(ptsB);
  } else if (minD === d3) {
    chainA = reversePenPoints(ptsA);
    chainB = ptsB;
  } else {
    chainA = reversePenPoints(ptsA);
    chainB = reversePenPoints(ptsB);
  }

  const weldThreshold = 2;
  const seamDist = Math.hypot(
    chainA[chainA.length - 1].x - chainB[0].x,
    chainA[chainA.length - 1].y - chainB[0].y,
  );

  let combined;
  if (seamDist <= weldThreshold) {
    const fused = {
      x: (chainA[chainA.length - 1].x + chainB[0].x) / 2,
      y: (chainA[chainA.length - 1].y + chainB[0].y) / 2,
      in: chainA[chainA.length - 1].in,
      out: chainB[0].out,
      close: false,
    };
    combined = [...chainA.slice(0, -1), fused, ...chainB.slice(1)];
  } else {
    combined = [...chainA, ...chainB];
  }

  const bounds = penAnchorsBounds(combined, nodeA.strokeWidth || 1);
  const rebased = combined.map((p) => normalisePenAnchor(p, bounds.x, bounds.y));

  return {
    ...nodeA,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    baseWidth: bounds.width,
    baseHeight: bounds.height,
    points: rebased,
  };
}

/**
 * Auto-smooths a curve by applying Catmull-Rom C1 tangents to specified or all anchors (Affinity "Smooth Curve").
 */
export function smoothPenPoints(points, indices = null) {
  if (!Array.isArray(points) || points.length < 3) return points;
  const isClosed = Boolean(
    points[points.length - 1]?.close === true ||
      points.some((p) => p.close === true),
  );
  const targetIndices = indices
    ? new Set(indices)
    : new Set(
        isClosed
          ? points.map((unusedPoint, i) => i)
          : points.slice(1, -1).map((unusedPoint, i) => i + 1),
      );

  let result = points.slice();
  for (const idx of targetIndices) {
    if (idx >= 0 && idx < result.length) {
      const smoothed = smartSmoothPenAnchor(result, idx);
      result[idx] = smoothed;
    }
  }
  return result;
}

/**
 * Breaks a curve at the specified anchor (Affinity "Break Curve"):
 * - If closed: opens the path with anchorIndex as the new start and end.
 * - If open: splits the path into two separate subpaths at anchorIndex.
 */
export function breakPenPointsAtAnchor(points, anchorIndex) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const isClosed = Boolean(
    points[points.length - 1]?.close === true ||
      points.some((p) => p.close === true),
  );

  if (isClosed) {
    const idx = ((anchorIndex % points.length) + points.length) % points.length;
    // Reorder starting at idx and cycling back to idx
    const unclosed = points.map((p) => ({ ...p, close: false }));
    const reordered = [
      ...unclosed.slice(idx),
      ...unclosed.slice(0, idx),
      { ...unclosed[idx], close: false },
    ];
    reordered[0] = { ...reordered[0], in: null };
    reordered[reordered.length - 1] = { ...reordered[reordered.length - 1], out: null };
    return { kind: "open", points: reordered };
  }

  // Open path: split into two paths at anchorIndex
  if (anchorIndex <= 0 || anchorIndex >= points.length - 1) {
    return null; // endpoints cannot be split
  }

  const pathA = points.slice(0, anchorIndex + 1).map((p) => ({ ...p, close: false }));
  const pathB = points.slice(anchorIndex).map((p) => ({ ...p, close: false }));
  pathA[pathA.length - 1] = { ...pathA[pathA.length - 1], out: null };
  pathB[0] = { ...pathB[0], in: null };
  return { kind: "split", paths: [pathA, pathB] };
}

/**
 * Simplifies a sequence of pen points using Ramer-Douglas-Peucker distance metric (Affinity "Optimize Curve").
 * Preserves curved anchors (handles) and reduces redundant collinear points.
 */
export function simplifyPenPoints(points, tolerance = 1.0) {
  if (!Array.isArray(points) || points.length <= 2) return points;

  // If anchors have curve handles, preserve them
  const hasHandles = (p) => Boolean((p.in && (p.in[0] || p.in[1])) || (p.out && (p.out[0] || p.out[1])));

  function getSqSegDist(p, p1, p2) {
    let x = p1.x;
    let y = p1.y;
    let dx = p2.x - x;
    let dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2.x;
        y = p2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  }

  const sqTolerance = tolerance * tolerance;

  function rdpStep(pts, first, last, simplified) {
    let maxSqDist = sqTolerance;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      if (hasHandles(pts[i])) {
        // Always preserve anchors with handles
        maxSqDist = Infinity;
        index = i;
        break;
      }
      const sqDist = getSqSegDist(pts[i], pts[first], pts[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (maxSqDist > sqTolerance && index !== -1) {
      if (index - first > 1) rdpStep(pts, first, index, simplified);
      simplified.push(pts[index]);
      if (last - index > 1) rdpStep(pts, index, last, simplified);
    }
  }

  const simplified = [points[0]];
  rdpStep(points, 0, points.length - 1, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

/**
 * Iteratively joins multiple open pen path nodes at their closest endpoints (Affinity multi "Join Curves").
 */
export function joinMultiplePenNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];

  let remaining = nodes.slice();
  while (remaining.length > 1) {
    let bestPair = null;
    let minDistance = Infinity;

    // Find the pair of nodes with the closest endpoints
    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const a = remaining[i];
        const b = remaining[j];
        if (!a.points?.length || !b.points?.length) continue;
        const ptsA = a.points;
        const ptsB = b.points;
        const endA = {
          x: a.x + ptsA[ptsA.length - 1].x * (a.baseWidth ? a.width / a.baseWidth : 1),
          y: a.y + ptsA[ptsA.length - 1].y * (a.baseHeight ? a.height / a.baseHeight : 1),
        };
        const startA = {
          x: a.x + ptsA[0].x * (a.baseWidth ? a.width / a.baseWidth : 1),
          y: a.y + ptsA[0].y * (a.baseHeight ? a.height / a.baseHeight : 1),
        };
        const endB = {
          x: b.x + ptsB[ptsB.length - 1].x * (b.baseWidth ? b.width / b.baseWidth : 1),
          y: b.y + ptsB[ptsB.length - 1].y * (b.baseHeight ? b.height / b.baseHeight : 1),
        };
        const startB = {
          x: b.x + ptsB[0].x * (b.baseWidth ? b.width / b.baseWidth : 1),
          y: b.y + ptsB[0].y * (b.baseHeight ? b.height / b.baseHeight : 1),
        };
        const d = Math.min(
          Math.hypot(endA.x - startB.x, endA.y - startB.y),
          Math.hypot(endA.x - endB.x, endA.y - endB.y),
          Math.hypot(startA.x - startB.x, startA.y - startB.y),
          Math.hypot(startA.x - endB.x, startA.y - endB.y),
        );
        if (d < minDistance) {
          minDistance = d;
          bestPair = [i, j];
        }
      }
    }

    if (!bestPair) break;
    const [i, j] = bestPair;
    const nodeA = remaining[i];
    const nodeB = remaining[j];
    const joined = joinPenNodes(nodeA, nodeB);
    if (!joined) break;

    remaining = remaining.filter((unusedNode, idx) => idx !== i && idx !== j);
    remaining.push(joined);
  }

  return remaining[0] ?? null;
}
