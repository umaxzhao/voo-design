/**
 * Reference-image colour recognition for layout generation.
 *
 * The DeepSeek text API cannot see images, but the browser can: the reference
 * picture is decoded to an offscreen canvas, its pixels are sampled and
 * quantised, and the dominant colours are extracted into a small palette —
 * background, ink, accent and helpers. That palette is injected into the
 * generation brief as the locked colour scheme, so the design "picks up" the
 * reference's look without any vision model.
 *
 * The extraction is pure (pixels in, palette out) so tests can drive it.
 */

/** #rrggbb from channels. */
export function hexFromRgb(r, g, b) {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Perceptual-ish luminance 0..255. */
export function luminanceOf(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Simple RGB distance; used to merge near-identical sampled colours. */
function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Saturation (max-min span) — the most colourful cluster becomes the accent. */
function saturationOf(c) {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

/**
 * Extracts the dominant colours from RGBA pixel data.
 *
 * @param {object} input
 * @param {Uint8ClampedArray} input.data - RGBA bytes
 * @param {number} input.width
 * @param {number} input.height
 * @param {number} [input.maxColors=5]
 * @returns {{colors: Array<{hex: string, role: string, luminance: number}>, background: string, ink: string, accent: string}}
 */
export function extractPaletteFromPixels({
  data,
  width,
  height,
  maxColors = 5,
}) {
  if (!data || width <= 0 || height <= 0) {
    return { colors: [], background: null, ink: null, accent: null };
  }

  // Sample at most ~4096 pixels evenly.
  const step = Math.max(1, Math.floor((width * height) / 4096));
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4 * step) {
    const a = data[i + 3];
    if (a < 128) continue; // skip transparent pixels
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Quantise to 16 levels per channel so near-identical colours merge.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const hit = buckets.get(key);
    if (hit) hit.count += 1;
    else buckets.set(key, { r, g, b, count: 1 });
  }
  if (buckets.size === 0) {
    return { colors: [], background: null, ink: null, accent: null };
  }

  // Keep the most frequent quantised colours, then merge close neighbours.
  const top = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const clusters = [];
  for (const sample of top) {
    let merged = false;
    for (const cluster of clusters) {
      if (colorDistance(cluster, sample) < 48) {
        const total = cluster.count + sample.count;
        cluster.r =
          (cluster.r * cluster.count + sample.r * sample.count) / total;
        cluster.g =
          (cluster.g * cluster.count + sample.g * sample.count) / total;
        cluster.b =
          (cluster.b * cluster.count + sample.b * sample.count) / total;
        cluster.count = total;
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ ...sample });
  }
  clusters.sort((a, b) => b.count - a.count);

  const chosen = clusters.slice(0, maxColors).map((c) => ({
    hex: hexFromRgb(c.r, c.g, c.b),
    luminance: luminanceOf(c.r, c.g, c.b),
    saturation: saturationOf(c),
  }));

  // Role assignment: brightest = background, darkest = ink, most colourful
  // = accent, the rest are helpers (by luminance, bright first).
  const byLuma = [...chosen].sort((a, b) => b.luminance - a.luminance);
  const background = byLuma[0]?.hex ?? null;
  const ink = byLuma.at(-1)?.hex ?? null;
  const bySat = [...chosen].sort((a, b) => b.saturation - a.saturation);
  const accent = bySat[0]?.hex ?? null;

  const colors = byLuma.map((c, index) => ({
    hex: c.hex,
    luminance: Math.round(c.luminance),
    role:
      index === 0
        ? "背景"
        : index === byLuma.length - 1
          ? "主文字"
          : index === 1 && c.hex === accent
            ? "强调色"
            : "辅助色",
  }));

  return { colors, background, ink, accent };
}
