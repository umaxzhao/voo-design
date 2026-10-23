/**
 * Colour decontamination for the soft edge of a cutout.
 *
 * `applyMatte` composites a picture with its alpha matte using
 * `destination-in`, which leaves the subject's semi-transparent edge carrying
 * a mixture of the subject's own colour and whatever colour was behind it in
 * the original picture. On a new background that mixture reads as a fringe of
 * the old one. The edge pixel is `p = alpha * fg + (1 - alpha) * bg`, so once
 * `bg` is estimated the subject's colour can be recovered:
 *
 *     fg = (p - (1 - alpha) * bg) / alpha
 *
 * The estimate comes from the neighbourhood rather than from a global value:
 * a cutout's old background can change across the frame, and the pixels just
 * outside the edge are the ones that saw the same background as the fringe.
 * Fully transparent neighbours are preferred because their RGB is the old
 * background at full strength; when the renderer has discarded that colour
 * (canvas compositing stores transparent black) the nearest low-alpha pixels
 * stand in, weighted toward the most transparent ones.
 *
 * Everything is arithmetic over typed arrays: no DOM, no canvas, no ONNX. The
 * function mutates the buffer it is given, because its caller already owns the
 * render-time composite.
 */

/** Strength below 1 keeps some of the original edge; radius is a pixel window. */
export const MATTE_DEFRINGE_DEFAULTS = Object.freeze({
  strength: 1,
  radius: 2,
});

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampByte(value) {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function assertGeometry(width, height) {
  const whole = Number.isInteger(width) && Number.isInteger(height);
  if (!whole || width <= 0 || height <= 0) {
    throw new Error("matteDefringeInvalidSize");
  }
}

function assertRgbaLength(rgba, count) {
  if (!rgba || typeof rgba.length !== "number" || rgba.length !== count * 4) {
    throw new Error("matteDefringeRgbaSizeMismatch");
  }
}

/** A window radius as a whole number of pixels; anything unusable is zero. */
function resolveRadius(value, fallback) {
  const radius = Math.floor(Number(value ?? fallback));
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

/**
 * The old background behind one fringe pixel, written into `out`.
 *
 * Looks in a square window because that is the shape the rest of the matte
 * code uses for a radius. Fully transparent neighbours carry the background
 * directly. A transparent black is what a canvas leaves after compositing,
 * not a colour the picture had, so it is only used as a last resort when no
 * low-alpha neighbour exists to estimate from.
 *
 * The low-alpha fallback is weighted by `255 - alpha`: the pixel closest to
 * vanishing saw the least of the subject, so it is the best remaining witness
 * of the background.
 *
 * @returns {boolean} false when the window has no neighbour to estimate from.
 */
function estimateBackground(source, width, height, cx, cy, radius, alpha, out) {
  const minX = Math.max(0, cx - radius);
  const maxX = Math.min(width - 1, cx + radius);
  const minY = Math.max(0, cy - radius);
  const maxY = Math.min(height - 1, cy + radius);

  let transparentR = 0;
  let transparentG = 0;
  let transparentB = 0;
  let transparentCount = 0;
  let transparentHasColour = false;

  let lowR = 0;
  let lowG = 0;
  let lowB = 0;
  let lowWeight = 0;

  for (let y = minY; y <= maxY; y += 1) {
    const row = y * width;
    for (let x = minX; x <= maxX; x += 1) {
      if (x === cx && y === cy) continue;
      const p = (row + x) * 4;
      const neighbourAlpha = source[p + 3];
      if (neighbourAlpha === 0) {
        const r = source[p];
        const g = source[p + 1];
        const b = source[p + 2];
        transparentR += r;
        transparentG += g;
        transparentB += b;
        transparentCount += 1;
        if (r !== 0 || g !== 0 || b !== 0) transparentHasColour = true;
      } else if (neighbourAlpha < 255) {
        const weight = 255 - neighbourAlpha;
        lowR += source[p] * weight;
        lowG += source[p + 1] * weight;
        lowB += source[p + 2] * weight;
        lowWeight += weight;
      }
    }
  }

  if (transparentCount > 0 && (transparentHasColour || lowWeight === 0)) {
    out[0] = transparentR / transparentCount;
    out[1] = transparentG / transparentCount;
    out[2] = transparentB / transparentCount;
    return true;
  }
  if (lowWeight > 0) {
    out[0] = lowR / lowWeight;
    out[1] = lowG / lowWeight;
    out[2] = lowB / lowWeight;
    return true;
  }
  if (transparentCount > 0) {
    out[0] = transparentR / transparentCount;
    out[1] = transparentG / transparentCount;
    out[2] = transparentB / transparentCount;
    return true;
  }
  return false;
}

/**
 * Removes old-background colour from the semi-transparent edge of a cutout.
 *
 * The buffer must already have the matte applied (`destination-in`, so the
 * background is transparent and the fringe lives in pixels with `0 < alpha <
 * 255`). Fully opaque pixels are the subject and fully transparent pixels are
 * the background, so both are left bit for bit unchanged; alpha itself is
 * never touched, only RGB.
 *
 * A full copy is taken before writing so every pixel's estimate is made from
 * the original composite, not from neighbours this pass already rewrote. The
 * copy is the price of a stable result and is paid once per matte, where
 * `applyMatte` caches the canvas.
 *
 * @param {Uint8ClampedArray|Uint8Array} data RGBA bytes, length `width * height * 4`.
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {number} [options.strength] 0..1 blend toward the unmixed colour.
 * @param {number} [options.radius] neighbour search radius in pixels.
 * @returns {Uint8ClampedArray|Uint8Array} the same buffer, mutated.
 */
export function defringeRgba(data, width, height, options = {}) {
  assertGeometry(width, height);
  assertRgbaLength(data, width * height);
  const radius = resolveRadius(options.radius, MATTE_DEFRINGE_DEFAULTS.radius);
  const strength = clamp01(options.strength ?? MATTE_DEFRINGE_DEFAULTS.strength);
  if (strength === 0 || radius < 1) return data;

  const source = data.slice ? data.slice() : new Uint8ClampedArray(data);
  const background = [0, 0, 0];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const alpha = source[p + 3];
      if (alpha === 0 || alpha === 255) continue;
      if (!estimateBackground(source, width, height, x, y, radius, alpha, background)) {
        continue;
      }

      const unit = alpha / 255;
      const inverse = 1 - unit;
      for (let channel = 0; channel < 3; channel += 1) {
        const unmixed = clampByte(
          (source[p + channel] - inverse * background[channel]) / unit,
        );
        data[p + channel] = clampByte(
          source[p + channel] + strength * (unmixed - source[p + channel]),
        );
      }
    }
  }
  return data;
}
