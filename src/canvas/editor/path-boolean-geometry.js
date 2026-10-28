/** Document-space geometry and adaptive curve tessellation for vector operations. */
import { NODE_KIND } from "./scene_model_core.js";
import { canConvertToPath, convertShapeToPathNode, convertShapeToPenAnchors } from "./shape_to_path.js";
import { fromNodeLocal } from "./scene_geometry_transform.js";

const EPSILON = 1e-6;
const CHORD_TOLERANCE = 0.25;
const MAX_SUBDIVISION_DEPTH = 10;

// --- Utility Math & Geometry ---

export function ptEq(p, q, eps = 1e-4) {
  return Math.hypot(p.x - q.x, p.y - q.y) <= eps;
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

