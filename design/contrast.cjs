/**
 * Tailwind's `neutral` scale, spelled out here so contrast can be judged
 * numerically instead of by reading a class name.
 *
 * `tailwind.config.js` only *extends* the default theme, so these eleven steps
 * are the whole neutral ramp the UI is allowed to use. The contrast rule below
 * needs the actual values because `text-[#666666]` says nothing about whether
 * it is legible — only its luminance does, and the named-utility rule could
 * never see it. This shared table prevents the scale from being restated in
 * two places; tokens.cjs re-exports it for the gate and its consumers.
 */
const NEUTRAL_SCALE = Object.freeze({
  50: "#fafafa",
  100: "#f5f5f5",
  200: "#e5e5e5",
  300: "#d4d4d4",
  400: "#a3a3a3",
  500: "#737373",
  600: "#525252",
  700: "#404040",
  800: "#262626",
  900: "#171717",
  950: "#0a0a0a",
});

/** Expand valid CSS hex (RGB/RGBA) to RGB, or return null when malformed. */
function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]|[0-9a-f]{3}|[0-9a-f]{5})?$/i.test(hex))
    return null;
  const h = hex.slice(1).toLowerCase();
  const full =
    h.length <= 4 ? h.slice(0, 3).replace(/./g, (c) => c + c) : h.slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function relativeLuminance(rgb) {
  const channel = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
}

/** WCAG contrast ratio between two hex colours, 1–21. */
function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The darkest step of the ramp, and therefore the floor for anything that has
 * to be read as text or an icon: `neutral-500` at 3.78:1 on the panel
 * (`#171717`), which clears the 3:1 that Design.md §11 sets for auxiliary text.
 * `neutral-600` measures 2.29:1 there, which is why it is the first thing the
 * contrast rule rejects.
 */
const NEUTRAL_TEXT_FLOOR = 500;

/**
 * Placeholders are held to body-text contrast (4.5:1), one step higher than
 * other auxiliary text, because a placeholder is the only description a field
 * gets before it has a value in it.
 */
const NEUTRAL_PLACEHOLDER_FLOOR = 400;

/** Whether a hex colour is dark enough to fall below the given neutral step. */
function isDarkerThanNeutralStep(hex, step) {
  const allowed = NEUTRAL_SCALE[step];
  const rgb = hexToRgb(hex);
  if (!rgb || !allowed) return false;
  return relativeLuminance(rgb) < relativeLuminance(hexToRgb(allowed));
}

/**
 * The closest neutral step that still clears `step` for `hex` — i.e. the
 * darkest acceptable step, which is the smallest change a fix can make.
 * Luminance falls as the step number rises, so this walks the allowed steps
 * from darkest to lightest and returns the first one that clears the target.
 */
function nearestNeutralStepAtLeast(hex, step) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const target = relativeLuminance(rgb);
  const steps = Object.keys(NEUTRAL_SCALE)
    .map(Number)
    .filter((s) => s <= step)
    .sort((a, b) => b - a);
  for (const s of steps) {
    if (relativeLuminance(hexToRgb(NEUTRAL_SCALE[s])) >= target) return s;
  }
  return null;
}

module.exports = {
  NEUTRAL_SCALE,
  NEUTRAL_TEXT_FLOOR,
  NEUTRAL_PLACEHOLDER_FLOOR,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  isDarkerThanNeutralStep,
  nearestNeutralStepAtLeast,
};
