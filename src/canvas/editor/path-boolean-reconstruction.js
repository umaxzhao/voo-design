/** Reconstruct closed editor pen paths from clipped polygon contours. */
import { NODE_KIND } from "./scene_model_core.js";
import { penAnchorsBounds, normalisePenAnchor, simplifyPenPoints, smartSmoothPenAnchor } from "./scene_model_paths.js";

const RDP_SIMPLIFY_TOLERANCE = 0.35;

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

