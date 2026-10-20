/**
 * Gradient sampling and gradient map adjustment for the CPU path.
 *
 * Pure functions over RGBA Uint8ClampedArray buffers — no canvas, no GL, no React.
 * Mutates and returns the buffer in place.
 */

/**
 * Samples a gradient at position t (0..1): piecewise-linear RGB between the
 * stops, which are `{ color: "#rrggbb", location: 0..1 }` sorted by location.
 * Falls back to black→white when the stop list is unusable.
 */
export function sampleGradient(stops, t) {
  const list = Array.isArray(stops)
    ? stops
        .filter(
          (s) =>
            s &&
            typeof s.color === "string" &&
            /^#[0-9a-fA-F]{6}$/.test(s.color) &&
            Number.isFinite(s.location),
        )
        .map((s) => ({
          color: s.color,
          location: Math.max(0, Math.min(1, s.location)),
        }))
        .sort((a, b) => a.location - b.location)
    : [];
  const normalized =
    list.length >= 2
      ? list
      : [
          { color: "#000000", location: 0 },
          { color: "#ffffff", location: 1 },
        ];
  const x = Math.max(0, Math.min(1, t));
  let a = normalized[0];
  for (const b of normalized) {
    if (x <= b.location) {
      const span = b.location - a.location;
      const f = span > 0 ? (x - a.location) / span : 0;
      const ar = parseInt(a.color.slice(1, 3), 16);
      const ag = parseInt(a.color.slice(3, 5), 16);
      const ab = parseInt(a.color.slice(5, 7), 16);
      const br = parseInt(b.color.slice(1, 3), 16);
      const bg = parseInt(b.color.slice(3, 5), 16);
      const bb = parseInt(b.color.slice(5, 7), 16);
      return [
        Math.round(ar + (br - ar) * f),
        Math.round(ag + (bg - ag) * f),
        Math.round(ab + (bb - ab) * f),
      ];
    }
    a = b;
  }
  const last = normalized[normalized.length - 1];
  return [
    parseInt(last.color.slice(1, 3), 16),
    parseInt(last.color.slice(3, 5), 16),
    parseInt(last.color.slice(5, 7), 16),
  ];
}

/**
 * Pre-parses a gradient stop list ONCE, outside the per-pixel loop, into
 * integer {r,g,b,location} entries — the exact validation, clamping, sort and
 * black→white fallback of sampleGradient. Reusing this for every pixel lets
 * applyGradientMap drop sampleGradient's per-stop per-pixel regex/parseInt
 * (the real hot cost) while keeping mathematically identical piecewise-linear
 * interpolation.
 *
 * NOTE: this is deliberately NOT a luma-keyed 256-entry lookup table. `t` is a
 * continuous value (r/g/b are 8-bit ints but the weighted luma is not
 * quantized), so rounding it onto a 256-bucket LUT would change the
 * interpolation fraction `f` and break bit-exactness by ±1. Pre-parsing the
 * stops and keeping the same floating-point interpolation arithmetic is what
 * guarantees exact equivalence.
 */
function buildGradientStops(stops) {
  const list = Array.isArray(stops)
    ? stops
        .filter(
          (s) =>
            s &&
            typeof s.color === "string" &&
            /^#[0-9a-fA-F]{6}$/.test(s.color) &&
            Number.isFinite(s.location),
        )
        .map((s) => ({
          r: parseInt(s.color.slice(1, 3), 16),
          g: parseInt(s.color.slice(3, 5), 16),
          b: parseInt(s.color.slice(5, 7), 16),
          location: Math.max(0, Math.min(1, s.location)),
        }))
        .sort((a, b) => a.location - b.location)
    : [];
  return list.length >= 2
    ? list
    : [
        { r: 0, g: 0, b: 0, location: 0 }, // #000000
        { r: 255, g: 255, b: 255, location: 1 }, // #ffffff
      ];
}

/**
 * Gradient map: the Photoshop adjustment that recolours a picture by mapping
 * each pixel's luma through a gradient — dark tones take the gradient's low
 * end, bright tones its high end, and the colours in between interpolate. A
 * plain black→white gradient is exactly a grayscale conversion.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{stops?: {color: string, location: number}[], reverse?: boolean}} adj
 */
export function applyGradientMap(data, width, height, adj) {
  const reverse = adj?.reverse === true;
  const g = buildGradientStops(adj?.stops);
  const last = g[g.length - 1];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const luma =
      (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const x = Math.max(0, Math.min(1, reverse ? 1 - luma : luma));
    let a = g[0];
    let found = false;
    for (let k = 0; k < g.length; k++) {
      const b = g[k];
      if (x <= b.location) {
        const span = b.location - a.location;
        const f = span > 0 ? (x - a.location) / span : 0;
        data[i] = Math.round(a.r + (b.r - a.r) * f);
        data[i + 1] = Math.round(a.g + (b.g - a.g) * f);
        data[i + 2] = Math.round(a.b + (b.b - a.b) * f);
        found = true;
        break;
      }
      a = b;
    }
    if (!found) {
      data[i] = last.r;
      data[i + 1] = last.g;
      data[i + 2] = last.b;
    }
  }
  return data;
}
