/**
 * Vibrance and channel mixer adjustments for the CPU path.
 *
 * Pure functions over RGBA Uint8ClampedArray buffers — no canvas, no GL, no React.
 * Each function mutates and returns the buffer in place.
 */

const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));

// HSL round trip on 0..1 values for the vibrance pass.
function rgbToHsl01(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h / 6 + 1) % 1, s, l];
}

function hslToRgb01(h, s, l) {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/**
 * Vibrance: the Photoshop adjustment that boosts saturation with the boost
 * scaled by how dull the pixel is — near-grey pixels get the full boost,
 * already-vivid ones barely any — so skin tones and skies stay natural.
 * Negative values reduce saturation uniformly.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{value?: number}} adj a -100..100 vibrance value
 */
export function applyVibrance(data, width, height, adj) {
  const value = adj?.value ?? 0;
  if (value === 0) return data;
  const boost = Math.max(-1, Math.min(1, value / 100));

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // Positive: the duller the pixel, the larger the lift. Negative: a
    // uniform scale toward grey.
    const factor = boost > 0 ? 1 + boost * (1 - sat) : 1 + boost;
    if (factor === 1) continue;
    const [h, s, l] = rgbToHsl01(r, g, b);
    const s2 = Math.min(1, Math.max(0, s * factor));
    const [nr, ng, nb] = hslToRgb01(h, s2, l);
    data[i] = clamp255(nr * 255);
    data[i + 1] = clamp255(ng * 255);
    data[i + 2] = clamp255(nb * 255);
  }
  return data;
}

/**
 * Channel mixer: the Photoshop adjustment that rebuilds each output channel
 * as a weighted sum of the input channels (weights in -200..200 percent)
 * plus a constant offset (-200..200 percent of full scale). In monochrome
 * mode all three outputs come from the gray row, producing a channel-mixed
 * greyscale.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{monochrome?: boolean, red?: object, green?: object, blue?: object,
 *   gray?: object}} adj rows shaped {red, green, blue, constant}
 */
export function applyChannelMixer(data, width, height, adj) {
  const row = (name, fallback) => ({
    red: adj?.[name]?.red ?? fallback.red,
    green: adj?.[name]?.green ?? fallback.green,
    blue: adj?.[name]?.blue ?? fallback.blue,
    constant: adj?.[name]?.constant ?? fallback.constant,
  });
  const identity = { red: 100, green: 0, blue: 0, constant: 0 };
  const rows = adj?.monochrome
    ? {
        red: row("gray", { red: 40, green: 40, blue: 20, constant: 0 }),
        green: row("gray", { red: 40, green: 40, blue: 20, constant: 0 }),
        blue: row("gray", { red: 40, green: 40, blue: 20, constant: 0 }),
      }
    : {
        red: row("red", identity),
        green: row("green", { red: 0, green: 100, blue: 0, constant: 0 }),
        blue: row("blue", { red: 0, green: 0, blue: 100, constant: 0 }),
      };
  const neutral =
    !adj?.monochrome &&
    rows.red.red === 100 &&
    rows.red.green === 0 &&
    rows.red.blue === 0 &&
    rows.red.constant === 0 &&
    rows.green.red === 0 &&
    rows.green.green === 100 &&
    rows.green.blue === 0 &&
    rows.green.constant === 0 &&
    rows.blue.red === 0 &&
    rows.blue.green === 0 &&
    rows.blue.blue === 100 &&
    rows.blue.constant === 0;
  if (neutral) return data;

  const mix = (r, g, b, m) =>
    (r * m.red + g * m.green + b * m.blue) / 100 + (m.constant / 100) * 255;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = clamp255(mix(r, g, b, rows.red));
    data[i + 1] = clamp255(mix(r, g, b, rows.green));
    data[i + 2] = clamp255(mix(r, g, b, rows.blue));
  }
  return data;
}
