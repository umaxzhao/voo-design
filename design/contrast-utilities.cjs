const T = require("./tokens.cjs");

// Capture state variants separately: a hover background cannot excuse text
// that is invisible before hover. Alpha must be measured after compositing.
const COLOR_UTILITY =
  /^(.*?)(text|stroke|fill|placeholder|placeholder:text)-\[(#[0-9a-f]{3,8})\](?:\/(\d{1,3}))?$/i;
const BACKGROUND_UTILITY =
  /^(.*?)bg-(?:\[(#[0-9a-f]{3,8})\]|neutral-(\d{2,3}))(?:\/(\d{1,3}))?$/i;

function composite(hex, suffix, background) {
  const rgb = T.hexToRgb(hex);
  const ground = T.hexToRgb(background);
  if (!rgb || !ground) return null;
  const inlineAlpha =
    hex.length === 5
      ? Number.parseInt(hex[4] + hex[4], 16) / 255
      : hex.length === 9
        ? Number.parseInt(hex.slice(7), 16) / 255
        : 1;
  const alpha =
    inlineAlpha *
    (suffix === undefined ? 1 : Math.min(100, Number(suffix)) / 100);
  return (
    "#" +
    rgb
      .map((channel, i) =>
        Math.round(channel * alpha + ground[i] * (1 - alpha)),
      )
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
  );
}

function backgroundFor(tokens, variant) {
  let base = T.SURFACE.panel;
  let state = null;
  for (const token of tokens) {
    const match = BACKGROUND_UTILITY.exec(token);
    if (!match) continue;
    const [, prefix, hex, step, alpha] = match;
    const color = hex || T.NEUTRAL_SCALE[step];
    if (!color) continue;
    if (!prefix) base = composite(color, alpha, T.SURFACE.panel) || base;
    else if (prefix === variant) state = { color, alpha };
  }
  return state ? composite(state.color, state.alpha, base) || base : base;
}

function suggestNeutral(hex, background, floor) {
  const luminance = T.relativeLuminance(T.hexToRgb(hex));
  const maxStep =
    floor === 4.5 ? T.NEUTRAL_PLACEHOLDER_FLOOR : T.NEUTRAL_TEXT_FLOOR;
  let best = null;
  let delta = Infinity;
  for (const [step, candidate] of Object.entries(T.NEUTRAL_SCALE)) {
    // Advice must also clear the existing named-tone rule after replacement.
    if (Number(step) > maxStep) continue;
    if (T.contrastRatio(candidate, background) < floor) continue;
    const distance = Math.abs(
      T.relativeLuminance(T.hexToRgb(candidate)) - luminance,
    );
    if (distance < delta) {
      best = `neutral-${step}`;
      delta = distance;
    }
  }
  return (
    best ??
    (T.contrastRatio("#000000", background) >= floor ? "black" : "white")
  );
}

function contrastViolations(text) {
  const tokens = text.split(/\s+/);
  const violations = [];
  for (const token of tokens) {
    const match = COLOR_UTILITY.exec(token);
    if (!match) continue;
    const [, variant, property, hex, alpha] = match;
    const placeholder =
      property.startsWith("placeholder") || variant.endsWith("placeholder:");
    const state = variant.replace(/placeholder:$/, "");
    const background = backgroundFor(tokens, state);
    const foreground = composite(hex, alpha, background);
    if (!foreground) continue;
    const floor = placeholder ? 4.5 : 3;
    const ratio = T.contrastRatio(foreground, background);
    if (ratio >= floor) continue;
    const replacementProperty = placeholder ? "placeholder:text" : property;
    violations.push({
      messageId: placeholder ? "contrastPlaceholderHex" : "contrastTextHex",
      data: {
        token,
        replacement: `${state}${replacementProperty}-${suggestNeutral(foreground, background, floor)}`,
        ratio: `${ratio.toFixed(2)}:1`,
        background,
      },
    });
  }
  return violations;
}

module.exports = { contrastViolations };
