/**
 * Colour balance, black & white, and photo filter adjustments for the CPU path.
 *
 * Pure functions over RGBA Uint8ClampedArray buffers — no canvas, no GL, no React.
 * Each function mutates and returns the buffer in place.
 */

const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));

/** Hermite-style 0..1 smoothstep used for the tonal-zone masks. */
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Hue in degrees (0..360) of an RGB pixel; 0 for neutral grey. */
function rgbHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h % 6) * 60 + 360) % 360;
}

/**
 * Colour balance: the Photoshop adjustment that shifts each channel within
 * three tonal zones (shadows / midtones / highlights). Each zone carries a
 * cyan↔red, magenta↔green and yellow↔blue delta in -100..100. Zone weights
 * come from the pixel's luminance: shadows fall off across the dark half,
 * highlights ramp in across the bright half, midtones are the remainder — a
 * soft triangular band around 50% that is zero at both ends.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{shadows?: {cyanRed: number, magentaGreen: number, yellowBlue: number},
 *   midtones?: {cyanRed: number, magentaGreen: number, yellowBlue: number},
 *   highlights?: {cyanRed: number, magentaGreen: number, yellowBlue: number},
 *   preserveLuminosity?: boolean}} adj
 */
export function applyColorBalance(data, width, height, adj) {
  const zones = [
    ["shadows", adj?.shadows],
    ["midtones", adj?.midtones],
    ["highlights", adj?.highlights],
  ];
  const active = zones.some(
    ([, z]) =>
      z && (z.cyanRed !== 0 || z.magentaGreen !== 0 || z.yellowBlue !== 0),
  );
  if (!active) return data;
  const preserve = adj.preserveLuminosity !== false;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const shadowW = 1 - smoothstep(0, 0.5, lum);
    const highlightW = smoothstep(0.5, 1, lum);
    const midtoneW = Math.max(0, 1 - shadowW - highlightW);

    let dr = 0;
    let dg = 0;
    let db = 0;
    for (const [zone, z] of zones) {
      if (!z) continue;
      const w =
        zone === "shadows"
          ? shadowW
          : zone === "highlights"
            ? highlightW
            : midtoneW;
      if (w === 0) continue;
      // A full-strength slider shifts a channel by half its range.
      const scale = w * 0.5 * 2.55;
      dr += z.cyanRed * scale;
      dg += z.magentaGreen * scale;
      db += z.yellowBlue * scale;
    }

    if (preserve && (dr !== 0 || dg !== 0 || db !== 0)) {
      const lumBefore = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const lumAfter =
        0.2126 * (r + dr) + 0.7152 * (g + dg) + 0.0722 * (b + db);
      if (lumAfter > 1e-6) {
        const k = lumBefore / lumAfter;
        dr *= k;
        dg *= k;
        db *= k;
      }
    }

    data[i] = clamp255(r + dr);
    data[i + 1] = clamp255(g + dg);
    data[i + 2] = clamp255(b + db);
  }
  return data;
}

/**
 * Black & white: the Photoshop adjustment that turns a picture grey with a
 * per-hue brightness, tuned by six colour sliders (reds, yellows, greens,
 * cyans, blues, magentas) in -200..300. The sliders form a piecewise-linear
 * weight function around the colour wheel, and each pixel's channels are
 * weighted by the function read at the pixel's hue — with the assignment
 * cycling so the channel whose band the hue sits in gets the weight at that
 * hue: a red-dominant pixel is governed by the reds slider, a green-dominant
 * one by the greens slider, and so on, with the in-between sliders covering
 * the wedges. The grey is the weighted channel average, so it is bounded and
 * neutral pixels stay neutral.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{reds?: number, yellows?: number, greens?: number, cyans?: number,
 *   blues?: number, magentas?: number, useTint?: boolean,
 *   tintColor?: string}} adj
 */
export function applyBlackAndWhite(data, width, height, adj) {
  const anchors = [
    { hue: 0, w: adj?.reds ?? 40 },
    { hue: 60, w: adj?.yellows ?? 60 },
    { hue: 120, w: adj?.greens ?? 40 },
    { hue: 180, w: adj?.cyans ?? 60 },
    { hue: 240, w: adj?.blues ?? 20 },
    { hue: 300, w: adj?.magentas ?? 80 },
  ];
  const weightAt = (deg) => {
    const h = ((deg % 360) + 360) % 360;
    let a = anchors[anchors.length - 1];
    for (const cur of anchors) {
      if (h <= cur.hue) {
        const t = cur.hue === a.hue ? 0 : (h - a.hue) / (cur.hue - a.hue);
        return a.w + (cur.w - a.w) * t;
      }
      a = cur;
    }
    return a.w;
  };

  let tint = null;
  if (
    adj?.useTint &&
    typeof adj.tintColor === "string" &&
    adj.tintColor.startsWith("#")
  ) {
    tint = [
      parseInt(adj.tintColor.slice(1, 3), 16),
      parseInt(adj.tintColor.slice(3, 5), 16),
      parseInt(adj.tintColor.slice(5, 7), 16),
    ];
    if (tint.some((v) => !Number.isFinite(v))) tint = null;
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const hue = rgbHue(r, g, b);
    // The channel whose band the hue sits in takes the weight at the hue
    // itself; the other two take the weights 120° and 240° ahead, cycled.
    let wR;
    let wG;
    let wB;
    if (hue >= 60 && hue < 180) {
      wR = weightAt((hue + 240) % 360);
      wG = weightAt(hue);
      wB = weightAt((hue + 120) % 360);
    } else if (hue >= 180 && hue < 300) {
      wR = weightAt((hue + 120) % 360);
      wG = weightAt((hue + 240) % 360);
      wB = weightAt(hue);
    } else {
      wR = weightAt(hue);
      wG = weightAt((hue + 120) % 360);
      wB = weightAt((hue + 240) % 360);
    }
    const total = wR + wG + wB;
    let gray = total > 0 ? (r * wR + g * wG + b * wB) / total : (r + g + b) / 3;

    if (tint) {
      data[i] = clamp255(gray * (tint[0] / 255));
      data[i + 1] = clamp255(gray * (tint[1] / 255));
      data[i + 2] = clamp255(gray * (tint[2] / 255));
    } else {
      data[i] = clamp255(gray);
      data[i + 1] = clamp255(gray);
      data[i + 2] = clamp255(gray);
    }
  }
  return data;
}

/** Parses a #rrggbb hex colour into [r, g, b] bytes, or null. */
function parseHexColor(color) {
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))
    return null;
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
}

/**
 * Photo filter: the Photoshop adjustment that gels the picture with a
 * colour, like a camera lens filter. Each channel is tinted multiplicatively
 * toward the filter colour by the density (0-100), and with
 * preserveLuminosity the tint is scaled back so the pixel's luma is kept —
 * the gel warms or cools the image without dimming it.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{color?: string, density?: number, preserveLuminosity?: boolean}} adj
 */
export function applyPhotoFilter(data, width, height, adj) {
  const density = Math.max(0, Math.min(100, adj?.density ?? 0));
  if (!(density > 0)) return data;
  const filter = parseHexColor(adj?.color);
  if (!filter) return data;
  const preserve = adj.preserveLuminosity !== false;
  const d = density / 100;
  const fr = filter[0] / 255;
  const fg = filter[1] / 255;
  const fb = filter[2] / 255;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let nr = r * (1 - d + d * fr);
    let ng = g * (1 - d + d * fg);
    let nb = b * (1 - d + d * fb);
    if (preserve) {
      const lBefore = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const lAfter = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      if (lAfter > 1e-6) {
        const k = lBefore / lAfter;
        nr *= k;
        ng *= k;
        nb *= k;
      }
    }
    data[i] = clamp255(nr);
    data[i + 1] = clamp255(ng);
    data[i + 2] = clamp255(nb);
  }
  return data;
}
