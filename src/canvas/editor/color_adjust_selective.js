/**
 * Selective color adjustment for the CPU path.
 *
 * Pure functions over RGBA Uint8ClampedArray buffers — no canvas, no GL, no React.
 * Mutates and returns the buffer in place.
 */

const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));

/** Hue in degrees (0..360) of an RGB pixel in 0..1 space; 0 for grey. */
function rgbHue01(r, g, b) {
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
 * Selective color: the Photoshop adjustment that tunes the CMYK ink of nine
 * colour targets (the six hues plus whites, neutrals and blacks), the
 * retoucher's tool for skin tones. Each pixel contributes to every target
 * with a smooth weight — hue proximity times saturation for the six colours,
 * near-white/near-black/grey-ness for the neutrals — and the weighted slider
 * deltas (-100..100) shift the pixel's CMY(K) values. Relative mode scales
 * the delta by the current value (a percentage of itself), absolute adds it
 * outright; both clamp to the ink range.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{mode?: 'relative'|'absolute', reds?: object, yellows?: object,
 *   greens?: object, cyans?: object, blues?: object, magentas?: object,
 *   whites?: object, neutrals?: object, blacks?: object}} adj
 *   rows shaped {c, m, y, k} in -100..100
 */
export function applySelectiveColor(data, width, height, adj) {
  const targets = [
    "reds",
    "yellows",
    "greens",
    "cyans",
    "blues",
    "magentas",
    "whites",
    "neutrals",
    "blacks",
  ];
  const anchor = {
    reds: 0,
    yellows: 60,
    greens: 120,
    cyans: 180,
    blues: 240,
    magentas: 300,
  };
  const rows = {};
  let any = false;
  for (const name of targets) {
    const row = adj?.[name];
    const mapped = {
      c: row?.c ?? 0,
      m: row?.m ?? 0,
      y: row?.y ?? 0,
      k: row?.k ?? 0,
    };
    if (mapped.c !== 0 || mapped.m !== 0 || mapped.y !== 0 || mapped.k !== 0)
      any = true;
    rows[name] = mapped;
  }
  if (!any) return data;
  const absolute = adj?.mode === "absolute";

  const band = (h, center) => {
    let d = Math.abs(h - center);
    if (d > 180) d = 360 - d;
    return Math.max(0, 1 - d / 60);
  };

  // Precompute each target's ink scale (delta/100) and which channels are
  // actually non-zero, ONCE, outside the per-pixel loop. Applying a zero delta
  // is the identity in both modes — absolute adds 0*s, relative multiplies by
  // (1+0*s)=1 — so a channel whose scale is 0 (and a target whose four scales
  // are all 0) can be skipped without changing any output byte. This is what
  // lets the hot loop stop calling a per-pixel ink-apply function.
  const T = {};
  for (const name of targets) {
    const r = rows[name];
    const sc = r.c / 100,
      sm = r.m / 100,
      sy = r.y / 100,
      sk = r.k / 100;
    T[name] = {
      c: sc,
      m: sm,
      y: sy,
      k: sk,
      cA: sc !== 0,
      mA: sm !== 0,
      yA: sy !== 0,
      kA: sk !== 0,
      any: sc !== 0 || sm !== 0 || sy !== 0 || sk !== 0,
    };
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    const hue = sat > 0 ? rgbHue01(r, g, b) : 0;

    // Nine scalar weights instead of a per-pixel `weights = {}` object (and
    // the per-pixel targets.slice(0, 6) array). The band() math and the
    // weight assignment are unchanged: six hue bands scaled by saturation,
    // whites = 1 - max, blacks = min, neutrals = 1 - sat.
    // Only derive a hue band when that target is active (has a non-zero ink).
    // An inactive target's weight is never read (the block below short-circuits
    // on `T.x.any`), so skipping its band() math is bit-identical.
    const wReds = T.reds.any ? band(hue, anchor.reds) * sat : 0;
    const wYellows = T.yellows.any ? band(hue, anchor.yellows) * sat : 0;
    const wGreens = T.greens.any ? band(hue, anchor.greens) * sat : 0;
    const wCyans = T.cyans.any ? band(hue, anchor.cyans) * sat : 0;
    const wBlues = T.blues.any ? band(hue, anchor.blues) * sat : 0;
    const wMagentas = T.magentas.any ? band(hue, anchor.magentas) * sat : 0;
    const wWhites = 1 - max;
    const wBlacks = min;
    const wNeutrals = 1 - sat;

    // RGB -> CMY, then the weighted ink deltas per channel, applied target by
    // target in the same order as before.
    let c = 1 - r;
    let m = 1 - g;
    let y = 1 - b;
    let k = Math.min(c, m, y);

    if (T.reds.any && wReds !== 0) {
      const t = T.reds;
      if (t.cA) c = absolute ? c + t.c * wReds : c * (1 + t.c * wReds);
      if (t.mA) m = absolute ? m + t.m * wReds : m * (1 + t.m * wReds);
      if (t.yA) y = absolute ? y + t.y * wReds : y * (1 + t.y * wReds);
      if (t.kA) k = absolute ? k + t.k * wReds : k * (1 + t.k * wReds);
    }
    if (T.yellows.any && wYellows !== 0) {
      const t = T.yellows;
      if (t.cA) c = absolute ? c + t.c * wYellows : c * (1 + t.c * wYellows);
      if (t.mA) m = absolute ? m + t.m * wYellows : m * (1 + t.m * wYellows);
      if (t.yA) y = absolute ? y + t.y * wYellows : y * (1 + t.y * wYellows);
      if (t.kA) k = absolute ? k + t.k * wYellows : k * (1 + t.k * wYellows);
    }
    if (T.greens.any && wGreens !== 0) {
      const t = T.greens;
      if (t.cA) c = absolute ? c + t.c * wGreens : c * (1 + t.c * wGreens);
      if (t.mA) m = absolute ? m + t.m * wGreens : m * (1 + t.m * wGreens);
      if (t.yA) y = absolute ? y + t.y * wGreens : y * (1 + t.y * wGreens);
      if (t.kA) k = absolute ? k + t.k * wGreens : k * (1 + t.k * wGreens);
    }
    if (T.cyans.any && wCyans !== 0) {
      const t = T.cyans;
      if (t.cA) c = absolute ? c + t.c * wCyans : c * (1 + t.c * wCyans);
      if (t.mA) m = absolute ? m + t.m * wCyans : m * (1 + t.m * wCyans);
      if (t.yA) y = absolute ? y + t.y * wCyans : y * (1 + t.y * wCyans);
      if (t.kA) k = absolute ? k + t.k * wCyans : k * (1 + t.k * wCyans);
    }
    if (T.blues.any && wBlues !== 0) {
      const t = T.blues;
      if (t.cA) c = absolute ? c + t.c * wBlues : c * (1 + t.c * wBlues);
      if (t.mA) m = absolute ? m + t.m * wBlues : m * (1 + t.m * wBlues);
      if (t.yA) y = absolute ? y + t.y * wBlues : y * (1 + t.y * wBlues);
      if (t.kA) k = absolute ? k + t.k * wBlues : k * (1 + t.k * wBlues);
    }
    if (T.magentas.any && wMagentas !== 0) {
      const t = T.magentas;
      if (t.cA) c = absolute ? c + t.c * wMagentas : c * (1 + t.c * wMagentas);
      if (t.mA) m = absolute ? m + t.m * wMagentas : m * (1 + t.m * wMagentas);
      if (t.yA) y = absolute ? y + t.y * wMagentas : y * (1 + t.y * wMagentas);
      if (t.kA) k = absolute ? k + t.k * wMagentas : k * (1 + t.k * wMagentas);
    }
    if (T.whites.any && wWhites !== 0) {
      const t = T.whites;
      if (t.cA) c = absolute ? c + t.c * wWhites : c * (1 + t.c * wWhites);
      if (t.mA) m = absolute ? m + t.m * wWhites : m * (1 + t.m * wWhites);
      if (t.yA) y = absolute ? y + t.y * wWhites : y * (1 + t.y * wWhites);
      if (t.kA) k = absolute ? k + t.k * wWhites : k * (1 + t.k * wWhites);
    }
    if (T.neutrals.any && wNeutrals !== 0) {
      const t = T.neutrals;
      if (t.cA) c = absolute ? c + t.c * wNeutrals : c * (1 + t.c * wNeutrals);
      if (t.mA) m = absolute ? m + t.m * wNeutrals : m * (1 + t.m * wNeutrals);
      if (t.yA) y = absolute ? y + t.y * wNeutrals : y * (1 + t.y * wNeutrals);
      if (t.kA) k = absolute ? k + t.k * wNeutrals : k * (1 + t.k * wNeutrals);
    }
    if (T.blacks.any && wBlacks !== 0) {
      const t = T.blacks;
      if (t.cA) c = absolute ? c + t.c * wBlacks : c * (1 + t.c * wBlacks);
      if (t.mA) m = absolute ? m + t.m * wBlacks : m * (1 + t.m * wBlacks);
      if (t.yA) y = absolute ? y + t.y * wBlacks : y * (1 + t.y * wBlacks);
      if (t.kA) k = absolute ? k + t.k * wBlacks : k * (1 + t.k * wBlacks);
    }

    c = Math.min(1, Math.max(0, c));
    m = Math.min(1, Math.max(0, m));
    y = Math.min(1, Math.max(0, y));
    k = Math.min(1, Math.max(0, k));

    data[i] = clamp255((1 - c) * (1 - k) * 255);
    data[i + 1] = clamp255((1 - m) * (1 - k) * 255);
    data[i + 2] = clamp255((1 - y) * (1 - k) * 255);
  }
  return data;
}
