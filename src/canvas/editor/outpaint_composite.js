/**
 * Priming and seam blending for the outpaint (image extension) gesture.
 *
 * WHY PRIMING BEATS A VOID
 * What goes to the model is the original bitmap inside a canvas grown by the
 * same ratio the drag rect grew by. That margin used to go out empty
 * (transparent), so the model saw a hole and invented a scene from nothing,
 * guessing its own colour, light and texture for it. Those guesses never match
 * the original at the join — that mismatch is the colour shift and the
 * "pasted-on" band the user sees. Priming fills the margin with a continuation
 * of the picture (edge extend, mirrored reflection, or a softened mirror), so
 * the model refines what is already there: palette, lighting and structure
 * stay continuous, and the "the border is transparent, paint something into
 * it" reading that invites unrelated content is gone.
 *
 * WHY THE ORIGINAL IS WRITTEN BACK INSTEAD OF THE MODEL'S COPY OF IT
 * The model answers with a whole canvas, including a re-render of the region
 * the user never asked to change. Writing it back replaces real pixels with a
 * generation that differs in tone and detail — a visible line — and loses the
 * original at whatever resolution the output cap allowed. So the answer only
 * supplies the grown margin: the original region is copied from the source
 * byte for byte, and a feathered band along the join blends the model's margin
 * into it so no hard edge survives the boundary.
 *
 * Pure pixel maths: no DOM, no canvas, no network. Buffers are RGBA byte views
 * (Uint8Array / Uint8ClampedArray), row-major, four bytes per pixel.
 */

const RGBA_STRIDE = 4;

/** Priming strategies, from "smears the edge" to "reflects and softens". */
export const OUTPAINT_PRIME_MODES = Object.freeze([
  "extend",
  "mirror",
  "mirrorBlur",
]);

/**
 * Mirror, then soften — the default. Reflection continues real texture where
 * edge-extend smears it into streaks; softening removes the hard symmetry line
 * the mirrored copy leaves at the join. Filling the margin with plausible
 * content is the model's job; this only hands it the raw material.
 */
export const DEFAULT_OUTPAINT_PRIME_MODE = "mirrorBlur";

/**
 * Box-blur radius for `mirrorBlur`, in output pixels. The radius is the cost
 * knob (taps grow with its square) and, past 2, also blurs away the very
 * texture the model is meant to continue.
 */
export const DEFAULT_MIRROR_BLUR_RADIUS = 2;

/**
 * Width in output pixels of the feather across the join. Wide enough to hide a
 * full-range tone difference (a 16px ramp spreads 255 levels over ~16 levels
 * per pixel step), narrow enough not to leave a soft zone in the new area.
 */
export const DEFAULT_OUTPAINT_SEAM = 16;

function fail(message) {
  throw new Error(`outpaint_composite: ${message}`);
}

function isByteBuffer(value) {
  return value instanceof Uint8ClampedArray || value instanceof Uint8Array;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer`);
  }
}

function assertBuffer(buffer, expectedLength, label) {
  if (!isByteBuffer(buffer)) {
    fail(`${label} must be a Uint8Array or Uint8ClampedArray`);
  }
  if (buffer.length !== expectedLength) {
    fail(`${label} has ${buffer.length} bytes, expected ${expectedLength}`);
  }
}

function assertPlan(plan) {
  if (!plan || typeof plan !== "object") fail("plan is required");
  assertPositiveInteger(plan.width, "plan.width");
  assertPositiveInteger(plan.height, "plan.height");
  assertPositiveInteger(plan.drawWidth, "plan.drawWidth");
  assertPositiveInteger(plan.drawHeight, "plan.drawHeight");
  if (!Number.isInteger(plan.offsetX) || !Number.isInteger(plan.offsetY)) {
    fail("plan offsets must be integers");
  }
  if (plan.offsetX < 0 || plan.offsetY < 0) fail("plan offsets must not be negative");
  if (
    plan.offsetX + plan.drawWidth > plan.width ||
    plan.offsetY + plan.drawHeight > plan.height
  ) {
    fail("the original does not fit inside the plan canvas");
  }
}

function assertMode(mode) {
  if (!OUTPAINT_PRIME_MODES.includes(mode)) {
    fail(`unknown prime mode "${mode}" (expected ${OUTPAINT_PRIME_MODES.join(", ")})`);
  }
}

/**
 * Where the source lands inside the output canvas, in output pixels. `x1`/`y1`
 * are exclusive. `scaleX`/`scaleY` convert output pixels to source pixels, so
 * a plan drawn at the source's own size gives 1 and the copy stays lossless.
 */
function placementGeometry(plan, sourceWidth, sourceHeight) {
  return {
    x0: plan.offsetX,
    y0: plan.offsetY,
    x1: plan.offsetX + plan.drawWidth,
    y1: plan.offsetY + plan.drawHeight,
    scaleX: sourceWidth / plan.drawWidth,
    scaleY: sourceHeight / plan.drawHeight,
  };
}

function insidePlacement(x, y, geom) {
  return x >= geom.x0 && x < geom.x1 && y >= geom.y0 && y < geom.y1;
}

/**
 * Source index an output coordinate samples; out-of-range indices are clamped
 * for `extend` and reflected about the boundary just outside the last pixel for
 * the mirror modes (`size` → `size - 1`, `-1` → `0`).
 */
function marginIndex(coordinate, origin, scale, size, mode) {
  const index = Math.floor((coordinate + 0.5 - origin) * scale);
  if (index >= 0 && index < size) return index;
  if (mode === "extend") return index < 0 ? 0 : size - 1;
  const period = size * 2;
  const wrapped = ((index % period) + period) % period;
  return wrapped < size ? wrapped : period - 1 - wrapped;
}

/** Bilinear sample of the source at fractional pixel-centre coordinates. */
function sampleBilinear(source, sourceWidth, sourceHeight, fx, fy, out, target) {
  const left = Math.floor(fx);
  const top = Math.floor(fy);
  const tx = fx - left;
  const ty = fy - top;
  const xl = clamp(left, 0, sourceWidth - 1);
  const xr = clamp(left + 1, 0, sourceWidth - 1);
  const yt = clamp(top, 0, sourceHeight - 1);
  const yb = clamp(top + 1, 0, sourceHeight - 1);
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const p00 = (yt * sourceWidth + xl) * RGBA_STRIDE;
  const p10 = (yt * sourceWidth + xr) * RGBA_STRIDE;
  const p01 = (yb * sourceWidth + xl) * RGBA_STRIDE;
  const p11 = (yb * sourceWidth + xr) * RGBA_STRIDE;
  for (let c = 0; c < RGBA_STRIDE; c += 1) {
    out[target + c] = Math.round(
      source[p00 + c] * w00 +
        source[p10 + c] * w10 +
        source[p01 + c] * w01 +
        source[p11 + c] * w11,
    );
  }
}

/**
 * Places the source inside the output canvas. At scale 1 this is a row copy —
 * byte-identical to the source by construction; otherwise it resamples.
 */
function blitSource(source, sourceWidth, sourceHeight, out, outWidth, geom) {
  if (geom.scaleX === 1 && geom.scaleY === 1) {
    const rowBytes = (geom.x1 - geom.x0) * RGBA_STRIDE;
    for (let y = geom.y0; y < geom.y1; y += 1) {
      const from = (y - geom.y0) * sourceWidth * RGBA_STRIDE;
      out.set(source.subarray(from, from + rowBytes), (y * outWidth + geom.x0) * RGBA_STRIDE);
    }
    return;
  }
  for (let y = geom.y0; y < geom.y1; y += 1) {
    const fy = (y + 0.5 - geom.y0) * geom.scaleY - 0.5;
    for (let x = geom.x0; x < geom.x1; x += 1) {
      const fx = (x + 0.5 - geom.x0) * geom.scaleX - 0.5;
      sampleBilinear(source, sourceWidth, sourceHeight, fx, fy, out, (y * outWidth + x) * RGBA_STRIDE);
    }
  }
}

/**
 * Fills every pixel outside the placed rect from the nearest source pixel,
 * resolved through `mode`. Both axes resolve independently, so the corners come
 * from the corner source pixel instead of staying void.
 */
function fillMargin(source, sourceWidth, sourceHeight, out, plan, geom, mode) {
  const { width, height } = plan;
  for (let y = 0; y < height; y += 1) {
    const sy = marginIndex(y, geom.y0, geom.scaleY, sourceHeight, mode);
    const rowShared = !(y >= geom.y0 && y < geom.y1);
    for (let x = 0; x < width; x += 1) {
      if (!rowShared && x >= geom.x0 && x < geom.x1) {
        x = geom.x1 - 1; // the interior span is already placed — jump it
        continue;
      }
      const sx = marginIndex(x, geom.x0, geom.scaleX, sourceWidth, mode);
      const from = (sy * sourceWidth + sx) * RGBA_STRIDE;
      const to = (y * width + x) * RGBA_STRIDE;
      out[to] = source[from];
      out[to + 1] = source[from + 1];
      out[to + 2] = source[from + 2];
      out[to + 3] = source[from + 3];
    }
  }
}

/**
 * Box-blurs the primed margin, so a mirrored copy loses its hard symmetry line.
 * Only margin pixels are written; the window still reads the untouched original
 * across the join, which keeps it soft. Averages come from a snapshot, so the
 * result never depends on traversal order.
 */
function softenMargin(out, plan, geom, radius) {
  if (radius <= 0) return;
  const { width, height } = plan;
  const snapshot = out.slice();
  const taps = (radius * 2 + 1) * (radius * 2 + 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (insidePlacement(x, y, geom)) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx += 1) {
          const i = (yy * width + clamp(x + dx, 0, width - 1)) * RGBA_STRIDE;
          r += snapshot[i];
          g += snapshot[i + 1];
          b += snapshot[i + 2];
          a += snapshot[i + 3];
        }
      }
      const target = (y * width + x) * RGBA_STRIDE;
      out[target] = Math.round(r / taps);
      out[target + 1] = Math.round(g / taps);
      out[target + 2] = Math.round(b / taps);
      out[target + 3] = Math.round(a / taps);
    }
  }
}
/**
 * Primes the grown margin of `plan` with a continuation of the source and
 * returns it as a NEW RGBA buffer of the plan's size, ready to be sent to the
 * model. The original keeps its own pixels; `mode` picks how the margin
 * continues it. Deterministic.
 */
export function primeOutpaintMargin(sourceRgba, options) {
  if (!options || typeof options !== "object") fail("options are required");
  const { sourceWidth, sourceHeight, plan } = options;
  const mode = options.mode ?? DEFAULT_OUTPAINT_PRIME_MODE;
  const blurRadius = options.blurRadius ?? DEFAULT_MIRROR_BLUR_RADIUS;
  assertPositiveInteger(sourceWidth, "sourceWidth");
  assertPositiveInteger(sourceHeight, "sourceHeight");
  assertPlan(plan);
  assertMode(mode);
  if (!Number.isInteger(blurRadius) || blurRadius < 0) {
    fail("blurRadius must be an integer >= 0");
  }
  assertBuffer(sourceRgba, sourceWidth * sourceHeight * RGBA_STRIDE, "sourceRgba");

  const out = new Uint8ClampedArray(plan.width * plan.height * RGBA_STRIDE);
  const geom = placementGeometry(plan, sourceWidth, sourceHeight);
  blitSource(sourceRgba, sourceWidth, sourceHeight, out, plan.width, geom);
  fillMargin(sourceRgba, sourceWidth, sourceHeight, out, plan, geom, mode);
  if (mode === "mirrorBlur") softenMargin(out, plan, geom, blurRadius);
  return out;
}

/** Pixels from `value` to the [start, end) rect range: 0 inside, 1 just out. */
function outsideDistance(value, start, end) {
  if (value < start) return start - value;
  if (value >= end) return value - end + 1;
  return 0;
}

/**
 * How much of the model's pixel the composite keeps at (x, y): 0 everywhere
 * inside the placed rect — the original is never re-rendered — 0 for the first
 * pixel outside it (so the join is exactly continuous), ramping to 1 over
 * `seam` pixels. The two axes take the larger distance, which makes the ramp
 * symmetric around corners instead of stretching them into a wedge.
 */
function modelWeight(x, y, geom, seam) {
  if (insidePlacement(x, y, geom)) return 0;
  const distance = Math.max(
    outsideDistance(x, geom.x0, geom.x1),
    outsideDistance(y, geom.y0, geom.y1),
  );
  return Math.min(1, Math.max(0, distance - 1) / seam);
}

/**
 * The seam ramp, made inspectable: the four rectangular bands that carry it and
 * the model weight of every pixel in each. Bands overlap in the corners, where
 * their weights agree because both are `modelWeight`; a pixel outside every
 * band takes the model's pixel whole. The composite below applies the same
 * `modelWeight`, so the two cannot drift apart.
 */
export function planSeamBand(plan, seam = DEFAULT_OUTPAINT_SEAM) {
  assertPlan(plan);
  assertPositiveInteger(seam, "seam");
  const geom = placementGeometry(plan, plan.drawWidth, plan.drawHeight);
  // The first pixel outside the rect already carries weight 0, so the ramp
  // needs `seam` steps beyond it: seam + 1 pixels per side.
  const span = seam + 1;
  const leftX = Math.max(0, geom.x0 - span);
  const topY = Math.max(0, geom.y0 - span);
  const sides = [
    // side, x, y, width, height — strips span the cross axis (covering corners).
    ["left", leftX, 0, geom.x0 - leftX, plan.height],
    ["right", geom.x1, 0, Math.min(plan.width, geom.x1 + span) - geom.x1, plan.height],
    ["top", 0, topY, plan.width, geom.y0 - topY],
    ["bottom", 0, geom.y1, plan.width, Math.min(plan.height, geom.y1 + span) - geom.y1],
  ];

  const bands = [];
  for (const [side, x, y, width, height] of sides) {
    if (width <= 0 || height <= 0) continue;
    // Float64: a narrower store would report a ramp off the one applied.
    const weights = new Float64Array(width * height);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        weights[row * width + column] = modelWeight(x + column, y + row, geom, seam);
      }
    }
    bands.push({ side, x, y, width, height, weights });
  }
  return { width: plan.width, height: plan.height, seam, bands };
}

/**
 * Blends the model's margin into the output, towards the edge-extend
 * continuation of the source: the one continuation continuous with the original
 * in both axes, so a weight of 0 leaves no step at the join. The model's own
 * pixels are the far end of the ramp and own everything beyond it.
 */
function blendMargin(result, source, sourceWidth, sourceHeight, out, plan, geom, seam) {
  const { width, height } = plan;
  for (let y = 0; y < height; y += 1) {
    const sy = marginIndex(y, geom.y0, geom.scaleY, sourceHeight, "extend");
    for (let x = 0; x < width; x += 1) {
      if (insidePlacement(x, y, geom)) continue;
      const sx = marginIndex(x, geom.x0, geom.scaleX, sourceWidth, "extend");
      const weight = modelWeight(x, y, geom, seam);
      const reference = (sy * sourceWidth + sx) * RGBA_STRIDE;
      const target = (y * width + x) * RGBA_STRIDE;
      for (let c = 0; c < RGBA_STRIDE; c += 1) {
        out[target + c] = Math.round(
          source[reference + c] * (1 - weight) + result[target + c] * weight,
        );
      }
    }
  }
}

/**
 * Merges a returned generation into the outpaint result, as a NEW RGBA buffer
 * of the plan's size: the placed rect keeps the ORIGINAL source pixels (the
 * model's re-render of it is discarded), the grown margin keeps the model's,
 * and a `seam`-pixel feather blends the two across the join. `sourceWidth` /
 * `sourceHeight` default to the plan's draw size, i.e. a source handed over
 * already at placement resolution.
 */
export function compositeOutpaintResult(resultRgba, sourceRgba, options) {
  if (!options || typeof options !== "object") fail("options are required");
  const { plan } = options;
  const seam = options.seam ?? DEFAULT_OUTPAINT_SEAM;
  assertPlan(plan);
  assertPositiveInteger(seam, "seam");
  const sourceWidth = options.sourceWidth ?? plan.drawWidth;
  const sourceHeight = options.sourceHeight ?? plan.drawHeight;
  assertPositiveInteger(sourceWidth, "sourceWidth");
  assertPositiveInteger(sourceHeight, "sourceHeight");
  assertBuffer(resultRgba, plan.width * plan.height * RGBA_STRIDE, "resultRgba");
  assertBuffer(sourceRgba, sourceWidth * sourceHeight * RGBA_STRIDE, "sourceRgba");

  const out = new Uint8ClampedArray(plan.width * plan.height * RGBA_STRIDE);
  const geom = placementGeometry(plan, sourceWidth, sourceHeight);
  blitSource(sourceRgba, sourceWidth, sourceHeight, out, plan.width, geom);
  blendMargin(resultRgba, sourceRgba, sourceWidth, sourceHeight, out, plan, geom, seam);
  return out;
}
