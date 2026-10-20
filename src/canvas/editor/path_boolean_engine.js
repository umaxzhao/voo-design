// Clean-room 2D Destructive Boolean Path Operations Engine (Milestone 1)
// Architecture: Martinez-Rueda & Greiner-Hormann hybrid with de Casteljau adaptive tessellation,
// segment-segment intersection & collinear interval solver, and Catmull-Rom C1 curve reconstruction.

import { NODE_KIND } from "./scene_model_core.js";
import {
  canConvertToPath,
  convertShapeToPathNode,
  convertShapeToPenAnchors,
} from "./shape_to_path.js";
import { fromNodeLocal } from "./scene_geometry_transform.js";
import {
  penAnchorsBounds,
  normalisePenAnchor,
  simplifyPenPoints,
  smartSmoothPenAnchor,
} from "./scene_model_paths.js";

const EPSILON = 1e-6;
const CHORD_TOLERANCE = 0.25; // Sub-pixel chord error threshold (< 0.25px)
const MAX_SUBDIVISION_DEPTH = 10;
const RDP_SIMPLIFY_TOLERANCE = 0.35; // Sharp corner preservation threshold

// --- Utility Math & Geometry ---

export function ptEq(p, q, eps = 1e-4) {
  return Math.hypot(p.x - q.x, p.y - q.y) <= eps;
}

function roundCoord(v) {
  return Math.round(v * 1e5) / 1e5;
}

function ptKey(p) {
  return `${roundCoord(p.x)},${roundCoord(p.y)}`;
}

/** Computes signed area of a 2D polygon using the Shoelace formula. */
export function polygonSignedArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % n];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

/** Ensures polygon orientation has positive signed area (consistent winding). */
export function ensurePositiveOrientation(points) {
  if (!points || points.length < 3) return points;
  if (polygonSignedArea(points) < 0) {
    return points.slice().reverse();
  }
  return points.slice();
}

/** Tests if a 2D point is inside a polygon ring using horizontal ray-casting. */
export function isPointInPolygon(pt, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  const n = ring.length;
  const px = pt.x;
  const py = pt.y + 1e-9; // Avoid horizontal edge degeneracy

  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// --- Adaptive de Casteljau Curve Tessellation ---

/**
 * Adaptively tessellates a cubic Bezier segment into polylines using de Casteljau
 * subdivision, ensuring chord error <= tolerance.
 */
export function adaptiveFlattenCubicSegment(
  p0,
  p1,
  p2,
  p3,
  tolerance = CHORD_TOLERANCE,
  maxDepth = MAX_SUBDIVISION_DEPTH,
) {
  const points = [];

  function isFlat(a, b, c, d) {
    const dx = d.x - a.x;
    const dy = d.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 1e-12) {
      const d1Sq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const d2Sq = (c.x - a.x) ** 2 + (c.y - a.y) ** 2;
      return Math.max(d1Sq, d2Sq) <= tolerance * tolerance;
    }

    const invLen = 1 / Math.sqrt(lenSq);
    const d1 = Math.abs(dy * b.x - dx * b.y + d.x * a.y - d.y * a.x) * invLen;
    const d2 = Math.abs(dy * c.x - dx * c.y + d.x * a.y - d.y * a.x) * invLen;

    if (Math.max(d1, d2) > tolerance) return false;

    const dotB = ((b.x - a.x) * dx + (b.y - a.y) * dy) / lenSq;
    const dotC = ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq;
    return dotB >= -0.05 && dotB <= 1.05 && dotC >= -0.05 && dotC <= 1.05;
  }

  function splitAtHalf(a, b, c, d) {
    const ab = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    const bc = { x: (b.x + c.x) * 0.5, y: (b.y + c.y) * 0.5 };
    const cd = { x: (c.x + d.x) * 0.5, y: (c.y + d.y) * 0.5 };
    const abc = { x: (ab.x + bc.x) * 0.5, y: (ab.y + bc.y) * 0.5 };
    const bcd = { x: (bc.x + cd.x) * 0.5, y: (bc.y + cd.y) * 0.5 };
    const abcd = { x: (abc.x + bcd.x) * 0.5, y: (abc.y + bcd.y) * 0.5 };

    return {
      left: [a, ab, abc, abcd],
      right: [abcd, bcd, cd, d],
    };
  }

  const stack = [{ p: [p0, p1, p2, p3], depth: 0 }];

  while (stack.length > 0) {
    const {
      p: [a, b, c, d],
      depth,
    } = stack.pop();

    if (depth >= maxDepth || isFlat(a, b, c, d)) {
      points.push({ x: d.x, y: d.y });
    } else {
      const { left, right } = splitAtHalf(a, b, c, d);
      stack.push({ p: right, depth: depth + 1 });
      stack.push({ p: left, depth: depth + 1 });
    }
  }

  return points;
}

// --- Shape Normalization ---

/**
 * Normalizes any SceneNode into document-space pen anchors.
 */
export function normalizeNodeToDocPenAnchors(node) {
  if (!node || typeof node !== "object") return null;

  let penNode = node;
  if (node.kind === NODE_KIND.PATH && node.pen === true) {
    penNode = node;
  } else if (canConvertToPath(node)) {
    penNode = convertShapeToPathNode(node) ?? node;
  } else if (node.kind === NODE_KIND.PATH && Array.isArray(node.points)) {
    penNode = { ...node, pen: true };
  } else {
    const anchors = convertShapeToPenAnchors(node);
    if (anchors && anchors.length > 0) {
      penNode = {
        ...node,
        kind: NODE_KIND.PATH,
        pen: true,
        baseWidth: node.width ?? 1,
        baseHeight: node.height ?? 1,
        points: anchors,
      };
    } else {
      return null;
    }
  }

  const rawPoints = Array.isArray(penNode.points) ? penNode.points : [];
  if (rawPoints.length === 0) return null;

  // Check if rawPoints are already in document coordinates
  let isDocSpace = false;
  if (penNode.pen && (penNode.x || penNode.y)) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of rawPoints) {
      const px = Array.isArray(pt) ? pt[0] : (pt?.x ?? 0);
      const py = Array.isArray(pt) ? pt[1] : (pt?.y ?? 0);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const nodeW = penNode.width || 1;
    const nodeH = penNode.height || 1;
    if (
      (minX >= penNode.x - 1e-4 && maxX > nodeW + 1e-4) ||
      (minY >= penNode.y - 1e-4 && maxY > nodeH + 1e-4)
    ) {
      isDocSpace = true;
    }
  }

  const scaleX = penNode.baseWidth ? penNode.width / penNode.baseWidth : 1;
  const scaleY = penNode.baseHeight ? penNode.height / penNode.baseHeight : 1;

  const docAnchors = rawPoints.map((anchor, i) => {
    const ax = Array.isArray(anchor) ? anchor[0] : (anchor?.x ?? 0);
    const ay = Array.isArray(anchor) ? anchor[1] : (anchor?.y ?? 0);

    let docP;
    if (isDocSpace) {
      docP = { x: ax, y: ay };
    } else {
      const localX = ax * scaleX;
      const localY = ay * scaleY;
      docP = fromNodeLocal(penNode, { x: localX, y: localY });
    }

    let inHandle = null;
    if (
      anchor &&
      Array.isArray(anchor.in) &&
      (anchor.in[0] !== 0 || anchor.in[1] !== 0)
    ) {
      if (isDocSpace) {
        inHandle = [anchor.in[0], anchor.in[1]];
      } else {
        const localX = ax * scaleX;
        const localY = ay * scaleY;
        const hLocal = {
          x: localX + anchor.in[0] * scaleX,
          y: localY + anchor.in[1] * scaleY,
        };
        const hDoc = fromNodeLocal(penNode, hLocal);
        inHandle = [hDoc.x - docP.x, hDoc.y - docP.y];
      }
    }

    let outHandle = null;
    if (
      anchor &&
      Array.isArray(anchor.out) &&
      (anchor.out[0] !== 0 || anchor.out[1] !== 0)
    ) {
      if (isDocSpace) {
        outHandle = [anchor.out[0], anchor.out[1]];
      } else {
        const localX = ax * scaleX;
        const localY = ay * scaleY;
        const hLocal = {
          x: localX + anchor.out[0] * scaleX,
          y: localY + anchor.out[1] * scaleY,
        };
        const hDoc = fromNodeLocal(penNode, hLocal);
        outHandle = [hDoc.x - docP.x, hDoc.y - docP.y];
      }
    }

    const isClose = Boolean(anchor?.close || i === rawPoints.length - 1);

    return {
      x: docP.x,
      y: docP.y,
      in: inHandle,
      out: outHandle,
      close: isClose,
    };
  });

  return { docAnchors, baseNode: penNode };
}

function tessellateAnchorLoop(anchors) {
  if (!anchors || anchors.length < 2) return [];
  const polyline = [];
  const count = anchors.length;

  for (let i = 0; i < count; i += 1) {
    const from = anchors[i];
    const to = anchors[(i + 1) % count];
    const hasCurve = Boolean(from.out || to.in);

    polyline.push({ x: from.x, y: from.y });

    if (hasCurve) {
      const p0 = { x: from.x, y: from.y };
      const p1 = {
        x: from.x + (from.out ? from.out[0] : 0),
        y: from.y + (from.out ? from.out[1] : 0),
      };
      const p2 = {
        x: to.x + (to.in ? to.in[0] : 0),
        y: to.y + (to.in ? to.in[1] : 0),
      };
      const p3 = { x: to.x, y: to.y };

      const subPoints = adaptiveFlattenCubicSegment(p0, p1, p2, p3);
      for (let s = 0; s < subPoints.length - 1; s += 1) {
        polyline.push(subPoints[s]);
      }
    }
  }

  // Deduplicate adjacent vertices within EPSILON
  const deduped = [];
  for (const pt of polyline) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > EPSILON) {
      deduped.push(pt);
    }
  }
  while (
    deduped.length > 2 &&
    Math.hypot(
      deduped[0].x - deduped[deduped.length - 1].x,
      deduped[0].y - deduped[deduped.length - 1].y,
    ) <= EPSILON
  ) {
    deduped.pop();
  }

  return ensurePositiveOrientation(deduped);
}

/**
 * Tessellates any SceneNode into an array of closed world-space polygon rings.
 */
export function tessellateNodeToWorldPolygons(node) {
  const norm = normalizeNodeToDocPenAnchors(node);
  if (!norm || !norm.docAnchors || norm.docAnchors.length < 2) return [];

  const anchors = norm.docAnchors;
  const loops = [];
  let contourStart = 0;

  while (contourStart < anchors.length) {
    let i = contourStart;
    const subAnchors = [];
    while (i < anchors.length) {
      subAnchors.push(anchors[i]);
      if (anchors[i].close) {
        i += 1;
        break;
      }
      i += 1;
    }
    contourStart = i;

    if (subAnchors.length >= 2) {
      const ring = tessellateAnchorLoop(subAnchors);
      if (ring && ring.length >= 3) {
        loops.push(ring);
      }
    }
  }

  return loops;
}

/** Convenience single-ring tessellator for tests. */
export function tessellateNodeToWorldPolygon(node) {
  const rings = tessellateNodeToWorldPolygons(node);
  return rings.length > 0 ? rings[0] : [];
}

// --- 2D Segment Intersection & Polygon Clipping Kernel ---

export function solveSegmentIntersection(a, b, c, d) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const wx = c.x - a.x;
  const wy = c.y - a.y;

  const det = ux * vy - uy * vx;
  const numT = wx * vy - wy * vx;
  const numS = wx * uy - wy * ux;

  if (Math.abs(det) < 1e-9) {
    // Parallel or collinear
    if (Math.abs(numT) > 1e-6) return [];
    const uLenSq = ux * ux + uy * uy;
    if (uLenSq < 1e-12) return [];
    const tC = ((c.x - a.x) * ux + (c.y - a.y) * uy) / uLenSq;
    const tD = ((d.x - a.x) * ux + (d.y - a.y) * uy) / uLenSq;
    const tMin = Math.max(0, Math.min(tC, tD));
    const tMax = Math.min(1, Math.max(tC, tD));
    if (tMax <= tMin + 1e-6) return [];
    const res = [];
    if (tMin > 1e-6 && tMin < 1 - 1e-6) {
      res.push({ x: a.x + tMin * ux, y: a.y + tMin * uy, t: tMin });
    }
    if (tMax > 1e-6 && tMax < 1 - 1e-6) {
      res.push({ x: a.x + tMax * ux, y: a.y + tMax * uy, t: tMax });
    }
    return res;
  }

  const t = numT / det;
  const s = numS / det;
  if (t >= -1e-6 && t <= 1 + 1e-6 && s >= -1e-6 && s <= 1 + 1e-6) {
    const clampedT = Math.max(0, Math.min(1, t));
    if (clampedT > 1e-6 && clampedT < 1 - 1e-6) {
      return [{ x: a.x + clampedT * ux, y: a.y + clampedT * uy, t: clampedT }];
    }
  }
  return [];
}

/**
 * Tests if a point is inside a multi-loop shape under the even-odd winding rule.
 * An odd number of enclosing rings means inside; an even number means in a hole or outside.
 */
export function isPointInMultiLoopShape(pt, loops) {
  if (!loops || loops.length === 0) return false;
  let insideCount = 0;
  for (const ring of loops) {
    if (isPointInPolygon(pt, ring)) {
      insideCount += 1;
    }
  }
  return insideCount % 2 === 1;
}

export function subdivideMultiLoops(subjectLoops, clipLoops) {
  const segments = [];
  if (!subjectLoops || subjectLoops.length === 0) return segments;

  for (const ring of subjectLoops) {
    const rLen = ring.length;
    if (rLen < 2) continue;

    for (let i = 0; i < rLen; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % rLen];
      const splits = [
        { x: a.x, y: a.y, t: 0 },
        { x: b.x, y: b.y, t: 1 },
      ];

      if (clipLoops && clipLoops.length > 0) {
        for (const clipRing of clipLoops) {
          const cLen = clipRing.length;
          if (cLen < 2) continue;
          for (let j = 0; j < cLen; j += 1) {
            const c = clipRing[j];
            const d = clipRing[(j + 1) % cLen];
            const hits = solveSegmentIntersection(a, b, c, d);
            for (const h of hits) {
              if (!splits.some((s) => Math.abs(s.t - h.t) < 1e-6)) {
                splits.push(h);
              }
            }
          }
        }
      }

      splits.sort((p, q) => p.t - q.t);
      for (let k = 0; k < splits.length - 1; k += 1) {
        const p0 = splits[k];
        const p1 = splits[k + 1];
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-5) {
          segments.push({
            from: { x: p0.x, y: p0.y },
            to: { x: p1.x, y: p1.y },
          });
        }
      }
    }
  }

  return segments;
}

function assembleLoops(segs) {
  if (!segs || segs.length === 0) return [];
  const map = new Map();
  for (const seg of segs) {
    const k = ptKey(seg.from);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ ...seg, used: false });
  }

  const loops = [];
  for (const [, list] of map) {
    for (const edge of list) {
      if (edge.used) continue;
      const loop = [];
      let curEdge = edge;
      let steps = 0;
      const maxSteps = segs.length * 2;

      while (curEdge && !curEdge.used && steps < maxSteps) {
        curEdge.used = true;
        loop.push(curEdge.from);
        steps += 1;

        const nextKey = ptKey(curEdge.to);
        let nextCandidates = map.get(nextKey);
        if (!nextCandidates || !nextCandidates.some((e) => !e.used)) {
          for (const [, cList] of map) {
            if (cList.some((e) => !e.used)) {
              if (ptEq(cList[0].from, curEdge.to, 1e-4)) {
                nextCandidates = cList;
                break;
              }
            }
          }
        }
        if (!nextCandidates) break;

        // Choose next unused candidate edge
        curEdge = nextCandidates.find((e) => !e.used);
        if (curEdge && ptEq(curEdge.from, edge.from)) {
          break;
        }
      }

      if (loop.length >= 3) {
        const area = Math.abs(polygonSignedArea(loop));
        if (area > 1e-4) {
          loops.push(loop);
        }
      }
    }
  }

  return loops;
}

/**
 * Clips two multi-loop shapes using multi-ring even-odd winding classification.
 */
export function clipMultiLoopShapes(loopsA, loopsB, op) {
  if (!loopsA?.length && !loopsB?.length) return [];
  if (!loopsA?.length) {
    if (op === "union" || op === "exclude") return loopsB;
    return [];
  }
  if (!loopsB?.length) {
    if (op === "union" || op === "subtract" || op === "exclude") return loopsA;
    return [];
  }

  if (op === "exclude") {
    const aMinusB = clipMultiLoopShapes(loopsA, loopsB, "subtract");
    const bMinusA = clipMultiLoopShapes(loopsB, loopsA, "subtract");
    return [...aMinusB, ...bMinusA];
  }

  const segsA = subdivideMultiLoops(loopsA, loopsB);
  const segsB = subdivideMultiLoops(loopsB, loopsA);

  const kept = [];

  for (const s of segsA) {
    let sharedSame = false;
    let sharedOpp = false;

    for (const c of segsB) {
      if (ptEq(s.from, c.from) && ptEq(s.to, c.to)) {
        sharedSame = true;
        break;
      }
      if (ptEq(s.from, c.to) && ptEq(s.to, c.from)) {
        sharedOpp = true;
        break;
      }
    }

    if (sharedSame) {
      if (op === "union" || op === "intersect") kept.push(s);
    } else if (sharedOpp) {
      if (op === "subtract") kept.push(s);
    } else {
      const mid = { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 };
      const inB = isPointInMultiLoopShape(mid, loopsB);
      if (op === "union" && !inB) kept.push(s);
      if (op === "intersect" && inB) kept.push(s);
      if (op === "subtract" && !inB) kept.push(s);
    }
  }

  for (const c of segsB) {
    let isShared = false;
    for (const s of segsA) {
      if (
        (ptEq(c.from, s.from) && ptEq(c.to, s.to)) ||
        (ptEq(c.from, s.to) && ptEq(c.to, s.from))
      ) {
        isShared = true;
        break;
      }
    }

    if (!isShared) {
      const mid = { x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 };
      const inA = isPointInMultiLoopShape(mid, loopsA);
      if (op === "union" && !inA) kept.push(c);
      if (op === "intersect" && inA) kept.push(c);
      if (op === "subtract" && inA) kept.push({ from: c.to, to: c.from });
    }
  }

  return assembleLoops(kept);
}

/**
 * Clips two simple polygon rings using the segment-classified kernel.
 */
export function clipPolygonPair(polyS, polyC, op) {
  if (!polyS?.length || !polyC?.length) return [];
  return clipMultiLoopShapes([polyS], [polyC], op);
}

// --- Curve Fitting & Bezier Reconstruction ---

export function reconstructAnchorsFromLoop(loop) {
  if (!loop || loop.length < 3) return [];

  const n = loop.length;
  // Step 1: Find sharpest corner to avoid pinning a smooth vertex as index 0
  let maxDeflection = -1;
  let sharpestIdx = 0;

  for (let i = 0; i < n; i += 1) {
    const prev = loop[(i - 1 + n) % n];
    const curr = loop[i];
    const next = loop[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    if (len1 > 1e-6 && len2 > 1e-6) {
      const cosAngle = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      const deflection = 1 - Math.min(1, Math.max(-1, cosAngle));
      if (deflection > maxDeflection) {
        maxDeflection = deflection;
        sharpestIdx = i;
      }
    }
  }

  // Step 2: Rotate loop so sharpest corner is index 0
  const rotated = [];
  for (let i = 0; i < n; i += 1) {
    rotated.push(loop[(sharpestIdx + i) % n]);
  }

  // Step 3: Run RDP simplification
  const chain = [...rotated, rotated[0]].map((p) => ({
    x: p.x,
    y: p.y,
    in: null,
    out: null,
  }));
  const simplifiedChain = simplifyPenPoints(chain, RDP_SIMPLIFY_TOLERANCE);
  const simplified = simplifiedChain.slice(0, -1);
  if (simplified.length < 3) return [];

  // Step 4: Classify Corners vs Smooth Curve Candidates
  const count = simplified.length;
  const isCorner = new Array(count).fill(false);
  const cosCornerLimit = Math.cos((38 * Math.PI) / 180); // ~0.788

  for (let i = 0; i < count; i += 1) {
    const prev = simplified[(i - 1 + count) % count];
    const curr = simplified[i];
    const next = simplified[(i + 1) % count];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    if (len1 < 1e-6 || len2 < 1e-6) {
      isCorner[i] = true;
      continue;
    }

    const cosAngle = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    // Sharp angle (cosAngle <= cosCornerLimit) or flat (cosAngle >= 0.9995)
    if (cosAngle <= cosCornerLimit || cosAngle >= 0.9995) {
      isCorner[i] = true;
    }
  }

  // Step 5: Catmull-Rom C1 smoothing on smooth curve candidates
  const smoothedAnchors = simplified.map((p, i) => ({
    x: p.x,
    y: p.y,
    in: null,
    out: null,
    close: i === count - 1,
  }));

  for (let i = 0; i < count; i += 1) {
    if (!isCorner[i]) {
      const smoothed = smartSmoothPenAnchor(smoothedAnchors, i);
      if (smoothed) {
        const prevIsCorner = isCorner[(i - 1 + count) % count];
        const nextIsCorner = isCorner[(i + 1) % count];
        smoothedAnchors[i] = {
          ...smoothed,
          in: prevIsCorner ? null : smoothed.in,
          out: nextIsCorner ? null : smoothed.out,
          close: i === count - 1,
        };
      }
    }
  }

  return smoothedAnchors;
}

function computeMultiContourBounds(anchors, strokeWidth = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let contourStart = 0;
  while (contourStart < anchors.length) {
    let i = contourStart;
    const sub = [];
    while (i < anchors.length) {
      sub.push(anchors[i]);
      if (anchors[i].close) {
        i += 1;
        break;
      }
      i += 1;
    }
    contourStart = i;

    const b = penAnchorsBounds(sub, 0);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
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
 * Reconstructs a clean closed NODE_KIND.PATH node from clipped polygonal loops.
 */
export function reconstructBezierPath(loops, primaryNode) {
  if (!loops || loops.length === 0) return null;

  const allAnchors = [];
  for (const loop of loops) {
    const anchors = reconstructAnchorsFromLoop(loop);
    if (anchors && anchors.length >= 3) {
      anchors[anchors.length - 1].close = true;
      allAnchors.push(...anchors);
    }
  }

  if (allAnchors.length === 0) return null;

  const strokeWidth = primaryNode.strokeWidth ?? 0;
  const bounds = computeMultiContourBounds(allAnchors, strokeWidth);
  const rebasedPoints = allAnchors.map((a) =>
    normalisePenAnchor(a, bounds.x, bounds.y),
  );

  const result = {
    ...primaryNode,
    id: `bool-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
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
    fill: primaryNode.fill ?? "#3b82f6",
    fillOpacity: primaryNode.fillOpacity ?? 1,
    fillRule: "evenodd",
    stroke: primaryNode.stroke ?? "transparent",
    strokeWidth,
    strokeCap: primaryNode.strokeCap ?? "round",
    strokeJoin: primaryNode.strokeJoin ?? "round",
    strokeAlign: primaryNode.strokeAlign ?? "center",
    strokeDash: primaryNode.strokeDash ?? "solid",
    strokeMiterLimit: primaryNode.strokeMiterLimit ?? 4,
    opacity: primaryNode.opacity ?? 1,
    blendMode: primaryNode.blendMode ?? "source-over",
    visible: primaryNode.visible !== false,
  };

  // Strip shape generator properties
  delete result.cornerRadius;
  delete result.poly;
  delete result.polyKind;
  delete result.sides;
  delete result.spikes;
  delete result.innerRatio;
  delete result.line;
  delete result.arrow;
  delete result.arrowStart;

  return result;
}

// --- Binary & Multi-Node Chaining Execution ---

function executeBinaryBoolean(nodeA, nodeB, op) {
  if (!nodeA || !nodeB) return null;

  const loopsA = tessellateNodeToWorldPolygons(nodeA);
  const loopsB = tessellateNodeToWorldPolygons(nodeB);

  if (loopsA.length === 0 && loopsB.length === 0) return null;
  if (loopsA.length === 0) {
    if (op === "union" || op === "exclude") return reconstructBezierPath(loopsB, nodeA);
    return null;
  }
  if (loopsB.length === 0) {
    if (op === "union" || op === "subtract" || op === "exclude") {
      return reconstructBezierPath(loopsA, nodeA);
    }
    return null;
  }

  const resultLoops = clipMultiLoopShapes(loopsA, loopsB, op);
  return reconstructBezierPath(resultLoops, nodeA);
}

function executeBooleanChain(nodes, op) {
  if (!Array.isArray(nodes) || nodes.length < 2) return null;

  let current = nodes[0];
  for (let i = 1; i < nodes.length; i += 1) {
    const next = nodes[i];
    current = executeBinaryBoolean(current, next, op);
    if (!current && (op === "subtract" || op === "intersect")) {
      return null;
    }
  }
  return current;
}

// --- Public API ---

export function booleanUnion(nodes) {
  return executeBooleanChain(nodes, "union");
}

export function booleanSubtract(nodes) {
  return executeBooleanChain(nodes, "subtract");
}

export function booleanIntersect(nodes) {
  return executeBooleanChain(nodes, "intersect");
}

export function booleanExclude(nodes) {
  return executeBooleanChain(nodes, "exclude");
}
