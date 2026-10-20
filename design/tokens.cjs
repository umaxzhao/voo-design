/**
 * Single source of truth for VOO's visual scale.
 *
 * `Design.md` is the prose version of this file; the lint rules in
 * `eslint-rules/design-system.cjs` and the Tailwind theme both read the values
 * from here so a scale can never mean two different things in two places.
 * That failure mode has real precedent in this repo — see CLAUDE.md section 10
 * ("the same number written in two places") — and the palette had already
 * drifted once: tailwind.config.js called the canvas #1c1c1c while Design.md
 * called it #000000.
 *
 * CommonJS on purpose: .eslintrc.cjs, the rule file and tailwind.config.js all
 * need to require it, and only one of those is an ES module.
 */

/**
 * Surface ladder. Depth is expressed as lightness, one step at a time — this
 * is what replaces borders (Design.md §0.1).
 *
 * Note the two distinct grounds, which have been confused before because the
 * Tailwind theme names the second one "canvas": `page` is html/body/#root and
 * is pure black; `stage` is the node canvas that sits on top of it. Both are
 * correct, they are simply different layers.
 */
const SURFACE = {
  page: "#000000", // html, body, #root
  stage: "#525252", // .canvas-stage — the node canvas, calibrated neutral-600
  panel: "#171717", // overlay panels, at 95% + backdrop-blur, calibrated neutral-900
  raised: "#262626", // controls resting on a panel, calibrated neutral-800
  hover: "#404040", // calibrated neutral-700 (prefer alpha wash bg-white/[0.08] for interactive hover)
  card: "#262626", // node cards, calibrated neutral-800
};

/**
 * Overlay shadows — three steps, one per "how far off the canvas is this".
 *
 * Depth in this UI is otherwise expressed as lightness (Design.md §0.1);
 * shadow exists only to lift an overlay off the canvas, never to model a
 * component's surface. The three values are the medians of the three clusters
 * the codebase had already settled into on its own: 31 hand-written overlay
 * shadows across 18 distinct values, grouping cleanly by y-offset at 4-8px,
 * 12-14px and 18-24px.
 *
 * `boxShadow.card` in the Tailwind theme is deliberately NOT one of these — it
 * belongs to the node card, which is canvas content rather than an overlay.
 */
const SHADOW = {
  pop: "0 8px 24px rgba(0, 0, 0, 0.5)", // tooltips, hints, capsule buttons
  menu: "0 14px 36px rgba(0, 0, 0, 0.55)", // dropdowns, selects, option menus
  panel: "0 24px 64px rgba(0, 0, 0, 0.6)", // drawers, modals, large panels
};

/**
 * Fixed dimensions that Design.md §5 specifies for individual controls, and
 * which therefore sit off the general ladders on purpose.
 *
 * Registered rather than hard-coded into the scanner so the exemption states
 * which spec it comes from: `.flat-check` is defined as a 12px square with a
 * 3px corner, so reporting that 3px as "off the radius ladder" would be the
 * gate contradicting the document it enforces.
 */
const CONTROL_EXEMPT = {
  ".flat-check": { "border-radius": ["3px"] }, // Design.md §5 — 12px square, 3px corner
};

/** Corner radii. Anything outside this ladder is a design bug, not a nuance. */
const RADIUS = {
  md: "6px — swatches, thumbnails, tags",
  lg: "8px — buttons, menu items, small controls",
  xl: "12px — inputs, list rows, cards",
  "2xl": "16px — panels, popovers",
  "3xl": "24px — drawers, large dialogs",
  full: "pills, status dots, avatars, slider thumbs",
};

/** Font sizes, in px. The UI is dense and deliberately quiet. */
const TYPE_SCALE = [
  9, 10, 11, 12,
  // 15 — the one display size: the agent welcome headline, a single greeting
  // line that has to read as a title rather than another control label.
  15,
];

/** Tailwind's named sizes that map onto the scale above. */
const ALLOWED_NAMED_TYPE = new Set(["text-xs"]); // 12px

/**
 * Hue families that may appear at all. Everything structural is neutral;
 * colour is reserved for meaning.
 */
const ALLOWED_HUES = new Set([
  "neutral", // the entire hierarchy
  "emerald", // success / ready
  "amber", // warning / needs action
  "rose", // error / danger
]);

/**
 * The accent palette, each entry with a fixed job. Mixing the two families is
 * the bug; inventing a fourth shade of one of them is the other bug.
 *
 * The text variants are listed because they are the reason shades kept getting
 * invented: an agent needing "purple text on a purple wash" found no answer in
 * Design.md and made one up, three times over. A scale with a hole in it does
 * not get respected, it gets patched locally.
 *
 * Known duplication, deliberately left legal for now: #b2ffd6 (the node port
 * colour, from tailwind.config.js) is visually indistinguishable from #a7ffd4.
 * Collapsing them is a separate cleanup — it touches ~50 call sites — and
 * until then both are real, so both are registered.
 */
const ACCENTS = {
  "#a7ffd4":
    "mint — system & flow (wires, selection, connection state, focus ring)",
  "#E5B2FF":
    "purple — AI & editor (AI actions, masks, layer highlight, generation)",
  "#eed0ff": "purple, text variant — for text sitting on a purple wash",
  "#b2ffd6":
    "node port: image (tailwind.config.js port.image) — see note above",
  "#b2ccff": "node port: text (tailwind.config.js port.text)",
  "#ffe066": "yellow — library & assets highlight",
};

/**
 * Agent identity palette for multi-agent distinction.
 *
 * Dedicated strictly to agent identity status dots (`rounded-full` at dot size),
 * never as surface washes, text colors, or border hairlines.
 * Excludes Mint (#a7ffd4) and Purple (#E5B2FF) to avoid collision with system
 * flow and AI editor semantics, and avoids semantic status hues (emerald/amber/rose).
 */
const AGENT_IDENTITY_COLORS = {
  "#7dd3fc": "agent identity (status dot only) — sky",
  "#93c5fd": "agent identity (status dot only) — blue",
  "#a5b4fc": "agent identity (status dot only) — indigo",
  "#c4b5fd": "agent identity (status dot only) — violet",
  "#f0abfc": "agent identity (status dot only) — fuchsia",
  "#f472b6": "agent identity (status dot only) — pink",
  "#67e8f9": "agent identity (status dot only) — cyan",
  "#d6d3d1": "agent identity (status dot only) — warm neutral",
};

/**
 * Third-party brand colours, allowed only inside that brand's own icon and
 * never as an interface accent.
 *
 * Registered centrally rather than inlined at each icon so that "is this hue
 * deliberate or did an agent invent it?" has one answer instead of a dozen.
 * Adding a brand icon means adding its colour here first.
 */
const BRAND_COLORS = new Set([
  "#1677FF", // Alipay
  "#D97757", // Claude
  "#10A37F", // OpenAI / Codex
  "#38BDF8", // Antigravity
  "#F8CF00", // Tripo
]);

/**
 * Canonical strokeWidth for icons across the app.
 *
 * Lucide's default is 2, but at VOO's dense 13-17px scale a 1.5px stroke
 * keeps line drawings legible and quiet without dominating adjacent typography.
 */
const ICON_STROKE_WIDTH = 1.5;

/** Flat means flat. These utilities have no legitimate use in this UI. */
const SKEUOMORPHIC = {
  "bg-gradient-to-":
    "gradients are skeuomorphic; layer with background lightness instead",
  "shadow-inner": "inner shadows are skeuomorphic; use a darker fill",
  "shadow-md":
    "component-level shadows are not used; only overlays cast shadows (shadow-pop / shadow-menu / shadow-panel)",
  "shadow-lg":
    "component-level shadows are not used; only overlays cast shadows (shadow-pop / shadow-menu / shadow-panel)",
  "drop-shadow":
    "component-level shadows are not used; only overlays cast shadows (shadow-pop / shadow-menu / shadow-panel)",
  "accent-color":
    "native accent-color renders platform-specific skeuomorphic controls; use .flat-range / .flat-check",
};

/**
 * Borders are a last resort, not a default. Hierarchy comes from lightness:
 * an overlay is one step brighter than the canvas, a control one step brighter
 * than the overlay. Solid-tone borders are the historical wrong answer.
 */
const BORDER_ALLOWED = [
  "border-white/", // the sanctioned translucent hairline
  "border-transparent",
  "border-current",
  "border-none",
];

/** Radius utilities that carry an arbitrary value, e.g. rounded-[7px]. */
const ARBITRARY_RADIUS =
  /\brounded(-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?-\[[^\]]+\]/g;

/** Named radius utilities, e.g. rounded-xl, rounded-br-lg, bare `rounded`. */
const NAMED_RADIUS =
  /\brounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?(?:-([a-z0-9]+))?\b(?!-\[)/g;

/** Arbitrary font sizes, e.g. text-[13px]. */
const ARBITRARY_TYPE = /\btext-\[(\d+(?:\.\d+)?)px\]/g;

/** Named font sizes, e.g. text-sm. */
const NAMED_TYPE = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/g;

/**
 * Any hue-family utility, e.g. bg-cyan-300, text-rose-400/70.
 * The opacity suffix must be part of the match: `bg-emerald-500/10` is the
 * sanctioned wash, while `bg-emerald-500` is a solid block, and a pattern that
 * stopped at the digits would report the correct form as the wrong one.
 */
const HUE_UTILITY =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide|placeholder)-([a-z]+)-(\d{2,3})(\/\d{1,3})?\b/g;

/** Hex colours written inline, e.g. bg-[#141414]. */
const INLINE_HEX = /#[0-9a-fA-F]{3,8}\b/g;

/**
 * Hand-written overlay shadows, e.g. shadow-[0_18px_48px_rgba(0,0,0,0.7)].
 *
 * Only shadows that are BLACK and have a downward offset are overlay shadows.
 * That distinction is what keeps the rule honest: a zero y-offset means an
 * accent glow (`0_0_20px_rgba(178,255,214,0.4)`), a ring, or the horizontal
 * scroll-edge fade (`8px_0_12px_#000`) — all legitimate effects that a blunter
 * pattern would report as violations.
 */
const ARBITRARY_SHADOW = /\bshadow-\[([^\]]+)\]/g;
const BLACK_SHADOW = /rgba?\(\s*0\s*,\s*0\s*,\s*0|#000(?:000)?\b/;

/**
 * Tailwind's named shadow scale, minus the sanctioned steps. The overlay
 * ladder is pop/menu/panel and the node card has its own `card`; `shadow`,
 * `shadow-sm`, `shadow-xl` and `shadow-2xl` only say "a shadow of some size",
 * which is exactly the drift the ladder replaced. `shadow-md` / `shadow-lg` /
 * `shadow-inner` live in SKEUOMORPHIC; `shadow-none` removes a shadow and is
 * always legal.
 *
 * The lookarounds keep the pattern off the ladder itself
 * (`shadow-pop` et al.), off `shadow-card`, off arbitrary `shadow-[…]`
 * values, and off suffixes like `transition-shadow`.
 */
const SHADOW_OFF_LADDER = /(?<![\w-])shadow(?:-(?:sm|xl|2xl))?(?![\w-])/g;

/**
 * `shadow-card` is the node card's own shadow — canvas content, not an
 * overlay. It is valid only on the element carrying the `node-card` class
 * (which `node-card-body` and friends also satisfy, by word-prefix).
 */
const SHADOW_CARD = /\bshadow-card\b/;
const NODE_CARD = /\bnode-card\b/;

/** Picks the overlay step for a given y-offset. */
function shadowStepFor(y) {
  if (y <= 8) return "pop";
  if (y <= 16) return "menu";
  return "panel";
}

/** Solid-tone borders, e.g. border-neutral-700. */
const SOLID_BORDER = /\bborder-(?:neutral|zinc|gray|stone|slate)-\d{2,3}\b/g;

/**
 * Emoji, by the only judgement that actually separates the two cases:
 * `Emoji_Presentation` is the Unicode property for characters that render as a
 * colour pictograph by default. Unicode BLOCKS do not work here — Dingbats
 * holds both the decorative sparkle and the plain check mark, and Misc Symbols
 * holds both the warning sign and a heart.
 *
 * So this matches the pictographs the UI bans while leaving the typographic
 * glyphs the UI legitimately uses as text: check and cross marks, the warning
 * sign, arrows, bullets, musical notes. U+FE0F is included because it is the
 * selector that forces colour presentation onto an otherwise-textual glyph
 * (that is the difference between a heart and a heart emoji).
 */
const EMOJI = /\p{Emoji_Presentation}|\uFE0F/u;

/**
 * A status dot is a legitimate solid use of a semantic hue: it is a few pixels
 * of pure signal, not the "large areas of colour" the palette rule forbids.
 * Recognised by a full radius plus a dot-sized box.
 */
const STATUS_DOT = /\brounded-full\b/;
const DOT_SIZED =
  /\b(?:size|w|h)-(?:0\.5|1|1\.5|2|2\.5|3)\b|\b(?:size|w|h)-\[[0-9](?:\.[0-9])?px\]/;

/**
 * The neutral ramp. Requires exact channel equality (R == G == B, spread = 0),
 * because UI structure is strictly expressed on Tailwind's neutral scale.
 * Tinted hex grays (cool/blue/zinc/warm tints) are eliminated.
 */
const NEUTRAL_SPREAD = 0;

const { hexToRgb } = require("./contrast.cjs");

function isNeutralHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return Math.max(...rgb) - Math.min(...rgb) <= NEUTRAL_SPREAD;
}

function isTintedHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const spread = Math.max(...rgb) - Math.min(...rgb);
  return spread > NEUTRAL_SPREAD && spread <= 30;
}

module.exports = {
  ...require("./contrast.cjs"),
  ARBITRARY_SHADOW,
  BLACK_SHADOW,
  SHADOW_OFF_LADDER,
  SHADOW_CARD,
  NODE_CARD,
  shadowStepFor,
  SHADOW,
  CONTROL_EXEMPT,
  SURFACE,
  STATUS_DOT,
  DOT_SIZED,
  RADIUS,
  TYPE_SCALE,
  ALLOWED_NAMED_TYPE,
  ALLOWED_HUES,
  ACCENTS,
  AGENT_IDENTITY_COLORS,
  BRAND_COLORS,
  ICON_STROKE_WIDTH,
  SKEUOMORPHIC,
  BORDER_ALLOWED,
  ARBITRARY_RADIUS,
  NAMED_RADIUS,
  ARBITRARY_TYPE,
  NAMED_TYPE,
  HUE_UTILITY,
  INLINE_HEX,
  SOLID_BORDER,
  EMOJI,
  NEUTRAL_SPREAD,
  isNeutralHex,
  isTintedHex,
};
