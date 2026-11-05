/**
 * The design gate for stylesheets.
 *
 * CSS needs its own scanner because ESLint does not parse it, so the four .css
 * files were the one place in the UI with no enforcement at all.
 *
 * This checks deliberately LESS than the JSX rule does, because the same
 * utilities mean different things here:
 *
 *  - Gradients are not checked. Every gradient in this codebase is an effect,
 *    not a skeuomorphic surface: radial-gradient drives `mask-image`,
 *    conic-gradient draws the node selection halo, linear-gradient runs the
 *    loading shimmer and the editor-shell glow. Design.md bans gradients that
 *    fake lighting on a surface, which none of these do.
 *  - box-shadow is checked only for `inset`. The rest are overlay shadows and
 *    accent glows, both sanctioned.
 *
 * A rule that fires on legitimate code trains people to reach for a disable
 * comment, and then it stops working even where it is right. Narrow and
 * trusted beats broad and ignored.
 */

const T = require("./tokens.cjs");

/** Capsule idioms: these mean "fully round", not an off-ladder radius. */
const CAPSULE = new Set(["999px", "9999px", "50%", "100%", "9999em"]);

const RADIUS_PX = { 6: "md", 8: "lg", 12: "xl", 16: "2xl", 24: "3xl" };

/** Strips comments so their contents are never reported. */
function stripComments(css) {
  // Replace with spaces of equal length to keep offsets (and line numbers) intact.
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * The selector whose block contains `index`. Used only for the control
 * exemptions — a declaration's meaning can depend on which control it styles.
 */
function selectorAt(css, index) {
  const open = css.lastIndexOf("{", index);
  if (open === -1) return "";
  const prev = Math.max(
    css.lastIndexOf("}", open),
    css.lastIndexOf("{", open - 1),
    css.lastIndexOf(";", open),
  );
  return css.slice(prev + 1, open).trim().replace(/\s+/g, " ");
}

/** True when Design.md §5 fixes this exact value for this control. */
function isExempt(selector, prop, value) {
  for (const [ctrl, props] of Object.entries(T.CONTROL_EXEMPT)) {
    if (!selector.includes(ctrl)) continue;
    if ((props[prop] || []).includes(value)) return true;
  }
  return false;
}

function nearestRadius(px) {
  const steps = Object.keys(RADIUS_PX).map(Number);
  return RADIUS_PX[steps.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a))];
}

/**
 * Scans one stylesheet. Returns `{ line, label, message }[]`.
 *
 * Only declaration VALUES are examined — matching `prop: value` rather than
 * scanning raw text keeps ID selectors (`#root`, `#fade`) from being read as
 * colours.
 */
function scanCss(source) {
  const css = stripComments(source);
  const out = [];
  const push = (index, label, message) =>
    out.push({ line: lineOf(css, index), label, message });

  for (const m of css.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
    const [, rawProp, rawValue] = m;
    const prop = rawProp.toLowerCase();
    const value = rawValue.trim();
    const at = m.index + rawProp.length;

    if (prop === "border-radius" || prop.startsWith("border-") && prop.endsWith("-radius")) {
      for (const token of value.split(/\s+/)) {
        if (CAPSULE.has(token)) continue;
        const px = /^(\d+(?:\.\d+)?)px$/.exec(token);
        if (!px) continue;
        const n = parseFloat(px[1]);
        if (isExempt(selectorAt(css, m.index), prop, token)) continue;
        if (!Object.prototype.hasOwnProperty.call(RADIUS_PX, n)) {
          push(at, "radius",
            `\`border-radius: ${token}\` is off the radius ladder. Use ${nearestRadius(n)} (${Object.entries(RADIUS_PX).find(([, k]) => k === nearestRadius(n))[0]}px) — the scale is 6/8/12/16/24px, or 999px for a capsule (Design.md §4).`);
        }
      }
    }

    if (prop === "font-size") {
      const px = /^(\d+(?:\.\d+)?)px$/.exec(value);
      if (px && !T.TYPE_SCALE.includes(parseFloat(px[1]))) {
        const near = T.TYPE_SCALE.reduce((a, b) =>
          Math.abs(b - parseFloat(px[1])) < Math.abs(a - parseFloat(px[1])) ? b : a);
        push(at, "type",
          `\`font-size: ${value}\` is off the type scale. Use ${near}px — the scale is ${T.TYPE_SCALE.join("/")}px (Design.md §3).`);
      }
    }

    if (prop === "box-shadow" && /\binset\b/.test(value)) {
      push(at, "flat",
        "`box-shadow: … inset` is skeuomorphic — use a darker fill instead (Design.md §1).");
    }

    if (prop === "accent-color") {
      push(at, "flat",
        "`accent-color` renders platform-specific skeuomorphic controls — use `.flat-range` / `.flat-check` (Design.md §5).");
    }

    // Colours. 8-digit hex carries alpha; compare on the RGB half.
    for (const hex of value.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const raw = hex[0];
      const rgbOnly = raw.length > 7 ? raw.slice(0, 7) : raw;
      if (T.isNeutralHex(rgbOnly)) continue;
      const norm = rgbOnly.toLowerCase();
      if (Object.keys(T.ACCENTS).some((a) => a.toLowerCase() === norm)) continue;
      if (Object.keys(T.AGENT_IDENTITY_COLORS || {}).some((a) => a.toLowerCase() === norm)) continue;
      if ([...T.BRAND_COLORS].some((b) => b.toLowerCase() === norm)) continue;
      if (T.isTintedHex(rgbOnly)) {
        push(at, "palette",
          `\`${raw}\` is a tinted hex gray. UI structure must use Tailwind's neutral scale (e.g. bg-neutral-900, text-neutral-400) or alpha washes (Design.md §2).`);
      } else {
        push(at, "palette",
          `\`${raw}\` is a non-neutral colour outside the palette. Accents are ${Object.keys(T.ACCENTS).slice(0, 2).join(" / ")}; everything else is the neutral ramp. Register a new one in design/tokens.cjs with its role (Design.md §2).`);
      }
    }

    if (T.EMOJI.test(value) && prop === "content") {
      push(at, "emoji",
        "Emoji in CSS `content`. VOO uses no emoji as icons or decoration (Design.md §1).");
    }
  }

  return out.sort((a, b) => a.line - b.line);
}

module.exports = { scanCss, selectorAt, CAPSULE, RADIUS_PX };
