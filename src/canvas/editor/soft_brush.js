/**
 * The soft (feathered) brush.
 *
 * A soft stroke is stamped rather than stroked: the same radial-gradient
 * sprite is drawn repeatedly along the path, because Canvas2D has no
 * feathered line cap. The sprite costs enough to be worth caching and is
 * small enough that a bounded cache is plenty.
 *
 * Gradient stops and stamp spacing come back as plain numbers, so that maths
 * is testable without a canvas at all.
 */

/**
 * A soft brush's alpha profile: fully opaque from the centre out to
 * `hardness` of the radius, then a smoothstep fade to transparent at the
 * edge. Linear ramps read as a misty even fade with a hard rim where they
 * hit zero; the smoothstep curve (this module's "radial gradient" look)
 * keeps the core solid, eases through the mid-tones and lands on the edge
 * with zero slope, so the stamp melts into the page instead of stopping.
 */
export function softBrushAlpha(t, hardness) {
  const core = Math.min(
    1,
    Math.max(0, Number.isFinite(hardness) ? hardness : 1),
  );
  if (core >= 1) return t < 1 ? 1 : 0;
  if (t <= core) return 1;
  const u = (t - core) / (1 - core);
  const smooth = u * u * (3 - 2 * u);
  return 1 - smooth;
}

/**
 * Gradient stops for a soft brush stamp, returned as [offset, alpha] pairs so
 * the maths is testable without a canvas. The smoothstep falloff is sampled
 * on the way down — canvas interpolates linearly between stops, so a handful
 * of samples on the curve reads as the curve itself at any sprite size.
 */
export function softBrushGradientStops(hardness) {
  const core = Math.min(
    1,
    Math.max(0, Number.isFinite(hardness) ? hardness : 1),
  );
  if (core >= 1) {
    return [
      [0, 1],
      [1, 1],
      [1, 0],
    ];
  }
  const SAMPLES = 8;
  const stops = [[0, 1]];
  for (let index = 1; index <= SAMPLES; index += 1) {
    const t = core + (1 - core) * (index / SAMPLES);
    stops.push([t, softBrushAlpha(t, core)]);
  }
  return stops;
}

/**
 * Distance between two stamps along a soft stroke, in doc px. Dense enough
 * that the overlapping balls read as one continuous stroke.
 */
export function softBrushStampSpacing(radius) {
  return Math.max(1, radius * 0.15);
}

/**
 * Where a quadratic Bézier is at parameter t (0..1). A control point that
 * lies on the start-end line makes the curve the straight line itself, so
 * the same formula stamps both the curves and the straight lead-in and tail
 * of a stroke.
 */
export function quadraticPointAt(start, ctrl, end, t) {
  const u = 1 - t;
  return {
    x: u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y,
  };
}

/**
 * Walks one quadratic segment at stamp spacing, calling `stamp` with each
 * position and the arc progress (0..1) so callers can interpolate pressure.
 *
 * The curve is split into small linear pieces so the spacing is measured
 * along the true arc length rather than the control polygon, and `carried` —
 * the distance left over from the previous segment — continues across
 * segments so samples stay evenly spaced around corners instead of
 * restarting at every vertex. Returns the carried distance for the next
 * segment.
 */
export function stampQuadraticSegment(
  start,
  ctrl,
  end,
  spacing,
  carried,
  stamp,
) {
  const LINEAR_STEPS = 24;
  let offset = spacing - carried;
  let prev = start;
  for (let index = 1; index <= LINEAR_STEPS; index += 1) {
    const t = index / LINEAR_STEPS;
    const next = quadraticPointAt(start, ctrl, end, t);
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy);
    while (length > 0 && offset <= length) {
      const f = offset / length;
      const progress = (index - 1 + f) / LINEAR_STEPS;
      stamp(prev.x + dx * f, prev.y + dy * f, progress);
      offset += spacing;
    }
    carried = length > 0 ? length - (offset - spacing) : carried;
    prev = next;
    // The offset is measured from the current sub-segment's start; step it
    // back by the length just walked so the next sub-segment continues the
    // same stamp pitch across the join.
    offset -= length;
  }
  return carried;
}

/**
 * A colour string with an alpha applied. The mark palette is all hex, which
 * parses exactly.
 *
 * The zero stop is the stroke's own colour at alpha 0 — never the
 * `transparent` keyword. That keyword is transparent *black*, and canvas
 * interpolates gradient stops in straight (non-premultiplied) RGBA, so a
 * ramp ending there fades through a darkened mid-point: a white soft brush
 * grows a grey fringe, which on the page reads as a black edge. Fading to
 * the same hue keeps every interpolated stop on-colour and only the alpha
 * falls away.
 */
export function colourWithAlpha(colour, alpha) {
  if (alpha >= 1) return colour;
  const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour);
  if (!hex) return alpha <= 0 ? "transparent" : colour;
  let r;
  let g;
  let b;
  if (colour.length === 4) {
    r = parseInt(colour[1] + colour[1], 16);
    g = parseInt(colour[2] + colour[2], 16);
    b = parseInt(colour[3] + colour[3], 16);
  } else {
    r = parseInt(colour.slice(1, 3), 16);
    g = parseInt(colour.slice(3, 5), 16);
    b = parseInt(colour.slice(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Rasterised soft stamps, keyed by colour, pixel size and hardness. Paths are
 * redrawn every frame during pan/zoom, and building the radial gradient is by
 * far the expensive half of a stamp — so each sprite is painted once and then
 * blitted with drawImage. The map is a tiny LRU: insertion order is the
 * eviction order, and a hit re-inserts its entry at the tail.
 */
const softBrushSpriteCache = new Map();
const SOFT_BRUSH_SPRITE_CACHE_MAX = 32;

/**
 * Rasterises a soft stamp, its alpha scaled by `coverage`.
 *
 * `coverage` is 1 for a single dab and `spacing / diameter` for stamps laid
 * along a stroke. Stamps overlap ~13-deep on a stroke, so without the scale
 * the semi-transparent edges accumulate under source-over into a near-opaque
 * band — the soft edge reads as hard and the "alpha transparency" disappears.
 * Scaled, the accumulated stroke reaches full coverage at its core and fades
 * smoothly to transparent at the edge, Photoshop-style.
 */
export function softBrushSprite(stroke, size, hardness, coverage = 1) {
  // Whole-pixel buckets keep pressure variants bounded without forcing an
  // even diameter. A 1px soft stamp needs its one centre sample; expanding it
  // to 2x2 makes every sample miss the radial-gradient centre and turns faint.
  const pixels = Math.max(1, Math.round(size));
  const roundedCoverage = Math.round(coverage * 100) / 100;
  const key = `${stroke}|${pixels}|${Math.round(hardness * 100)}|${roundedCoverage}`;
  const cached = softBrushSpriteCache.get(key);
  if (cached) {
    softBrushSpriteCache.delete(key);
    softBrushSpriteCache.set(key, cached);
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const spriteCtx = canvas.getContext("2d");
  const radius = pixels / 2;
  const gradient = spriteCtx.createRadialGradient(
    radius,
    radius,
    0,
    radius,
    radius,
    radius,
  );
  for (const [offset, alpha] of softBrushGradientStops(hardness)) {
    gradient.addColorStop(
      offset,
      colourWithAlpha(stroke, alpha * roundedCoverage),
    );
  }
  spriteCtx.fillStyle = gradient;
  spriteCtx.fillRect(0, 0, pixels, pixels);

  if (softBrushSpriteCache.size >= SOFT_BRUSH_SPRITE_CACHE_MAX) {
    softBrushSpriteCache.delete(softBrushSpriteCache.keys().next().value);
  }
  softBrushSpriteCache.set(key, canvas);
  return canvas;
}

/**
 * A soft stroke: the polyline is walked at stamp spacing and a pre-rasterised
 * radial-gradient ball is blitted at each sample. The stamp follows the node
 * box's scale, like the points do, so a resized stroke keeps its proportions.
 *
 * The path is smoothed the same way the hard stroke's curve is: consecutive
 * sample midpoints become the segment endpoints, the samples themselves the
 * control points. Stamping along that curve rather than the raw polyline is
 * what keeps a fast arc from faceting at every input point — the curve the
 * stroke *will* have is the curve the stroke is painted with.
 *
 * The walk is behind `place(x, y, width, height)` so every renderer stamps
 * the identical positions and sizes: the 2D path paints the sprite at each,
 * the Skia adapter emits a gradient-filled ellipse. One curve, one spacing,
 * one pressure scale — two painters.
 */
export function forEachSoftStamp(node, at, scaleX, scaleY, place) {
  const points = node.points;
  const baseStampW = node.strokeWidth * scaleX;
  const baseStampH = node.strokeWidth * scaleY;
  const stamp = (x, y, p = 0.5) => {
    // Pressure scales the stamp: mid pressure is nominal, a full-pressure dig
    // multiplies by 1.2, the lightest touch by 0.4.
    const pScale = 0.4 + p * 0.8;
    place(x, y, baseStampW * pScale, baseStampH * pScale);
  };

  const [firstX, firstY, firstP] = at(0);
  if (points.length === 1) {
    // A tap still deserves a dot.
    stamp(firstX, firstY, firstP);
    return;
  }

  const P = points.map((_, index) => {
    const [x, y, p] = at(index);
    return { x, y, p: p ?? 0.5 };
  });
  const midOf = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const spacing = softBrushStampSpacing(Math.max(baseStampW, baseStampH) / 2);
  let carried = 0;
  stamp(P[0].x, P[0].y, P[0].p);

  // Straight lead-in from the first sample to the first midpoint.
  const leadEnd = midOf(P[0], P[1]);
  carried = stampQuadraticSegment(
    P[0],
    midOf(P[0], leadEnd),
    leadEnd,
    spacing,
    carried,
    (x, y, t) => stamp(x, y, P[0].p + (P[1].p - P[0].p) * t),
  );

  // One curve per interior sample: mid(P[i-1], P[i]) → mid(P[i], P[i+1]),
  // with the sample itself as the control point.
  for (let index = 1; index < P.length - 1; index += 1) {
    const start = midOf(P[index - 1], P[index]);
    const end = midOf(P[index], P[index + 1]);
    carried = stampQuadraticSegment(
      start,
      P[index],
      end,
      spacing,
      carried,
      (x, y, t) =>
        stamp(x, y, P[index - 1].p + (P[index + 1].p - P[index - 1].p) * t),
    );
  }

  // Straight tail from the last midpoint to the final sample.
  const tailStart = midOf(P[P.length - 2], P[P.length - 1]);
  stampQuadraticSegment(
    tailStart,
    midOf(tailStart, P[P.length - 1]),
    P[P.length - 1],
    spacing,
    carried,
    (x, y, t) =>
      stamp(
        x,
        y,
        P[P.length - 2].p + (P[P.length - 1].p - P[P.length - 2].p) * t,
      ),
  );
  // Land exactly on the final point, the way the hard stroke's round cap does.
  stamp(P[P.length - 1].x, P[P.length - 1].y, P[P.length - 1].p);
}

/**
 * The 2D painter of a soft stroke: the sprite — one cached radial-gradient
 * canvas — stamped at every position `forEachSoftStamp` walks.
 */
export function drawSoftPathNode(ctx, node, at, scaleX, scaleY) {
  const sprite = softBrushSprite(
    node.stroke,
    Math.max(node.strokeWidth * scaleX, node.strokeWidth * scaleY),
    node.hardness,
  );
  forEachSoftStamp(
    node,
    at,
    scaleX,
    scaleY,
    (x, y, stampWidth, stampHeight) => {
      ctx.drawImage(
        sprite,
        x - stampWidth / 2,
        y - stampHeight / 2,
        stampWidth,
        stampHeight,
      );
    },
  );
}
