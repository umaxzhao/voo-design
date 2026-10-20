/**
 * Tiling maths for on-device super-resolution.
 *
 * A compact 2x/4x super-resolution model is fully convolutional, so nothing
 * forces it to see the whole image at once: the same session can be fed one
 * tile at a time and the results composited. That is the only way to run such
 * a model over an ordinary 12-24 MP photo, because a single pass allocates
 * float buffers proportional to the whole image:
 *
 *   12 MP source, 2x model
 *     input  tensor 12 M x 3 x 4 B  =  144 MB
 *     output tensor 48 M x 3 x 4 B  =  576 MB
 *     8-bit output ImageData        =  192 MB
 *
 * None of those is bounded by anything but the photo size, and the backend
 * fails the allocation long before the user sees a result. Tiled execution
 * replaces every one of them with a constant (the caller picks the tile size,
 * see the memory bound in local_upscale.js).
 *
 * This module is pure — no DOM, no canvas, no tensor, no session — so the
 * geometry and the blending are testable directly under `node --test`.
 *
 * Buffer layout throughout is RGBA, four channels per pixel, row-major, with
 * the image stride passed in explicitly. Values are 0..255 floats in spirit;
 * any numeric typed array works, and production uses Uint8ClampedArray so the
 * destination costs 4 B/px rather than the 16 B/px a float accumulator would.
 *
 * ---------------------------------------------------------------------------
 * Why the tiles overlap, and why the overlap must exceed the model's
 * receptive field
 * ---------------------------------------------------------------------------
 *
 * The model decides each output pixel from a neighbourhood of input pixels —
 * its receptive field R. A tile is run in isolation, so for the outermost R
 * rows and columns of that tile the neighbourhood is truncated: those pixels
 * are computed as if the image ended at the tile border, and they are wrong
 * (typically soft, with faint darkening where the model's implicit
 * zero-padding leaks in). Writing them as-is leaves a visible seam.
 *
 * Overlapping the tiles fixes that only if the overlap is wide enough. In the
 * ramp below, a pixel t of the way through an overlap is a crossfade of the
 * two tiles with weights t and 1 - t, and it sits t*overlap from the incoming
 * tile's border and (1 - t)*overlap from the outgoing one's. The worst case is
 * the middle of the ramp, where each tile computed that pixel with only
 * overlap/2 of its R-pixel context available. So
 *
 *     overlap > 2 * R
 *
 * is the condition for every blended pixel to be dominated by a tile in which
 * it lies at least R pixels inside the border — one the model computed with
 * the full context it needs. Below that the crossfade mixes two different
 * kinds of wrong and the seam returns as a soft band instead of a hard step.
 * planTiles therefore only enforces overlap < tileSize; picking R is the
 * caller's job, because R belongs to the model and not to the geometry.
 *
 * The ramp also makes the composite an average rather than a race: the two
 * tiles' weights sum to 1 across the overlap, so the result no longer depends
 * on which tile ran last. A hard "last writer wins" composite would expose the
 * full difference between the two tiles' border estimates as a step.
 */

/** Channels per pixel in every buffer this module touches. */
const RGBA = 4;

/**
 * @param {string} code Machine-readable failure code (the UI layer localises it).
 * @returns {never}
 */
function reject(code) {
  throw new RangeError(code);
}

/**
 * Rejects anything that is not a positive whole pixel count. Fractional,
 * NaN and Infinity extents all describe a geometry that cannot be rasterised,
 * so they fail loudly rather than producing a degenerate plan downstream.
 */
function requirePixelCount(value, code) {
  if (!Number.isInteger(value) || value <= 0) reject(code);
}

/** Rejects a rect field that is not a whole number of pixels. */
function requirePixelOffset(value, code) {
  if (!Number.isInteger(value) || value < 0) reject(code);
}

/**
 * Tile origins along one axis, in ascending order.
 *
 * Interior tiles advance by `step`; the final tile is clamped so its far edge
 * lands exactly on the image edge instead of sticking out. Clamping widens the
 * overlap of the edge tiles rather than shrinking them, which is why the
 * requested overlap is a floor and never a promise of an exact figure.
 */
function axisSpans(extent, tileSize, step) {
  if (extent <= tileSize) return [{ origin: 0, size: extent }];
  const spans = [];
  let cursor = 0;
  for (;;) {
    const origin = Math.min(cursor, extent - tileSize);
    const previous = spans[spans.length - 1];
    // Clamping can land on the previous tile's origin for a very short axis;
    // that tile already covers the remainder, so the axis is complete.
    if (previous && origin <= previous.origin) break;
    spans.push({ origin, size: tileSize });
    if (origin + tileSize >= extent) break;
    cursor += step;
  }
  return spans;
}

/**
 * Deterministic, gap-free tiling of a width x height image.
 *
 * Every tile is inside the image, consecutive tiles overlap by at least
 * `overlap` (more when clamping widened it), and the union of the tiles covers
 * every pixel at least once. Tiles come out in row-major order, which is also
 * the order blendTileInto expects to be called in.
 *
 * @param {number} width Image width in pixels.
 * @param {number} height Image height in pixels.
 * @param {{ tileSize: number, overlap: number }} geometry Tile side in pixels
 *   and the requested overlap between neighbours, in the same pixel space.
 *   In a scale-2 pipeline both are source pixels; blendTileInto is fed the
 *   destination-space equivalents.
 * @returns {Array<{ x: number, y: number, width: number, height: number }>}
 */
export function planTiles(width, height, { tileSize, overlap } = {}) {
  requirePixelCount(width, "upscalePlanWidth");
  requirePixelCount(height, "upscalePlanHeight");
  requirePixelCount(tileSize, "upscalePlanTileSize");
  if (!Number.isInteger(overlap) || overlap < 0) reject("upscalePlanOverlap");
  if (overlap >= tileSize) reject("upscalePlanOverlapTooLarge");

  const step = tileSize - overlap;
  const columns = axisSpans(width, tileSize, step);
  const rows = axisSpans(height, tileSize, step);

  const tiles = [];
  for (const row of rows) {
    for (const column of columns) {
      tiles.push({
        x: column.origin,
        y: row.origin,
        width: column.size,
        height: row.size,
      });
    }
  }
  return tiles;
}

/** Rejects a rect that is malformed or does not fit inside a known buffer. */
function requireRectInside(rect, width, height) {
  if (!rect || typeof rect !== "object") reject("upscaleRectMalformed");
  requirePixelOffset(rect.x, "upscaleRectMalformed");
  requirePixelOffset(rect.y, "upscaleRectMalformed");
  requirePixelCount(rect.width, "upscaleRectMalformed");
  requirePixelCount(rect.height, "upscaleRectMalformed");
  if (rect.x + rect.width > width || rect.y + rect.height > height) {
    reject("upscaleRectOutOfBounds");
  }
}

/**
 * Copies one tile's pixels out of an RGBA buffer.
 *
 * `rect` is a rectangle from planTiles, so it already carries the overlap ring
 * around the tile — that ring is the tile's padding. It is real image content
 * contributed by the neighbouring tiles, not synthetic filler, which is why
 * extraction is strictly clipped: a rect reaching outside the image is a bug
 * (the plan never emits one), and zero-filling it would darken the outermost
 * tile edges instead of failing loudly.
 *
 * @param {Uint8ClampedArray|Float32Array} rgba Source buffer (typed, so the
 *   rows can be copied with subarray), RGBA, stride = width.
 * @param {{ x: number, y: number, width: number, height: number }} rect Tile.
 * @param {number} width Source image width in pixels.
 * @returns {Uint8ClampedArray} The tile, RGBA, stride = rect.width.
 */
export function tileInputRgba(rgba, rect, width) {
  if (!rgba || typeof rgba.length !== "number") reject("upscaleSourceMalformed");
  requirePixelCount(width, "upscaleSourceWidth");
  const sourceHeight = Math.floor(rgba.length / (width * RGBA));
  requireRectInside(rect, width, sourceHeight);

  const out = new Uint8ClampedArray(rect.width * rect.height * RGBA);
  const rowBytes = rect.width * RGBA;
  for (let row = 0; row < rect.height; row += 1) {
    const from = ((rect.y + row) * width + rect.x) * RGBA;
    out.set(rgba.subarray(from, from + rowBytes), row * rowBytes);
  }
  return out;
}

/**
 * Composites one upscaled tile into the destination, feathering the overlap.
 *
 * A tile is written verbatim except along its left and top edges, where it
 * ramps in over `overlap` pixels: the first column of the ramp gets weight
 * 1/(overlap+1) and the weight reaches exactly 1 at the first column fully
 * inside the tile. Weight never hits 0, so the incoming tile never drags the
 * result toward an unwritten destination, and the ramp is continuous where it
 * meets the untouched interior — a ramp that jumped to 1 would put a small
 * step exactly where it is meant to remove one.
 *
 * The consequence is that overlapping regions are an average of the two tiles
 * (their weights sum to 1) rather than the last tile's opinion. Tiles must be
 * composited in planTiles order: a tile that ramps has a neighbour drawn
 * before it filling that ramp region, so its ramp blends against real pixels.
 * Tiles at x = 0 or y = 0 do not ramp — there is nothing to cross-fade to, and
 * fading into the image edge would darken it.
 *
 * @param {ArrayLike<number>} target Destination buffer, RGBA, stride = width.
 * @param {ArrayLike<number>} tile Upscaled tile, RGBA, stride = rect.width.
 * @param {{ x: number, y: number, width: number, height: number }} rect Where
 *   the tile lands, in destination pixels.
 * @param {{ width: number, height: number, overlap: number }} geometry
 *   Destination size and the destination-space overlap between neighbours.
 * @returns {void} `target` is mutated in place.
 */
export function blendTileInto(target, tile, rect, { width, height, overlap } = {}) {
  requirePixelCount(width, "upscaleTargetWidth");
  requirePixelCount(height, "upscaleTargetHeight");
  if (!Number.isInteger(overlap) || overlap < 0) reject("upscaleBlendOverlap");
  requireRectInside(rect, width, height);
  if (!target || target.length !== width * height * RGBA) {
    reject("upscaleTargetSizeMismatch");
  }
  if (!tile || tile.length < rect.width * rect.height * RGBA) {
    reject("upscaleTileSizeMismatch");
  }

  const rampX = rect.x > 0 ? Math.min(overlap, rect.width) : 0;
  const rampY = rect.y > 0 ? Math.min(overlap, rect.height) : 0;

  for (let row = 0; row < rect.height; row += 1) {
    const weightY = rampY > 0 && row < rampY ? (row + 1) / (rampY + 1) : 1;
    const targetRow = ((rect.y + row) * width + rect.x) * RGBA;
    const tileRow = row * rect.width * RGBA;
    for (let column = 0; column < rect.width; column += 1) {
      const targetAt = targetRow + column * RGBA;
      const tileAt = tileRow + column * RGBA;
      if (weightY === 1 && (rampX === 0 || column >= rampX)) {
        for (let channel = 0; channel < RGBA; channel += 1) {
          target[targetAt + channel] = tile[tileAt + channel];
        }
        continue;
      }
      const weightX = rampX > 0 && column < rampX ? (column + 1) / (rampX + 1) : 1;
      const incoming = weightX * weightY;
      const existing = 1 - incoming;
      for (let channel = 0; channel < RGBA; channel += 1) {
        target[targetAt + channel] =
          target[targetAt + channel] * existing + tile[tileAt + channel] * incoming;
      }
    }
  }
}
