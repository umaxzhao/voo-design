/**
 * Stroke styling for vector paths (pen nodes): cap, join, dash pattern, miter
 * limit and closed-path alignment.
 *
 * The node fields are plain data (`strokeCap`, `strokeJoin`, `strokeDash`,
 * `strokeMiterLimit`, `strokeAlign`); this module is the one place that
 * decides what they mean, so the canvas-2D renderer, the Skia scene adapter
 * and the SVG exporter all read the same answers. Pure logic, no DOM.
 *
 * The dash presets follow Figma's proportions: "dashed" is a 3w dash with a
 * 2w gap, "dotted" is a zero-length dash with a 2w gap — which only reads as
 * dots under a round cap, so `effectiveStrokeCap` forces one.
 */

export const STROKE_CAP = Object.freeze({
  BUTT: "butt",
  ROUND: "round",
  SQUARE: "square",
});

export const STROKE_JOIN = Object.freeze({
  MITER: "miter",
  ROUND: "round",
  BEVEL: "bevel",
});

export const STROKE_DASH = Object.freeze({
  SOLID: "solid",
  DASHED: "dashed",
  DOTTED: "dotted",
});

export const STROKE_ALIGN = Object.freeze({
  CENTER: "center",
  INSIDE: "inside",
  OUTSIDE: "outside",
});

/**
 * Width profiles: how the stroke width varies along the path, as a multiplier
 * of the node strokeWidth at each point. `uniform` is the ordinary stroke.
 * canvas2d and SVG have no variable-width stroke, so the 2D renderer fills a
 * triangulated ribbon instead (buildStrokeRibbon); cap/join/dash/align do not
 * apply to a ribbon, the same restriction Figma imposes.
 */
export const WIDTH_PROFILE = Object.freeze({
  UNIFORM: "uniform",
  /** Hairline at the start, full width at the end. */
  TAPER_IN: "taperIn",
  /** Full width at the start, hairline at the end. */
  TAPER_OUT: "taperOut",
  /** Spear: hairline at both ends, full width mid-path. */
  TAPER_BOTH: "taperBoth",
});

/** The default miter limit, matching Figma (canvas2d's own default is 10). */
export const DEFAULT_MITER_LIMIT = 4;

const pick = (value, table, fallback) =>
  Object.values(table).includes(value) ? value : fallback;

/**
 * The stroke settings of a node with every invalid or missing value folded
 * back to the default — the defaults reproduce the historical rendering
 * (round/round, solid, centred), so documents written before these fields
 * existed draw exactly as they did.
 */
export function normalizeStrokeProps(node) {
  return {
    cap: pick(node?.strokeCap, STROKE_CAP, STROKE_CAP.ROUND),
    join: pick(node?.strokeJoin, STROKE_JOIN, STROKE_JOIN.ROUND),
    dash: normalizeDash(node?.strokeDash),
    miterLimit:
      Number.isFinite(node?.strokeMiterLimit) && node.strokeMiterLimit >= 1
        ? node.strokeMiterLimit
        : DEFAULT_MITER_LIMIT,
    align: pick(node?.strokeAlign, STROKE_ALIGN, STROKE_ALIGN.CENTER),
    profile: pick(
      node?.strokeWidthProfile,
      WIDTH_PROFILE,
      WIDTH_PROFILE.UNIFORM,
    ),
  };
}

/**
 * A dash setting is one of the preset names or an explicit pattern. Patterns
 * are sanitised (finite, non-negative) and odd-length ones are repeated —
 * canvas2d, Skia and SVG all repeat an odd pattern implicitly, so doing it
 * here keeps the three renderers byte-identical.
 */
export function normalizeDash(dash) {
  if (Array.isArray(dash)) {
    const pattern = dash.filter(
      (value) => Number.isFinite(value) && value >= 0,
    );
    if (pattern.length === 0) return STROKE_DASH.SOLID;
    return pattern.length % 2 === 1 ? [...pattern, ...pattern] : pattern;
  }
  return pick(dash, STROKE_DASH, STROKE_DASH.SOLID);
}

/**
 * The dash pattern in document pixels for a stroke width, [] for solid.
 * `dashed` is 3w on / 2w off, `dotted` is 0 on / 2w off (round cap makes the
 * zero-length marks into circles).
 */
export function dashPatternFor(dash, width) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const normal = normalizeDash(dash);
  if (Array.isArray(normal)) return normal;
  if (normal === STROKE_DASH.DASHED) return [3 * w, 2 * w];
  if (normal === STROKE_DASH.DOTTED) return [0, 2 * w];
  return [];
}

/** A dotted stroke only renders as dots under a round cap. */
export function effectiveStrokeCap(cap, dash) {
  if (normalizeDash(dash) === STROKE_DASH.DOTTED) return STROKE_CAP.ROUND;
  return pick(cap, STROKE_CAP, STROKE_CAP.ROUND);
}

/**
 * Alignment only has meaning on a closed fillable path: an open stroke has no
 * inside. Renderers ask here so they all fall back to centre the same way.
 */
export function effectiveStrokeAlign(align, closed) {
  if (!closed) return STROKE_ALIGN.CENTER;
  return pick(align, STROKE_ALIGN, STROKE_ALIGN.CENTER);
}

const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * The width multiplier of a profile at path position t ∈ [0, 1]. Ends pinch
 * to zero on purpose — that is what reads as a taper.
 */
export function profileWidthAt(profile, t) {
  const clamped = Math.min(1, Math.max(0, t));
  switch (pick(profile, WIDTH_PROFILE, WIDTH_PROFILE.UNIFORM)) {
    case WIDTH_PROFILE.TAPER_IN:
      return smoothstep(clamped);
    case WIDTH_PROFILE.TAPER_OUT:
      return smoothstep(1 - clamped);
    case WIDTH_PROFILE.TAPER_BOTH:
      return smoothstep(Math.sin(Math.PI * clamped));
    default:
      return 1;
  }
}

/** A cubic bezier's derivative at t (control points in order). */
function cubicDerivative(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    3 * u * u * (p1[0] - p0[0]) +
      6 * u * t * (p2[0] - p1[0]) +
      3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) +
      6 * u * t * (p2[1] - p1[1]) +
      3 * t * t * (p3[1] - p2[1]),
  ];
}

/**
 * The filled ribbon polygon for a variable-width stroke: the outline sampled
 * in doc space, each station offset by ±(profile(t)·strokeWidth/2) along the
 * curve normal. Returns a flat [[x, y], …] ring — left edge out, right edge
 * back — ready to fill, or null when the path has fewer than two anchors.
 */
export function buildStrokeRibbon(node, profile, samplesPerSegment = 24) {
  const points = node?.points ?? [];
  if (points.length < 2) return null;
  if (
    pick(profile, WIDTH_PROFILE, WIDTH_PROFILE.UNIFORM) ===
    WIDTH_PROFILE.UNIFORM
  ) {
    return null;
  }
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const closed = points[points.length - 1]?.close === true;
  const segmentCount = closed ? points.length : points.length - 1;
  const total = segmentCount * samplesPerSegment;

  const stations = [];
  for (let seg = 0; seg < segmentCount; seg += 1) {
    const from = points[seg];
    const to = points[(seg + 1) % points.length];
    const fx = Array.isArray(from) ? from[0] : (from?.x ?? 0);
    const fy = Array.isArray(from) ? from[1] : (from?.y ?? 0);
    const tx = Array.isArray(to) ? to[0] : (to?.x ?? 0);
    const ty = Array.isArray(to) ? to[1] : (to?.y ?? 0);
    // Control points in doc space; missing handles collapse to their anchor.
    const p0 = [node.x + fx * scaleX, node.y + fy * scaleY];
    const p3 = [node.x + tx * scaleX, node.y + ty * scaleY];
    const p1 = from?.out
      ? [
          node.x + (fx + from.out[0]) * scaleX,
          node.y + (fy + from.out[1]) * scaleY,
        ]
      : p0;
    const p2 = to?.in
      ? [
          node.x + (tx + to.in[0]) * scaleX,
          node.y + (ty + to.in[1]) * scaleY,
        ]
      : p3;
    for (let s = 0; s < samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      const u = 1 - t;
      const x =
        u * u * u * p0[0] +
        3 * u * u * t * p1[0] +
        3 * u * t * t * p2[0] +
        t * t * t * p3[0];
      const y =
        u * u * u * p0[1] +
        3 * u * u * t * p1[1] +
        3 * u * t * t * p2[1] +
        t * t * t * p3[1];
      const [dx, dy] = cubicDerivative(p0, p1, p2, p3, t);
      stations.push({ x, y, dx, dy });
    }
  }
  // The final station, at the very end of the last segment.
  {
    const from = points[segmentCount - 1];
    const to = points[segmentCount % points.length];
    const fx = Array.isArray(from) ? from[0] : (from?.x ?? 0);
    const fy = Array.isArray(from) ? from[1] : (from?.y ?? 0);
    const tx = Array.isArray(to) ? to[0] : (to?.x ?? 0);
    const ty = Array.isArray(to) ? to[1] : (to?.y ?? 0);
    stations.push({
      x: node.x + tx * scaleX,
      y: node.y + ty * scaleY,
      dx: tx - fx,
      dy: ty - fy,
    });
  }

  const half = (node.strokeWidth ?? 1) / 2;
  const left = [];
  const right = [];
  let lastNormal = [0, -1];
  stations.forEach((station, index) => {
    const length = Math.hypot(station.dx, station.dy);
    // A zero-derivative station (coincident anchors) inherits the previous
    // normal rather than collapsing the ribbon.
    const normal =
      length > 1e-9 ? [-station.dy / length, station.dx / length] : lastNormal;
    lastNormal = normal;
    const w = half * profileWidthAt(profile, index / total);
    left.push([station.x + normal[0] * w, station.y + normal[1] * w]);
    right.push([station.x - normal[0] * w, station.y - normal[1] * w]);
  });
  return [...left, ...right.reverse()];
}
