/**
 * The colours already inside a region, sampled from the picture under it.
 *
 * A region says where something goes and what it should be; what it cannot
 * say, without someone typing it out, is what the area already looks like.
 * When a picture is being regenerated from another picture that is exactly
 * the thing the model most needs — "match the blue that is already there"
 * beats any adjective — and it is sitting in the pixels for free.
 *
 * Deliberately coarse. Three colours, quantised hard, is a description of a
 * palette; a hundred near-identical shades is a description of nothing, and
 * would bloat every prompt that carries it.
 */

/** How many colours a region contributes at most. */
const MAX_COLOURS = 3;

/** Buckets per channel. 4 gives 64 cells — coarse enough to group a gradient. */
const LEVELS = 4;

/** A bucket has to hold this share of the sampled pixels to be worth naming. */
const MIN_SHARE = 0.12;

/** Pixels below this alpha are backdrop showing through, not colour. */
const MIN_ALPHA = 128;

/**
 * The longest edge, in samples, of the grid read from a region.
 *
 * Reading every pixel of a large box is both slow and pointless: a palette is
 * stable long before the sample count is, and this runs on the way out to the
 * model rather than in a frame.
 */
const MAX_SAMPLES_PER_EDGE = 32;

const toHex = (value) => value.toString(16).padStart(2, "0");

/**
 * The average of the pixels that landed in a bucket.
 *
 * Reporting the bucket's centre instead would name a colour that is not in
 * the picture — with buckets this coarse, a #3366cc sky comes back as
 * #5555aa, which is a visibly different blue to hand a model. Bucketing
 * decides what counts as *one* colour; the average decides what that colour
 * actually is.
 */
function averageColour(totals, count) {
  return (
    "#" +
    toHex(Math.round(totals[0] / count)) +
    toHex(Math.round(totals[1] / count)) +
    toHex(Math.round(totals[2] / count))
  );
}

/**
 * Samples one region of a canvas and returns its palette, most common first.
 *
 * `region` is in fractions of the page, the same shape the prompt compiler
 * takes, so this can be handed the value that is about to be compiled.
 */
export function sampleRegionColours(canvas, region) {
  const width = canvas?.width ?? 0;
  const height = canvas?.height ?? 0;
  if (!width || !height) return [];

  const left = Math.max(0, Math.round(region.x * width));
  const top = Math.max(0, Math.round(region.y * height));
  const right = Math.min(width, Math.round((region.x + region.width) * width));
  const bottom = Math.min(
    height,
    Math.round((region.y + region.height) * height),
  );
  if (right <= left || bottom <= top) return [];

  let pixels;
  try {
    pixels = canvas
      .getContext("2d")
      .getImageData(left, top, right - left, bottom - top).data;
  } catch {
    // A tainted canvas cannot be read. A prompt without a palette is worth
    // more than a generation that fails.
    return [];
  }

  const boxWidth = right - left;
  const boxHeight = bottom - top;
  const stepX = Math.max(1, Math.ceil(boxWidth / MAX_SAMPLES_PER_EDGE));
  const stepY = Math.max(1, Math.ceil(boxHeight / MAX_SAMPLES_PER_EDGE));

  const counts = new Map();
  let sampled = 0;
  for (let y = 0; y < boxHeight; y += stepY) {
    for (let x = 0; x < boxWidth; x += stepX) {
      const at = (y * boxWidth + x) * 4;
      if (pixels[at + 3] < MIN_ALPHA) continue;
      const key = [
        Math.round((pixels[at] / 255) * (LEVELS - 1)),
        Math.round((pixels[at + 1] / 255) * (LEVELS - 1)),
        Math.round((pixels[at + 2] / 255) * (LEVELS - 1)),
      ].join(",");
      const bucket = counts.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.totals[0] += pixels[at];
        bucket.totals[1] += pixels[at + 1];
        bucket.totals[2] += pixels[at + 2];
      } else {
        counts.set(key, {
          count: 1,
          totals: [pixels[at], pixels[at + 1], pixels[at + 2]],
        });
      }
      sampled += 1;
    }
  }
  if (sampled === 0) return [];

  return [...counts.values()]
    .filter((bucket) => bucket.count / sampled >= MIN_SHARE)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_COLOURS)
    .map((bucket) => averageColour(bucket.totals, bucket.count));
}
