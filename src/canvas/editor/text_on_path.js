/**
 * Text on Path (Curve Typography Layout & Rendering Engine)
 *
 * Implements high-precision arc-length parameterization of cubic Bezier paths,
 * glyph positioning along curves, tangent/normal evaluation, flipping/reversing,
 * alignment (left, center, right), and SVG textPath export.
 *
 * Clean-room implementation based on differential geometry & Bezier curve theory.
 */

import { textFont } from "./text_metrics.js";
import { resolvePaintStyle } from "./render_basic_shapes.js";
import { isMeshGradient } from "../color_picker/mesh_gradient.js";
import { parseGradient } from "../color_picker/gradient_fill.js";
import { meshCanvasPattern } from "./mesh-gradient-paint.js";

/** Evaluate a cubic Bezier point at parameter t in [0, 1]. */
export function cubicBezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/** Evaluate the first derivative (tangent) of a cubic Bezier at parameter t. */
export function cubicBezierDerivative(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;

  return {
    x:
      3 * u * u * (p1.x - p0.x) +
      6 * u * t * (p2.x - p1.x) +
      3 * tt * (p3.x - p2.x),
    y:
      3 * u * u * (p1.y - p0.y) +
      6 * u * t * (p2.y - p1.y) +
      3 * tt * (p3.y - p2.y),
  };
}

/** Normalizes points/anchors from either pen format or path format into absolute control points. */
export function normalizePathPoints(pointsOrAnchors) {
  if (!Array.isArray(pointsOrAnchors) || pointsOrAnchors.length === 0) return [];
  return pointsOrAnchors.map((p) => {
    const x = Number.isFinite(p.x) ? p.x : 0;
    const y = Number.isFinite(p.y) ? p.y : 0;

    let inHandle = null;
    if (p.in) {
      if (Array.isArray(p.in) && p.in.length >= 2) {
        inHandle = { x: x + p.in[0], y: y + p.in[1] };
      } else if (Number.isFinite(p.in.x) && Number.isFinite(p.in.y)) {
        inHandle = { x: p.in.x, y: p.in.y };
      }
    }

    let outHandle = null;
    if (p.out) {
      if (Array.isArray(p.out) && p.out.length >= 2) {
        outHandle = { x: x + p.out[0], y: y + p.out[1] };
      } else if (Number.isFinite(p.out.x) && Number.isFinite(p.out.y)) {
        outHandle = { x: p.out.x, y: p.out.y };
      }
    }

    return {
      x,
      y,
      in: inHandle,
      out: outHandle,
      close: Boolean(p.close),
    };
  });
}

/**
 * Builds discrete cubic Bezier segments from a normalized sequence of points.
 * Handles both open paths and closed loops.
 */
export function buildPathCurveSegments(points, isClosed = false) {
  const pts = normalizePathPoints(points);
  if (pts.length < 2) return [];

  const closed = isClosed || pts[pts.length - 1]?.close === true;
  const segments = [];
  const count = closed ? pts.length : pts.length - 1;

  for (let i = 0; i < count; i += 1) {
    const p0 = pts[i];
    const p3 = pts[(i + 1) % pts.length];

    const p1 = p0.out ? { x: p0.out.x, y: p0.out.y } : { x: p0.x, y: p0.y };
    const p2 = p3.in ? { x: p3.in.x, y: p3.in.y } : { x: p3.x, y: p3.y };

    segments.push({ p0, p1, p2, p3 });
  }

  return segments;
}

/**
 * Builds an Arc Length Lookup Table (LUT) for precise distance -> (segment, t) mapping.
 */
export function buildArcLengthLUT(segments, samplesPerSegment = 32) {
  if (!segments || segments.length === 0) {
    return {
      segments: [],
      samples: [{ distance: 0, segIndex: 0, t: 0, x: 0, y: 0, dx: 1, dy: 0 }],
      totalLength: 0,
    };
  }

  const samples = [];
  let totalLength = 0;

  for (let sIdx = 0; sIdx < segments.length; sIdx += 1) {
    const { p0, p1, p2, p3 } = segments[sIdx];
    let prevPoint = cubicBezierPoint(p0, p1, p2, p3, 0);

    if (sIdx === 0) {
      const initDeriv = cubicBezierDerivative(p0, p1, p2, p3, 0);
      samples.push({
        distance: 0,
        segIndex: 0,
        t: 0,
        x: prevPoint.x,
        y: prevPoint.y,
        dx: initDeriv.x,
        dy: initDeriv.y,
      });
    }

    for (let step = 1; step <= samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      const pt = cubicBezierPoint(p0, p1, p2, p3, t);
      const deriv = cubicBezierDerivative(p0, p1, p2, p3, t);
      const stepDist = Math.hypot(pt.x - prevPoint.x, pt.y - prevPoint.y);

      totalLength += stepDist;
      samples.push({
        distance: totalLength,
        segIndex: sIdx,
        t,
        x: pt.x,
        y: pt.y,
        dx: deriv.x,
        dy: deriv.y,
      });
      prevPoint = pt;
    }
  }

  return {
    segments,
    samples,
    totalLength,
  };
}

/**
 * Samples position, tangent angle, and normal at a given arc-length distance.
 */
export function sampleLUTAtDistance(lut, targetDist, isClosed = false) {
  const { samples, totalLength, segments } = lut;
  if (!samples || samples.length === 0 || totalLength <= 0) {
    return {
      x: 0,
      y: 0,
      angle: 0,
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: -1 },
      outOfBounds: true,
    };
  }

  let dist = targetDist;
  if (isClosed) {
    dist = ((dist % totalLength) + totalLength) % totalLength;
  }

  // Handle open path extrapolation at endpoints
  if (dist <= 0) {
    const first = samples[0];
    let len = Math.hypot(first.dx, first.dy);
    if (len === 0) {
      const next = samples[1] || first;
      first.dx = next.x - first.x;
      first.dy = next.y - first.y;
      len = Math.hypot(first.dx, first.dy) || 1;
    }
    const tx = first.dx / len;
    const ty = first.dy / len;
    const nx = -ty;
    const ny = tx;
    return {
      x: first.x + dist * tx,
      y: first.y + dist * ty,
      angle: Math.atan2(ty, tx),
      tangent: { x: tx, y: ty },
      normal: { x: nx, y: ny },
      outOfBounds: dist < 0,
    };
  }

  if (dist >= totalLength) {
    const last = samples[samples.length - 1];
    let len = Math.hypot(last.dx, last.dy);
    if (len === 0) {
      const prev = samples[samples.length - 2] || last;
      last.dx = last.x - prev.x;
      last.dy = last.y - prev.y;
      len = Math.hypot(last.dx, last.dy) || 1;
    }
    const tx = last.dx / len;
    const ty = last.dy / len;
    const nx = -ty;
    const ny = tx;
    const over = dist - totalLength;
    return {
      x: last.x + over * tx,
      y: last.y + over * ty,
      angle: Math.atan2(ty, tx),
      tangent: { x: tx, y: ty },
      normal: { x: nx, y: ny },
      outOfBounds: over > 0,
    };
  }

  // Binary search for sample interval [low, high]
  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (samples[mid].distance < dist) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const i1 = Math.max(0, Math.min(samples.length - 1, low));
  const i0 = Math.max(0, i1 - 1);
  const s0 = samples[i0];
  const s1 = samples[i1];

  const span = s1.distance - s0.distance;
  const ratio = span > 1e-7 ? (dist - s0.distance) / span : 0;

  // Exact Bezier evaluation for maximum curvature accuracy
  if (s0.segIndex === s1.segIndex && segments && segments[s0.segIndex]) {
    const seg = segments[s0.segIndex];
    const exactT = s0.t + ratio * (s1.t - s0.t);
    const pt = cubicBezierPoint(seg.p0, seg.p1, seg.p2, seg.p3, exactT);
    const deriv = cubicBezierDerivative(seg.p0, seg.p1, seg.p2, seg.p3, exactT);
    let len = Math.hypot(deriv.x, deriv.y);
    if (len === 0) len = 1;
    const tx = deriv.x / len;
    const ty = deriv.y / len;
    return {
      x: pt.x,
      y: pt.y,
      angle: Math.atan2(ty, tx),
      tangent: { x: tx, y: ty },
      normal: { x: -ty, y: tx },
      outOfBounds: false,
    };
  }

  const x = s0.x + ratio * (s1.x - s0.x);
  const y = s0.y + ratio * (s1.y - s0.y);
  const dx = s0.dx + ratio * (s1.dx - s0.dx);
  const dy = s0.dy + ratio * (s1.dy - s0.dy);
  let len = Math.hypot(dx, dy);
  if (len === 0) len = 1;
  const tx = dx / len;
  const ty = dy / len;

  return {
    x,
    y,
    angle: Math.atan2(ty, tx),
    tangent: { x: tx, y: ty },
    normal: { x: -ty, y: tx },
    outOfBounds: false,
  };
}

/**
 * Measures character widths with fallback for non-browser / headless test environments.
 */
export function measureCharWidths(ctx, text, fontSize, letterSpacing = 0) {
  const chars = Array.from(text || "");
  return chars.map((ch) => {
    let w = 0;
    if (ctx && typeof ctx.measureText === "function") {
      try {
        const m = ctx.measureText(ch);
        w = m?.width ?? 0;
      } catch {
        w = 0;
      }
    }
    // Graceful fallback for headless/test environments where measureText returns 0
    if (w <= 0) {
      if (ch === " ") w = fontSize * 0.35;
      else if (ch === "i" || ch === "l" || ch === "j" || ch === "!") w = fontSize * 0.28;
      else if (ch === "w" || ch === "m" || ch === "M" || ch === "W") w = fontSize * 0.85;
      else if (/[\u4e00-\u9fa5]/.test(ch)) w = fontSize * 1.0;
      else w = fontSize * 0.55;
    }
    return w + letterSpacing;
  });
}

/**
 * Lays out text along a path, returning positioned glyph descriptors and total bounding box.
 */
export function layoutTextOnPath(ctx, node) {
  const textPath = node.textPath;
  if (!textPath) return null;

  const points = textPath.points || textPath.anchors || [];
  if (points.length < 2) return null;

  const isClosed = Boolean(textPath.closed);
  const segments = buildPathCurveSegments(points, isClosed);
  if (segments.length === 0) return null;

  const lut = buildArcLengthLUT(segments, 32);
  const totalPathLength = lut.totalLength;
  if (totalPathLength <= 0) return null;

  const text = String(node.text ?? "");
  const fontSize = node.fontSize ?? 16;
  const letterSpacing = node.letterSpacing ?? 0;
  const align = textPath.align ?? node.align ?? "left";
  const startOffset = Number.isFinite(textPath.startOffset) ? textPath.startOffset : 0;
  const side = textPath.side ?? "top"; // "top" | "bottom"
  const reverse = Boolean(textPath.reverse);
  const baselineOffset = Number.isFinite(textPath.baselineOffset) ? textPath.baselineOffset : 0;
  const baselineShift = Number.isFinite(node.baselineShift) ? node.baselineShift : 0;

  const charWidths = measureCharWidths(ctx, text, fontSize, letterSpacing);
  const totalTextWidth = charWidths.reduce((sum, w) => sum + w, 0);

  let initialDist = startOffset;
  if (align === "center") {
    initialDist += (totalPathLength - totalTextWidth) / 2;
  } else if (align === "right") {
    initialDist += totalPathLength - totalTextWidth;
  }

  const chars = Array.from(text);
  const glyphs = [];

  let curDist = initialDist;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const charWidth = charWidths[i];
    const halfWidth = charWidth / 2;
    const centerDist = curDist + halfWidth;

    // Evaluate lookup distance based on reverse traversal
    const evalDist = reverse ? totalPathLength - centerDist : centerDist;
    const sample = sampleLUTAtDistance(lut, evalDist, isClosed);

    let angle = sample.angle;
    let normalX = sample.normal.x;
    let normalY = sample.normal.y;

    if (reverse) {
      angle += Math.PI;
      normalX = -normalX;
      normalY = -normalY;
    }

    // Flip side orientation (bottom side flips 180 degrees so characters remain upright or read from underside)
    const effectiveNormalDist = (side === "bottom" ? -1 : 1) * (baselineOffset + baselineShift);
    const glyphX = sample.x + normalX * effectiveNormalDist;
    const glyphY = sample.y + normalY * effectiveNormalDist;

    let displayAngle = angle;
    if (side === "bottom") {
      displayAngle += Math.PI;
    }

    // Keep angle normalized in [-PI, PI]
    while (displayAngle > Math.PI) displayAngle -= Math.PI * 2;
    while (displayAngle < -Math.PI) displayAngle += Math.PI * 2;

    glyphs.push({
      char: ch,
      index: i,
      x: glyphX,
      y: glyphY,
      angle: displayAngle,
      width: charWidth,
      halfWidth,
      outOfBounds: sample.outOfBounds,
    });

    // Approximate bounding box bounds for each glyph
    const r = Math.max(charWidth, fontSize);
    minX = Math.min(minX, glyphX - r);
    maxX = Math.max(maxX, glyphX + r);
    minY = Math.min(minY, glyphY - r);
    maxY = Math.max(maxY, glyphY + r);

    curDist += charWidth;
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    glyphs,
    totalPathLength,
    totalTextWidth,
    lut,
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    },
  };
}

/**
 * Paints text along path onto a CanvasRenderingContext2D.
 */
export function paintTextOnPath(ctx, node) {
  ctx.save();
  ctx.font = textFont(node);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const layout = layoutTextOnPath(ctx, node);
  if (!layout || layout.glyphs.length === 0) {
    ctx.restore();
    return;
  }

  const strokeWidth = node.stroke ? (node.strokeWidth ?? 0) : 0;
  const meshFill = isMeshGradient(node.fill) ? parseGradient(node.fill) : null;
  const meshStroke = isMeshGradient(node.stroke) ? parseGradient(node.stroke) : null;
  const strokeColor = node.stroke
    ? resolvePaintStyle(ctx, node.stroke, node.x, node.y, node.width, node.height, node.strokeOpacity ?? 1)
    : null;
  const fillColor = resolvePaintStyle(
    ctx,
    node.fill ?? "#000000",
    node.x,
    node.y,
    node.width,
    node.height,
    node.fillOpacity ?? 1,
  );

  const shadow = node.shadow?.enabled ? node.shadow : null;
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }

  for (const glyph of layout.glyphs) {
    ctx.save();
    ctx.translate(glyph.x, glyph.y);
    ctx.rotate(glyph.angle);

    // Patterns follow the current glyph transform, unlike CanvasGradient.
    // Cancel that local transform to keep the mesh anchored to the text box.
    const inverse = meshFill || meshStroke
      ? new DOMMatrix().translate(glyph.x, glyph.y).rotate(glyph.angle * 180 / Math.PI).inverse() : null;
    const meshPaint = (parsed, alpha) => meshCanvasPattern(ctx, parsed,
      node.x, node.y, node.width, node.height, alpha, inverse);

    if (strokeWidth > 0 && strokeColor) {
      ctx.strokeStyle = meshStroke ? meshPaint(meshStroke, node.strokeOpacity ?? 1) : strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = "round";
      ctx.strokeText(glyph.char, 0, 0);
    }

    ctx.fillStyle = meshFill ? meshPaint(meshFill, node.fillOpacity ?? 1) : fillColor;
    ctx.fillText(glyph.char, 0, 0);

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Computes SVG path 'd' attribute from points.
 */
export function pointsToSvgPathD(points, closed = false) {
  const pts = normalizePathPoints(points);
  if (pts.length < 2) return "";

  let d = `M ${pts[0].x} ${pts[0].y}`;
  const isClosed = closed || pts[pts.length - 1]?.close === true;
  const count = isClosed ? pts.length : pts.length - 1;

  for (let i = 0; i < count; i += 1) {
    const p0 = pts[i];
    const p3 = pts[(i + 1) % pts.length];
    const p1 = p0.out ? p0.out : { x: p0.x, y: p0.y };
    const p2 = p3.in ? p3.in : { x: p3.x, y: p3.y };

    if (p0.out || p3.in) {
      d += ` C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
    } else {
      d += ` L ${p3.x} ${p3.y}`;
    }
  }

  if (isClosed) {
    d += " Z";
  }

  return d;
}

/**
 * Generates lossless SVG representation for a Text on Path node using standard SVG <textPath>.
 */
export function textOnPathToSvg(node, measureCtx = null) {
  if (!node.textPath) return null;
  const pathD = pointsToSvgPathD(
    node.textPath.points || node.textPath.anchors,
    node.textPath.closed,
  );
  if (!pathD) return null;

  const pathId = `text-path-${node.id || Math.random().toString(36).slice(2, 9)}`;
  const align = node.textPath.align ?? node.align ?? "left";
  const textAnchor = align === "center" ? "middle" : align === "right" ? "end" : "start";

  let startOffset = node.textPath.startOffset ?? 0;
  if (align === "center") startOffset = "50%";
  else if (align === "right") startOffset = "100%";
  else startOffset = `${startOffset}px`;

  const fontAttr = `font-family="${node.fontFamily || "sans-serif"}" font-size="${node.fontSize || 16}" font-weight="${node.fontWeight || "normal"}"`;
  const fillAttr = `fill="${node.fill || "#000000"}" fill-opacity="${node.fillOpacity ?? 1}"`;
  const strokeAttr =
    node.stroke && (node.strokeWidth ?? 0) > 0
      ? `stroke="${node.stroke}" stroke-width="${node.strokeWidth}" stroke-opacity="${node.strokeOpacity ?? 1}" stroke-linejoin="round"`
      : "";

  return `
    <defs>
      <path id="${pathId}" d="${pathD}" fill="none"/>
    </defs>
    <text ${fontAttr} ${fillAttr} ${strokeAttr} opacity="${node.opacity ?? 1}" text-anchor="${textAnchor}">
      <textPath href="#${pathId}" startOffset="${startOffset}">
        ${node.text || ""}
      </textPath>
    </text>
  `.trim();
}
