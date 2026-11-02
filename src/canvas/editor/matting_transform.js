/**
 * The arithmetic around a matting model, kept away from the runtime that runs it.
 *
 * A segmentation model takes a fixed square input, so a picture has to be
 * letterboxed into it and the resulting mask mapped back onto the original
 * pixels. None of that needs ONNX, WebGPU or a canvas, so it lives here where
 * the node:test suite can drive it directly — the parts most likely to be
 * wrong (aspect ratios, off-by-one edges, normalisation) are the parts that
 * are hardest to eyeball in a rendered result.
 */

/** BiRefNet's published input size; the model is trained at this resolution. */
export const MATTING_INPUT_SIZE = 1024;

/** ImageNet statistics, the normalisation BiRefNet was trained with. */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406];
export const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * How to letterbox a picture into the model's square input.
 *
 * Scaling both axes independently would stretch the subject and cost accuracy
 * at the edges, so the longer side is fitted and the shorter one centred, with
 * the padding recorded so the mask can be cropped back out afterwards.
 *
 * @returns {{scale: number, width: number, height: number, offsetX: number,
 *   offsetY: number}} the drawn size and its top-left corner inside the square.
 */
export function fitToModelInput(width, height, size = MATTING_INPUT_SIZE) {
  if (!(width > 0) || !(height > 0)) {
    throw new Error("mattingInvalidSize");
  }
  const scale = Math.min(size / width, size / height);
  const drawnWidth = Math.max(1, Math.round(width * scale));
  const drawnHeight = Math.max(1, Math.round(height * scale));
  return {
    scale,
    width: drawnWidth,
    height: drawnHeight,
    offsetX: Math.floor((size - drawnWidth) / 2),
    offsetY: Math.floor((size - drawnHeight) / 2),
  };
}

/**
 * Turns RGBA bytes into the planar, normalised float tensor the model wants.
 *
 * Two conversions at once: interleaved RGBA becomes three separate planes
 * (NCHW), and each channel is centred on the ImageNet statistics. Alpha is
 * dropped — the model decides what is foreground, it is not told.
 *
 * @returns {Float32Array} length 3 * size * size, channel-major.
 */
export function toNormalisedTensor(
  rgba,
  size = MATTING_INPUT_SIZE,
  mean = IMAGENET_MEAN,
  std = IMAGENET_STD,
) {
  const pixels = size * size;
  if (rgba.length !== pixels * 4) {
    throw new Error("mattingTensorSizeMismatch");
  }
  const out = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    out[i] = (r - mean[0]) / std[0];
    out[pixels + i] = (g - mean[1]) / std[1];
    out[pixels * 2 + i] = (b - mean[2]) / std[2];
  }
  return out;
}

/** Squashes a logit into [0, 1]; BiRefNet's head is unnormalised. */
export function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

/**
 * True when the model's output is already probabilities rather than logits.
 *
 * Exported variants differ: some bake the sigmoid into the graph and some do
 * not, and applying it twice washes the matte out to a flat grey. Sampling the
 * range is a cheap, robust test — probabilities sit inside [0, 1], logits
 * spread well past it.
 */
export function looksLikeProbabilities(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  // A saturated logit map can sit inside [0, 1] by accident, so require the
  // spread to reach both ends the way a real probability map does.
  return min >= -0.001 && max <= 1.001;
}

/**
 * Stretches a mask to use the full 0..1 range.
 *
 * U^2-Net's head is confident about shape but not about scale: a clean
 * silhouette can come back spanning 0.2 to 0.7, which as alpha means a
 * background that is merely dimmed and a subject that is never solid. The
 * reference implementation normalises per image for exactly this reason, and
 * skipping it is what leaves a grey ghost of the scene behind the cutout.
 *
 * A flat mask is returned untouched: there is no range to stretch, and
 * dividing by it would turn a uniform result into noise.
 */
export function normaliseMask(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min;
  if (!(range > 1e-6)) return values;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[i] = (values[i] - min) / range;
  return out;
}

/**
 * Pushes a normalised mask towards its two ends, keeping the transition soft.
 *
 * Even after stretching, a small model leaves a wide band of middling alpha
 * around the subject, which reads as a halo. A smoothstep between two
 * thresholds collapses that band without hardening the edge into the
 * staircase a plain cutoff would produce — hair and fur still get partial
 * coverage, the wall behind them does not.
 */
export function hardenMask(values, low = 0.35, high = 0.65) {
  const out = new Float32Array(values.length);
  const span = Math.max(1e-6, high - low);
  for (let i = 0; i < values.length; i += 1) {
    const t = Math.min(1, Math.max(0, (values[i] - low) / span));
    out[i] = t * t * (3 - 2 * t);
  }
  return out;
}

/**
 * Crops the padding back off a square mask and returns it at model scale.
 *
 * @returns {Float32Array} `crop.width * crop.height` alpha values in [0, 1].
 */
export function cropMask(mask, crop, size = MATTING_INPUT_SIZE) {
  const out = new Float32Array(crop.width * crop.height);
  for (let y = 0; y < crop.height; y += 1) {
    const source = (y + crop.offsetY) * size + crop.offsetX;
    out.set(mask.subarray(source, source + crop.width), y * crop.width);
  }
  return out;
}

/**
 * Bilinearly resamples a single-channel mask to the picture's own size.
 *
 * Nearest-neighbour leaves a staircase along every edge, which is exactly
 * where a cutout is judged, so the extra arithmetic is worth it.
 */
export function resampleMask(mask, from, to) {
  const out = new Float32Array(to.width * to.height);
  const ratioX = from.width / to.width;
  const ratioY = from.height / to.height;
  for (let y = 0; y < to.height; y += 1) {
    // Clamped at both ends: the half-pixel offset makes the first row map to a
    // negative source, and a negative fraction extrapolates past the data
    // instead of interpolating within it.
    const sourceY = Math.min(
      from.height - 1,
      Math.max(0, (y + 0.5) * ratioY - 0.5),
    );
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(from.height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < to.width; x += 1) {
      const sourceX = Math.min(
        from.width - 1,
        Math.max(0, (x + 0.5) * ratioX - 0.5),
      );
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(from.width - 1, x0 + 1);
      const fx = sourceX - x0;
      const top =
        mask[y0 * from.width + x0] * (1 - fx) + mask[y0 * from.width + x1] * fx;
      const bottom =
        mask[y1 * from.width + x0] * (1 - fx) + mask[y1 * from.width + x1] * fx;
      out[y * to.width + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/**
 * Grows a selection box and clamps it to the picture.
 *
 * A box drawn tight against a subject cuts off the very edge the model needs
 * to see to find it, so a margin goes back on before cropping — enough
 * context to separate figure from ground, not so much that the surroundings
 * become salient again.
 */
export function padRegion(region, width, height, margin = 0.12) {
  const padX = Math.round(region.width * margin);
  const padY = Math.round(region.height * margin);
  const x = Math.max(0, Math.round(region.x) - padX);
  const y = Math.max(0, Math.round(region.y) - padY);
  return {
    x,
    y,
    width: Math.min(width - x, Math.round(region.width) + padX * 2),
    height: Math.min(height - y, Math.round(region.height) + padY * 2),
  };
}

/**
 * Places a region's mask back into a full-size one, everything else clear.
 *
 * The point of a region cutout is that the user has already said where the
 * subject is, so whatever the model thought about the rest of the picture is
 * not wanted — outside the box the matte is transparent by construction, not
 * by the model's opinion.
 */
export function placeRegionMask(regionMask, region, width, height) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < region.height; y += 1) {
    const targetY = region.y + y;
    if (targetY < 0 || targetY >= height) continue;
    for (let x = 0; x < region.width; x += 1) {
      const targetX = region.x + x;
      if (targetX < 0 || targetX >= width) continue;
      out[targetY * width + targetX] = regionMask[y * region.width + x];
    }
  }
  return out;
}

/** The tight box around a polygon, in the picture's own pixels. */
export function polygonBounds(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("mattingInvalidPolygon");
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.max(1, Math.ceil(maxX) - Math.floor(minX)),
    height: Math.max(1, Math.ceil(maxY) - Math.floor(minY)),
  };
}

/**
 * Even-odd point-in-polygon, the rule a lasso implies.
 *
 * Even-odd rather than winding so a lasso crossed over itself punches a hole
 * where the user drew one, instead of filling it.
 */
export function pointInPolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const straddles = a.y > y !== b.y > y;
    if (!straddles) continue;
    const crossing = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (x < crossing) inside = !inside;
  }
  return inside;
}

/**
 * Clears everything outside a lasso, leaving the model's answer inside it.
 *
 * The same contract as a rectangular region: the user has already said where
 * the subject is, so the area they excluded is transparent because they said
 * so. Coordinates are the picture's, so the polygon needs no rebasing.
 */
export function clipMaskToPolygon(mask, points, width, height) {
  const out = new Float32Array(mask.length);
  const box = polygonBounds(points);
  const endY = Math.min(height, box.y + box.height);
  const endX = Math.min(width, box.x + box.width);
  for (let y = Math.max(0, box.y); y < endY; y += 1) {
    for (let x = Math.max(0, box.x); x < endX; x += 1) {
      // Sampled at the pixel centre: a boundary that runs between pixels
      // should not decide membership by a rounding accident.
      if (pointInPolygon(points, x + 0.5, y + 0.5)) {
        out[y * width + x] = mask[y * width + x];
      }
    }
  }
  return out;
}

/**
 * Builds the RGBA bytes of the matte the editor stores.
 *
 * White pixels carrying the mask in their alpha, because the compositor draws
 * the matte over the picture with `destination-in` — only alpha is read, and
 * a white body keeps the matte legible if it is ever inspected on its own.
 */
export function maskToRgba(mask, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const alpha = Math.round(Math.min(1, Math.max(0, mask[i])) * 255);
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = alpha;
  }
  return out;
}
