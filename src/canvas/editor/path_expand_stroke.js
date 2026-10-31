// Clean-room Expand Stroke to Path Engine (Milestone 2)
// Architecture:
// - Evaluates normal offset curves on open and closed paths
// - Implements Butt, Round, and Square stroke caps
// - Implements Miter (with miterLimit fallback to Bevel), Round, and Bevel joins
// - Supports Center, Inside, and Outside stroke alignments
// - Supports variable width profiles (uniform, taper_in, taper_out, oval/taper_both)
// - Dissolves self-intersections and swallowtails via boolean polygon kernel

import { NODE_KIND } from "./scene_model_core.js";
import {
  convertShapeToPathNode,
  canConvertToPath,
} from "./shape_to_path.js";
import {
  penAnchorsBounds,
  normalisePenAnchor,
  simplifyPenPoints,
  smartSmoothPenAnchor,
} from "./scene_model_paths.js";
import {
  booleanSubtract,
  booleanUnion,
  reconstructBezierPath,
  clipMultiLoopShapes,
  normalizeNodeToDocPenAnchors,
  tessellateNodeToWorldPolygons,
  polygonSignedArea,
  ensurePositiveOrientation,
} from "./path_boolean_engine.js";
import { offsetClosedPenAnchors } from "./path_offset.js";

const EPSILON = 1e-6;
const KAPPA = 4 * (Math.SQRT2 - 1) / 3; // ~0.5522847498 for exact 90-degree Bezier arc

/**
 * Normalizes any stroke node to doc-space anchors.
 */
function toDocSpacePoints(node) {
  if (!node || !Array.isArray(node.points)) return [];
  const normalized = normalizeNodeToDocPenAnchors(node);
  if (normalized && normalized.length === node.points.length) {
    return normalized;
  }
  const originX = node.x ?? 0;
  const originY = node.y ?? 0;
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  return node.points.map((p) => ({
    x: originX + p.x * scaleX,
    y: originY + p.y * scaleY,
    in: p.in ? [p.in[0] * scaleX, p.in[1] * scaleY] : null,
    out: p.out ? [p.out[0] * scaleX, p.out[1] * scaleY] : null,
    close: Boolean(p.close),
  }));
}

/**
 * Samples a cubic Bezier segment into points.
 */
function sampleCubic(p0, p1, p2, p3, steps = 16) {
  const pts = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    pts.push({
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
      t,
    });
  }
  return pts;
}

/**
 * Flattens an open path into a dense series of points with tangents.
 */
function flattenOpenPath(docPoints) {
  if (docPoints.length < 2) return docPoints.map((p) => ({ x: p.x, y: p.y }));
  const dense = [];

  for (let i = 0; i < docPoints.length - 1; i += 1) {
    const pA = docPoints[i];
    const pB = docPoints[i + 1];
    const hasCurve = Boolean(pA.out || pB.in);

    if (!hasCurve) {
      dense.push({ x: pA.x, y: pA.y });
    } else {
      const p0 = { x: pA.x, y: pA.y };
      const p1 = {
        x: pA.x + (pA.out ? pA.out[0] : 0),
        y: pA.y + (pA.out ? pA.out[1] : 0),
      };
      const p2 = {
        x: pB.x + (pB.in ? pB.in[0] : 0),
        y: pB.y + (pB.in ? pB.in[1] : 0),
      };
      const p3 = { x: pB.x, y: pB.y };
      const sub = sampleCubic(p0, p1, p2, p3, 20);
      for (let s = 0; s < sub.length - 1; s += 1) {
        dense.push(sub[s]);
      }
    }
  }

  const last = docPoints[docPoints.length - 1];
  dense.push({ x: last.x, y: last.y });
  return dense;
}

/**
 * Resolves local stroke width along path parameter t (0..1).
 */
function resolveWidthAt(baseWidth, t, profile) {
  const p = (profile || "uniform").toLowerCase().replace(/-/g, "_");
  if (p === "taper_in" || p === "taperin") {
    return baseWidth * (0.05 + 0.95 * t);
  }
  if (p === "taper_out" || p === "taperout") {
    return baseWidth * (0.05 + 0.95 * (1 - t));
  }
  if (p === "oval" || p === "taper_both" || p === "taperboth") {
    return baseWidth * (0.05 + 0.95 * Math.sin(Math.PI * t));
  }
  return baseWidth;
}

/**
 * Expands an open straight line segment [p0, p1] with exact cap geometries.
 */
function expandStraightLine(p0, p1, strokeWidth, options) {
  const cap = options.strokeCap || "butt";
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);

  if (len < EPSILON) {
    // Degenerate zero-length line: circle or box
    const r = strokeWidth / 2;
    return [
      { x: p0.x - r, y: p0.y - r, close: false },
      { x: p0.x + r, y: p0.y - r, close: false },
      { x: p0.x + r, y: p0.y + r, close: false },
      { x: p0.x - r, y: p0.y + r, close: true },
    ];
  }

  const tx = dx / len;
  const ty = dy / len;
  const nx = -ty;
  const ny = tx;
  const h = strokeWidth / 2;

  // Left and Right normal offsets
  // Left is p - h*n, Right is p + h*n
  // For horizontal line (0,0)->(100,0): tx=1, ty=0, nx=0, ny=1.
  // We want y to go from -h to +h.
  // Top: (x, -h), Bottom: (x, +h)
  const left0 = { x: p0.x - h * nx, y: p0.y - h * ny };
  const left1 = { x: p1.x - h * nx, y: p1.y - h * ny };
  const right1 = { x: p1.x + h * nx, y: p1.y + h * ny };
  const right0 = { x: p0.x + h * nx, y: p0.y + h * ny };

  const anchors = [];

  if (cap === "square") {
    // Square caps extend by h*t along the tangent
    const ext0 = { x: -h * tx, y: -h * ty };
    const ext1 = { x: h * tx, y: h * ty };

    anchors.push({ x: left0.x + ext0.x, y: left0.y + ext0.y, in: null, out: null, close: false });
    anchors.push({ x: left1.x + ext1.x, y: left1.y + ext1.y, in: null, out: null, close: false });
    anchors.push({ x: right1.x + ext1.x, y: right1.y + ext1.y, in: null, out: null, close: false });
    anchors.push({ x: right0.x + ext0.x, y: right0.y + ext0.y, in: null, out: null, close: true });
    return anchors;
  }

  if (cap === "round") {
    // Semicircular Bezier caps with radius h
    const k = KAPPA * h;

    // Start at left0
    anchors.push({
      x: left0.x,
      y: left0.y,
      in: [-k * tx, -k * ty],
      out: null,
      close: false,
    });

    // Straight segment to left1
    anchors.push({
      x: left1.x,
      y: left1.y,
      in: null,
      out: [k * tx, k * ty],
      close: false,
    });

    // End apex
    const apex1 = { x: p1.x + h * tx, y: p1.y + h * ty };
    anchors.push({
      x: apex1.x,
      y: apex1.y,
      in: [-k * nx, -k * ny],
      out: [k * nx, k * ny],
      close: false,
    });

    // Right1
    anchors.push({
      x: right1.x,
      y: right1.y,
      in: [k * tx, k * ty],
      out: null,
      close: false,
    });

    // Straight segment to right0
    anchors.push({
      x: right0.x,
      y: right0.y,
      in: null,
      out: [-k * tx, -k * ty],
      close: false,
    });

    // Start apex
    const apex0 = { x: p0.x - h * tx, y: p0.y - h * ty };
    anchors.push({
      x: apex0.x,
      y: apex0.y,
      in: [k * nx, k * ny],
      out: [-k * nx, -k * ny],
      close: true,
    });

    return anchors;
  }

  // Butt cap: exact rectangle [0..L]
  anchors.push({ x: left0.x, y: left0.y, in: null, out: null, close: false });
  anchors.push({ x: left1.x, y: left1.y, in: null, out: null, close: false });
  anchors.push({ x: right1.x, y: right1.y, in: null, out: null, close: false });
  anchors.push({ x: right0.x, y: right0.y, in: null, out: null, close: true });
  return anchors;
}

/**
 * Builds offset ribbon polygon for a general open polyline / flattened curve.
 */
function expandOpenPolyline(pts, strokeWidth, options) {
  const n = pts.length;
  if (n < 2) return [];

  const cap = options.strokeCap || "butt";
  const join = options.strokeJoin || "miter";
  const miterLimit = options.strokeMiterLimit || 4;
  const profile = options.strokeWidthProfile || "uniform";

  // Compute segment unit tangents and normals
  const segs = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy);
    if (len < EPSILON) continue;
    const tx = dx / len;
    const ty = dy / len;
    segs.push({
      i,
      p0: pts[i],
      p1: pts[i + 1],
      tx,
      ty,
      nx: -ty,
      ny: tx,
      len,
    });
  }

  if (segs.length === 0) return [];
  if (segs.length === 1 && profile === "uniform") {
    return expandStraightLine(segs[0].p0, segs[0].p1, strokeWidth, options);
  }

  // Calculate arc lengths for parameter t
  let totalLength = 0;
  for (const s of segs) totalLength += s.len;
  let runningLen = 0;
  for (const s of segs) {
    s.t0 = runningLen / totalLength;
    runningLen += s.len;
    s.t1 = runningLen / totalLength;
  }

  const leftSide = [];
  const rightSide = [];

  // Start point
  const s0 = segs[0];
  const h0 = resolveWidthAt(strokeWidth, s0.t0, profile) / 2;
  leftSide.push({ x: s0.p0.x - h0 * s0.nx, y: s0.p0.y - h0 * s0.ny });
  rightSide.push({ x: s0.p0.x + h0 * s0.nx, y: s0.p0.y + h0 * s0.ny });

  // Interior vertices with joins
  for (let k = 0; k < segs.length - 1; k += 1) {
    const sA = segs[k];
    const sB = segs[k + 1];
    const pVertex = sA.p1;
    const h = resolveWidthAt(strokeWidth, sA.t1, profile) / 2;

    const dot = sA.nx * sB.nx + sA.ny * sB.ny;
    const cross = sA.tx * sB.ty - sA.ty * sB.tx; // > 0 = turning left, < 0 = turning right

    if (Math.abs(cross) < 1e-4) {
      // Collinear: straight continuation
      leftSide.push({ x: pVertex.x - h * sA.nx, y: pVertex.y - h * sA.ny });
      rightSide.push({ x: pVertex.x + h * sA.nx, y: pVertex.y + h * sA.ny });
      continue;
    }

    const cosHalf = Math.sqrt(Math.max(0, (1 + dot) / 2));
    const miterRatio = cosHalf > EPSILON ? 1 / cosHalf : Infinity;

    // Left vertex offsets
    const lA = { x: pVertex.x - h * sA.nx, y: pVertex.y - h * sA.ny };
    const lB = { x: pVertex.x - h * sB.nx, y: pVertex.y - h * sB.ny };
    // Right vertex offsets
    const rA = { x: pVertex.x + h * sA.nx, y: pVertex.y + h * sA.ny };
    const rB = { x: pVertex.x + h * sB.nx, y: pVertex.y + h * sB.ny };

    if (cross > 0) {
      // Turning left: Left side is inside corner, Right side is outside corner
      const bisectorX = sA.nx + sB.nx;
      const bisectorY = sA.ny + sB.ny;
      const bisectLen = Math.hypot(bisectorX, bisectorY);
      const lInner =
        bisectLen > EPSILON
          ? {
              x: pVertex.x - (bisectorX / (1 + dot)) * h,
              y: pVertex.y - (bisectorY / (1 + dot)) * h,
            }
          : lA;
      leftSide.push(lInner);

      // Outside (Right side) join
      if (join === "miter" && miterRatio <= miterLimit) {
        const rMiter = {
          x: pVertex.x + (bisectorX / (1 + dot)) * h,
          y: pVertex.y + (bisectorY / (1 + dot)) * h,
        };
        rightSide.push(rMiter);
      } else if (join === "round") {
        const normDirX = bisectorX / (bisectLen || 1);
        const normDirY = bisectorY / (bisectLen || 1);
        const apex = {
          x: pVertex.x + normDirX * h,
          y: pVertex.y + normDirY * h,
        };
        const tanX = -normDirY;
        const tanY = normDirX;
        const k = 0.552 * h;
        apex.in = [-k * tanX, -k * tanY];
        apex.out = [k * tanX, k * tanY];
        rightSide.push(apex);
      } else {
        // Bevel join
        rightSide.push(rA, rB);
      }
    } else {
      // Turning right: Right side is inside corner, Left side is outside corner
      const bisectorX = sA.nx + sB.nx;
      const bisectorY = sA.ny + sB.ny;
      const bisectLen = Math.hypot(bisectorX, bisectorY);
      const rInner =
        bisectLen > EPSILON
          ? {
              x: pVertex.x + (bisectorX / (1 + dot)) * h,
              y: pVertex.y + (bisectorY / (1 + dot)) * h,
            }
          : rA;
      rightSide.push(rInner);

      // Outside (Left side) join
      if (join === "miter" && miterRatio <= miterLimit) {
        const lMiter = {
          x: pVertex.x - (bisectorX / (1 + dot)) * h,
          y: pVertex.y - (bisectorY / (1 + dot)) * h,
        };
        leftSide.push(lMiter);
      } else if (join === "round") {
        const normDirX = bisectorX / (bisectLen || 1);
        const normDirY = bisectorY / (bisectLen || 1);
        const apex = {
          x: pVertex.x - normDirX * h,
          y: pVertex.y - normDirY * h,
        };
        const tanX = normDirY;
        const tanY = -normDirX;
        const k = 0.552 * h;
        apex.in = [-k * tanX, -k * tanY];
        apex.out = [k * tanX, k * tanY];
        leftSide.push(apex);
      } else {
        // Bevel join
        leftSide.push(lA, lB);
      }
    }
  }

  // End vertex
  const sLast = segs[segs.length - 1];
  const hEnd = resolveWidthAt(strokeWidth, sLast.t1, profile) / 2;
  leftSide.push({ x: sLast.p1.x - hEnd * sLast.nx, y: sLast.p1.y - hEnd * sLast.ny });
  rightSide.push({ x: sLast.p1.x + hEnd * sLast.nx, y: sLast.p1.y + hEnd * sLast.ny });

  // Connect loop with Caps
  const loop = [];
  // Left side going forward
  loop.push(...leftSide);

  // End cap
  if (cap === "square") {
    const ext = { x: hEnd * sLast.tx, y: hEnd * sLast.ty };
    const pEndL = leftSide[leftSide.length - 1];
    const pEndR = rightSide[rightSide.length - 1];
    loop.push({ x: pEndL.x + ext.x, y: pEndL.y + ext.y });
    loop.push({ x: pEndR.x + ext.x, y: pEndR.y + ext.y });
  } else if (cap === "round") {
    const steps = 6;
    for (let st = 1; st < steps; st += 1) {
      const angle = (st / steps) * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // from -nx to +nx via +tx
      const vx = -cos * sLast.nx + sin * sLast.tx;
      const vy = -cos * sLast.ny + sin * sLast.ty;
      loop.push({
        x: sLast.p1.x + vx * hEnd,
        y: sLast.p1.y + vy * hEnd,
      });
    }
  }

  // Right side going backward
  for (let r = rightSide.length - 1; r >= 0; r -= 1) {
    loop.push(rightSide[r]);
  }

  // Start cap
  if (cap === "square") {
    const ext = { x: -h0 * s0.tx, y: -h0 * s0.ty };
    const pStartR = rightSide[0];
    const pStartL = leftSide[0];
    loop.push({ x: pStartR.x + ext.x, y: pStartR.y + ext.y });
    loop.push({ x: pStartL.x + ext.x, y: pStartL.y + ext.y });
  } else if (cap === "round") {
    const steps = 6;
    for (let st = 1; st < steps; st += 1) {
      const angle = (st / steps) * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // from +nx to -nx via -tx
      const vx = cos * s0.nx - sin * s0.tx;
      const vy = cos * s0.ny - sin * s0.ty;
      loop.push({
        x: s0.p0.x + vx * h0,
        y: s0.p0.y + vy * h0,
      });
    }
  }

  // Turn into anchors
  return loop.map((pt, i) => ({
    x: pt.x,
    y: pt.y,
    in: pt.in ? [pt.in[0], pt.in[1]] : null,
    out: pt.out ? [pt.out[0], pt.out[1]] : null,
    close: i === loop.length - 1,
  }));
}

/**
 * Expands a closed polygon or stroked path by offsetting outer and inner contours.
 */
function expandClosedShape(node, strokeWidth, options) {
  const align = options.strokeAlign || "center";
  let outerDist = strokeWidth / 2;
  let innerDist = -strokeWidth / 2;

  if (align === "inside") {
    outerDist = 0;
    innerDist = -strokeWidth;
  } else if (align === "outside") {
    outerDist = strokeWidth;
    innerDist = 0;
  }

  if (node.kind === "rect") {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const w = node.width ?? 100;
    const h = node.height ?? 100;

    const outerRect = {
      ...node,
      id: "outer-rect",
      x: x - outerDist,
      y: y - outerDist,
      width: Math.max(1, w + 2 * outerDist),
      height: Math.max(1, h + 2 * outerDist),
      strokeWidth: 0,
      fill: node.stroke || "#000",
    };

    const innerW = w + 2 * innerDist;
    const innerH = h + 2 * innerDist;

    if (innerW <= 0 || innerH <= 0) {
      // Solid filled box when inner collapses
      return convertShapeToPathNode(outerRect);
    }

    const innerRect = {
      ...node,
      id: "inner-rect",
      x: x - innerDist,
      y: y - innerDist,
      width: innerW,
      height: innerH,
      strokeWidth: 0,
    };

    const outerPath = convertShapeToPathNode(outerRect);
    const innerPath = convertShapeToPathNode(innerRect);
    const subtracted = booleanSubtract([outerPath, innerPath]);
    return subtracted || outerPath;
  }

  if (node.kind === "ellipse") {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const w = node.width ?? 100;
    const h = node.height ?? 100;

    const outerEllipse = {
      ...node,
      id: "outer-ellipse",
      x: x - outerDist,
      y: y - outerDist,
      width: Math.max(1, w + 2 * outerDist),
      height: Math.max(1, h + 2 * outerDist),
      strokeWidth: 0,
      fill: node.stroke || "#000",
    };

    const innerW = w + 2 * innerDist;
    const innerH = h + 2 * innerDist;

    if (innerW <= 0 || innerH <= 0) {
      return convertShapeToPathNode(outerEllipse);
    }

    const innerEllipse = {
      ...node,
      id: "inner-ellipse",
      x: x - innerDist,
      y: y - innerDist,
      width: innerW,
      height: innerH,
      strokeWidth: 0,
    };

    const outerPath = convertShapeToPathNode(outerEllipse);
    const innerPath = convertShapeToPathNode(innerEllipse);
    const subtracted = booleanSubtract([outerPath, innerPath]);
    return subtracted || outerPath;
  }

  // General closed pen path
  const pathNode = node.kind === "path" ? node : convertShapeToPathNode(node);
  const docAnchors = toDocSpacePoints(pathNode);

  if (docAnchors.length < 3) return pathNode;

  const outerRes = outerDist === 0
    ? { ok: true, anchors: docAnchors }
    : offsetClosedPenAnchors(docAnchors, outerDist);

  const innerRes = innerDist === 0
    ? { ok: true, anchors: docAnchors }
    : offsetClosedPenAnchors(docAnchors, innerDist);

  if (!outerRes.ok && !innerRes.ok) {
    return pathNode;
  }

  if (outerRes.ok && (!innerRes.ok || innerDist === 0 && align === "outside")) {
    if (align === "outside" && innerRes.ok) {
      const outerPath = reconstructBezierPath([outerRes.anchors], node);
      const innerPath = reconstructBezierPath([innerRes.anchors], node);
      return booleanSubtract([outerPath, innerPath]) || outerPath;
    }
    return reconstructBezierPath([outerRes.anchors], node);
  }

  if (outerRes.ok && innerRes.ok) {
    const outerPath = reconstructBezierPath([outerRes.anchors], node);
    const innerPath = reconstructBezierPath([innerRes.anchors], node);
    const subtracted = booleanSubtract([outerPath, innerPath]);
    return subtracted || outerPath;
  }

  return pathNode;
}

/**
 * Main Public API: Expands any stroked SceneNode into a closed outline pen path.
 *
 * @param {object} node - Input SceneNode with stroke properties
 * @returns {object} Clean NODE_KIND.PATH node with fill = node.stroke and strokeWidth = 0
 */
export function expandStrokeToPathNode(node) {
  if (!node) return null;

  const strokeWidth = node.strokeWidth ?? 1;
  const strokeColor = node.stroke || "#3b82f6";
  const strokeCap = node.strokeCap || "butt";
  const strokeJoin = node.strokeJoin || "miter";
  const strokeAlign = node.strokeAlign || "center";
  const strokeMiterLimit = node.strokeMiterLimit || 4;
  const strokeWidthProfile = node.strokeWidthProfile || "uniform";

  const options = {
    strokeCap,
    strokeJoin,
    strokeAlign,
    strokeMiterLimit,
    strokeWidthProfile,
  };

  // Convert non-path primitives if possible
  if (node.kind !== "path" && canConvertToPath(node)) {
    const closedExpanded = expandClosedShape(node, strokeWidth, options);
    if (closedExpanded) {
      return {
        ...closedExpanded,
        fill: strokeColor,
        stroke: "transparent",
        strokeWidth: 0,
      };
    }
  }

  // Path handling
  const rawPoints = Array.isArray(node.points) ? node.points : [];
  if (rawPoints.length === 0) {
    return {
      ...node,
      kind: NODE_KIND.PATH,
      pen: true,
      fill: strokeColor,
      stroke: "transparent",
      strokeWidth: 0,
    };
  }

  if (rawPoints.length === 1) {
    return {
      ...node,
      kind: NODE_KIND.PATH,
      pen: true,
      fill: strokeColor,
      stroke: "transparent",
      strokeWidth: 0,
    };
  }

  const isClosed = Boolean(
    rawPoints[rawPoints.length - 1].close || node.poly,
  );

  if (isClosed) {
    const closedExpanded = expandClosedShape(node, strokeWidth, options);
    if (closedExpanded) {
      return {
        ...closedExpanded,
        fill: strokeColor,
        stroke: "transparent",
        strokeWidth: 0,
      };
    }
  }

  // Open path ribbon expansion
  const docPoints = toDocSpacePoints(node);

  let outlineAnchors = [];
  if (docPoints.length === 2 && !docPoints[0].out && !docPoints[1].in && strokeWidthProfile === "uniform") {
    outlineAnchors = expandStraightLine(docPoints[0], docPoints[1], strokeWidth, options);
  } else {
    const dense = flattenOpenPath(docPoints);
    outlineAnchors = expandOpenPolyline(dense, strokeWidth, options);
  }

  if (outlineAnchors.length === 0) {
    return null;
  }

  // If curve or hairpin swallowtails exist, dissolve them using boolean clipping
  const loopPts = outlineAnchors.map((p) => ({ x: p.x, y: p.y }));
  let cleanLoops = [loopPts];
  try {
    const dissolved = clipMultiLoopShapes([loopPts], [loopPts], "union");
    if (dissolved && dissolved.length > 0) {
      cleanLoops = dissolved;
    }
  } catch {
    // Keep baseline loop if clip solver has degenerate collinear overlap
  }

  if (docPoints.some((p) => p.out || p.in)) {
    const bezierNode = reconstructBezierPath(cleanLoops, node);
    if (bezierNode) {
      return {
        ...bezierNode,
        fill: strokeColor,
        stroke: "transparent",
        strokeWidth: 0,
      };
    }
  }

  const bounds = penAnchorsBounds(outlineAnchors, 0);
  const rebasedPoints = outlineAnchors.map((a) =>
    normalisePenAnchor(a, bounds.x, bounds.y),
  );

  return {
    ...node,
    id: `stroke-exp-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    kind: NODE_KIND.PATH,
    pen: true,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    baseWidth: bounds.width,
    baseHeight: bounds.height,
    rotation: 0,
    shear: 0,
    flipH: false,
    flipV: false,
    points: rebasedPoints,
    fill: strokeColor,
    fillOpacity: node.strokeOpacity ?? 1,
    fillRule: "evenodd",
    stroke: "transparent",
    strokeWidth: 0,
    visible: node.visible !== false,
  };
}
