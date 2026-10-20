// Conversion of basic shapes (rect, ellipse, polygon, star, line, arrow) into editable pen paths.

import { NODE_KIND, resolveCornerRadii } from "./scene_model_core.js";

/** Standard cubic bezier circle/ellipse approximation constant (4/3 * (sqrt(2) - 1)). */
export const KAPPA = (4 / 3) * (Math.SQRT2 - 1);

/** Evaluates a 2D cubic bezier curve at parameter t in [0, 1]. */
export function evalCubicBezier2D(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

/** Checks whether a node is eligible for conversion to an editable pen path. */
export function canConvertToPath(node) {
  if (!node || typeof node !== "object") return false;
  if (node.pen === true) return false;

  if (node.kind === NODE_KIND.RECT || node.kind === NODE_KIND.ELLIPSE) {
    return true;
  }

  if (node.kind === NODE_KIND.PATH) {
    return Boolean(node.poly || node.line || node.arrow);
  }

  return false;
}

/**
 * Converts an ellipse into 4 cubic bezier arcs (top, right, bottom, left).
 */
export function convertEllipseToPenAnchors(width, height) {
  const rx = (width || 0) / 2;
  const ry = (height || 0) / 2;
  const cx = rx;
  const cy = ry;
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;

  return [
    { x: width, y: cy, in: [0, -oy], out: [0, oy], close: false },
    { x: cx, y: height, in: [ox, 0], out: [-ox, 0], close: false },
    { x: 0, y: cy, in: [0, oy], out: [0, -oy], close: false },
    { x: cx, y: 0, in: [-ox, 0], out: [ox, 0], close: true },
  ];
}

/**
 * Converts a rectangle into pen anchors (4 sharp corners, or up to 8 anchors with corner arcs).
 * Supports both scalar cornerRadius and per-corner { tl, tr, br, bl }.
 */
export function convertRectToPenAnchors(width, height, cornerRadius = 0) {
  const w = width || 0;
  const h = height || 0;
  const { tl, tr, br, bl } = resolveCornerRadii(cornerRadius, w, h);

  if (tl <= 0 && tr <= 0 && br <= 0 && bl <= 0) {
    return [
      { x: 0, y: 0, in: null, out: null, close: false },
      { x: w, y: 0, in: null, out: null, close: false },
      { x: w, y: h, in: null, out: null, close: false },
      { x: 0, y: h, in: null, out: null, close: true },
    ];
  }

  const anchors = [];

  // Start at Top-Left (matching roundRectPath starting at x + tl, y)
  if (tl > 0) {
    const d = tl * KAPPA;
    anchors.push({ x: tl, y: 0, in: [-d, 0], out: null, close: false });
  } else {
    anchors.push({ x: 0, y: 0, in: null, out: null, close: false });
  }

  // Corner TR
  if (tr > 0) {
    const d = tr * KAPPA;
    anchors.push({ x: w - tr, y: 0, in: null, out: [d, 0], close: false });
    anchors.push({ x: w, y: tr, in: [0, -d], out: null, close: false });
  } else {
    anchors.push({ x: w, y: 0, in: null, out: null, close: false });
  }

  // Corner BR
  if (br > 0) {
    const d = br * KAPPA;
    anchors.push({ x: w, y: h - br, in: null, out: [0, d], close: false });
    anchors.push({ x: w - br, y: h, in: [d, 0], out: null, close: false });
  } else {
    anchors.push({ x: w, y: h, in: null, out: null, close: false });
  }

  // Corner BL
  if (bl > 0) {
    const d = bl * KAPPA;
    anchors.push({ x: bl, y: h, in: null, out: [-d, 0], close: false });
    anchors.push({ x: 0, y: h - bl, in: [0, d], out: null, close: false });
  } else {
    anchors.push({ x: 0, y: h, in: null, out: null, close: false });
  }

  // Corner TL end (if tl > 0, the arc completes from (0, tl) back to (tl, 0))
  if (tl > 0) {
    const d = tl * KAPPA;
    anchors.push({ x: 0, y: tl, in: null, out: [0, -d], close: false });
  }

  anchors[anchors.length - 1].close = true;
  return anchors;
}

/**
 * Converts a shape node into an array of pen anchors in node-local coordinates.
 */
export function convertShapeToPenAnchors(node) {
  if (!node) return [];

  if (node.kind === NODE_KIND.ELLIPSE) {
    return convertEllipseToPenAnchors(node.width, node.height);
  }

  if (node.kind === NODE_KIND.RECT) {
    return convertRectToPenAnchors(node.width, node.height, node.cornerRadius);
  }

  if (node.kind === NODE_KIND.PATH) {
    const rawPoints = Array.isArray(node.points) ? node.points : [];
    const isClosed = node.poly === true || node.closed === true;

    return rawPoints.map((pt, i) => {
      const px = Array.isArray(pt) ? pt[0] : (pt?.x ?? 0);
      const py = Array.isArray(pt) ? pt[1] : (pt?.y ?? 0);
      return {
        x: px,
        y: py,
        in: null,
        out: null,
        close: isClosed && i === rawPoints.length - 1,
      };
    });
  }

  return [];
}

/**
 * Converts a shape node (rect, ellipse, polygon, star, line, arrow) into an editable pen path node.
 * Returns null if the node cannot be converted.
 */
export function convertShapeToPathNode(node) {
  if (!canConvertToPath(node)) return null;

  const anchors = convertShapeToPenAnchors(node);
  const w = node.width ?? 1;
  const h = node.height ?? 1;

  // Clone node properties to preserve all styling and metadata
  const converted = { ...node };

  // Remove shape-specific primitive generator metadata
  delete converted.cornerRadius;
  delete converted.poly;
  delete converted.polyKind;
  delete converted.sides;
  delete converted.spikes;
  delete converted.innerRatio;
  delete converted.line;

  // For rect and ellipse, preserve historical inside/miter stroke defaults if unspecified
  if (node.kind === NODE_KIND.RECT) {
    if (converted.strokeAlign === undefined) converted.strokeAlign = "inside";
    if (converted.strokeJoin === undefined) converted.strokeJoin = "miter";
  } else if (node.kind === NODE_KIND.ELLIPSE) {
    if (converted.strokeAlign === undefined) converted.strokeAlign = "inside";
  }

  // Set path / pen node fields
  converted.kind = NODE_KIND.PATH;
  converted.pen = true;
  converted.baseWidth = w;
  converted.baseHeight = h;
  converted.points = anchors;

  return converted;
}

