/**
 * Enforces the visual language defined in `Design.md`.
 *
 * Why this exists as a lint rule rather than a paragraph of documentation:
 * several different agents write in this repo — Claude Code, Codex,
 * Antigravity, DeepSeek — and each reads a different instructions file, or
 * none. Prose only reaches whoever happens to load it. The lint gate reaches
 * everyone, because every one of them ends up running `npm run lint` and
 * committing through the same pre-commit hook.
 *
 * Every message therefore states the CORRECT replacement rather than only
 * naming the offence. An agent that has never opened Design.md still learns
 * the rule from the failure output, which is the whole point.
 *
 * Class-based checks look only inside `className` / `class` JSX attributes, so
 * canvas drawing code (`ctx.fillStyle = "#333"`) and other non-UI strings are
 * never touched. The emoji check looks only at rendered JSX text and
 * user-visible attributes, so data such as `STICKER_EMOJI` stays legal.
 */

const T = require("../design/tokens.cjs");

const DATA_FILE_PATTERN =
  /(?:SwatchGrid|layout_skills_data|region_colours|scene_model_node_builders|design_systems)\.(?:jsx?|tsx?)$/;

const RADIUS_LADDER = Object.keys(T.RADIUS).join(", ");
const TYPE_LADDER = T.TYPE_SCALE.map((n) => `text-[${n}px]`).join(", ");
const HUE_LADDER = [...T.ALLOWED_HUES].join(", ");
const VISIBLE_ATTRS = /^(title|placeholder|alt|aria-label)$/;

/** Nearest legal radius for an arbitrary px value, for the hint in the message. */
function nearestRadius(px) {
  const ladder = [
    [6, "rounded-md"],
    [8, "rounded-lg"],
    [12, "rounded-xl"],
    [16, "rounded-2xl"],
    [24, "rounded-3xl"],
  ];
  let best = ladder[0];
  for (const step of ladder) {
    if (Math.abs(step[0] - px) < Math.abs(best[0] - px)) best = step;
  }
  return best[1];
}

/** Nearest legal font size, for the hint in the message. */
function nearestType(px) {
  return T.TYPE_SCALE.reduce((a, b) =>
    Math.abs(b - px) < Math.abs(a - px) ? b : a,
  );
}

/** Every string fragment inside a className attribute, including clsx() args. */
function classStrings(node) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "Literal" && typeof n.value === "string") {
      out.push([n, n.value]);
    } else if (n.type === "TemplateElement") {
      out.push([n, n.value.raw]);
    }
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const child = n[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child.type === "string") walk(child);
    }
  };
  walk(node.value);
  return out;
}

module.exports = {
  /**
   * Files whose whole job is to hold arbitrary colours (swatch presets,
   * region palettes). Exported so the contrast wrapper applies the same
   * exemption: a data file legitimately contains a `#4b5563`, and the palette
   * rule already knows that — but the contrast rule would otherwise be the one
   * place that forgot, and report a preset table as unreadable UI.
   */
  DATA_FILE_PATTERN,
  meta: {
    type: "problem",
    docs: { description: "Enforce the VOO visual language (see Design.md)" },
    schema: [
      {
        type: "object",
        properties: {
          radius: { type: "boolean" },
          type: { type: "boolean" },
          palette: { type: "boolean" },
          flat: { type: "boolean" },
          shadow: { type: "boolean" },
          border: { type: "boolean" },
          emoji: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      radiusArbitrary:
        "`{{token}}` is off the radius ladder. Use `{{suggest}}` — the scale is {{ladder}} (Design.md §4).",
      radiusUnknown:
        "`{{token}}` is off the radius ladder. Use one of: {{ladder}} (Design.md §4). Bare `rounded` (4px) is not on it; a square small button wants `rounded-lg`.",
      typeArbitrary:
        "`{{token}}` is off the type scale. Use `text-[{{suggest}}px]` — the scale is {{ladder}} (Design.md §3).",
      typeNamed:
        "`{{token}}` is off the type scale. Use one of {{ladder}} (or `text-xs` for 12px) — hierarchy comes from size and colour, not from more sizes (Design.md §3).",
      hue: "`{{token}}` uses a hue outside the palette. Structure is neutral-*; colour is reserved for meaning ({{ladder}}), and accents are #a7ffd4 (system) / #E5B2FF (AI). No coloured tags or badges (Design.md §2).",
      hueBannedGray:
        "`{{token}}` uses the {{hue}} palette. All structural grays must use Tailwind's neutral-* scale (Design.md §2).",
      hueSolid:
        "`{{token}}` is a solid block of semantic colour — a coloured tag/badge. Use a /10 wash with the tone in the text instead: `bg-rose-500/10 text-rose-400`. (A status dot is exempt: rounded-full at dot size.) (Design.md §2)",
      hex: "`{{token}}` is a non-neutral hex outside the palette. The only accents are #a7ffd4 (system & flow) and #E5B2FF (AI & editor); everything else is the neutral ramp (Design.md §2). If this is a third-party brand mark, register it in design/tokens.cjs BRAND_COLORS — brand colour is allowed on that brand's own icon only.",
      tintedGray:
        "`{{token}}` is a tinted hex gray. UI structure must use Tailwind's neutral scale (e.g. bg-neutral-900, text-neutral-400) or alpha washes (Design.md §2).",
      flat: "`{{token}}` is skeuomorphic — {{why}} (Design.md §1).",
      shadowScale:
        "`{{token}}` is a hand-written overlay shadow. Use `shadow-{{step}}` — the ladder is shadow-pop (tooltips, hints, capsule buttons) / shadow-menu (dropdowns, selects) / shadow-panel (drawers, modals). One-off values are how this codebase ended up with 18 shadows meaning the same three things (Design.md §1).",
      shadowNamed:
        "`{{token}}` is not on the overlay shadow ladder. Use `shadow-pop` (tooltips, hints, capsule buttons) / `shadow-menu` (dropdowns, selects) / `shadow-panel` (drawers, modals) — picked by how far off the canvas the thing floats (Design.md §1).",
      shadowCard:
        "`shadow-card` is the node card's own shadow — canvas content, not an overlay. It is valid only on the element carrying the `node-card` class; an overlay wants shadow-pop / shadow-menu / shadow-panel (Design.md §1).",
      border:
        "`{{token}}` is a solid-tone border. Hierarchy comes from background lightness, not outlines: make the overlay one step brighter than the canvas. If a hairline is truly needed, it is `border-white/10`, and only on an overlay's outermost edge (Design.md §0.1).",
      emoji:
        "Emoji `{{glyph}}` in the interface. VOO uses no emoji as icons or decoration — use a Lucide icon inheriting the parent text colour, or plain text (Design.md §1, §2).",
    },
  },

  create(context) {
    const opt = context.options[0] || {};
    const on = (k) => opt[k] !== false;
    const filename =
      context.filename || (context.getFilename && context.getFilename()) || "";
    const isDataFile = DATA_FILE_PATTERN.test(filename);

    /** Reports at the node; the message names the exact token. */
    const report = (node, messageId, data) =>
      context.report({ node, messageId, data });

    function checkRadius(node, text) {
      for (const m of text.matchAll(T.ARBITRARY_RADIUS)) {
        const px = parseFloat((m[0].match(/\[(\d+(?:\.\d+)?)/) || [])[1]);
        report(node, "radiusArbitrary", {
          token: m[0],
          suggest: Number.isFinite(px) ? nearestRadius(px) : "rounded-lg",
          ladder: RADIUS_LADDER,
        });
      }
      for (const m of text.matchAll(T.NAMED_RADIUS)) {
        const size = m[1];
        // Bare `rounded` is Tailwind's 4px, which is not on the ladder.
        if (size === undefined) {
          report(node, "radiusUnknown", {
            token: "rounded",
            ladder: RADIUS_LADDER,
          });
        } else if (!Object.prototype.hasOwnProperty.call(T.RADIUS, size)) {
          report(node, "radiusUnknown", { token: m[0], ladder: RADIUS_LADDER });
        }
      }
    }

    function checkType(node, text) {
      for (const m of text.matchAll(T.ARBITRARY_TYPE)) {
        const px = parseFloat(m[1]);
        if (!T.TYPE_SCALE.includes(px)) {
          report(node, "typeArbitrary", {
            token: m[0],
            suggest: nearestType(px),
            ladder: TYPE_LADDER,
          });
        }
      }
      for (const m of text.matchAll(T.NAMED_TYPE)) {
        if (!T.ALLOWED_NAMED_TYPE.has(m[0])) {
          report(node, "typeNamed", { token: m[0], ladder: TYPE_LADDER });
        }
      }
    }

    function checkPalette(node, text, haystack) {
      for (const m of text.matchAll(T.HUE_UTILITY)) {
        const [token, hue] = [m[0], m[1]];
        if (hue === "white" || hue === "black" || hue === "transparent")
          continue;
        if (!T.ALLOWED_HUES.has(hue)) {
          if (["slate", "gray", "zinc", "stone"].includes(hue)) {
            report(node, "hueBannedGray", { token, hue });
          } else {
            report(node, "hue", { token, ladder: HUE_LADDER });
          }
          continue;
        }
        // Neutral is the structural ramp — solid neutral is always correct.
        if (hue === "neutral") continue;
        // A solid semantic fill is a coloured badge, unless it is a status dot:
        // a few pixels of pure signal, which the palette rule does allow.
        const isDot = T.STATUS_DOT.test(haystack) && T.DOT_SIZED.test(haystack);
        if (token.startsWith("bg-") && !/\/\d+$/.test(token) && !isDot) {
          report(node, "hueSolid", { token });
        }
      }
      for (const m of text.matchAll(T.INLINE_HEX)) {
        const hex = m[0];
        const norm = hex.toLowerCase();
        if (isDataFile) continue;
        if (T.isNeutralHex(hex)) continue;
        if (Object.keys(T.ACCENTS).some((a) => a.toLowerCase() === norm))
          continue;
        if (
          Object.keys(T.AGENT_IDENTITY_COLORS || {}).some(
            (a) => a.toLowerCase() === norm,
          )
        )
          continue;
        if ([...T.BRAND_COLORS].some((b) => b.toLowerCase() === norm)) continue;
        if (T.isTintedHex(hex)) {
          report(node, "tintedGray", { token: hex });
        } else {
          report(node, "hex", { token: hex });
        }
      }
    }

    function checkFlat(node, text) {
      for (const [needle, why] of Object.entries(T.SKEUOMORPHIC)) {
        if (text.includes(needle)) report(node, "flat", { token: needle, why });
      }
      for (const m of text.matchAll(T.ARBITRARY_SHADOW)) {
        if (!T.BLACK_SHADOW.test(m[1])) continue; // an accent glow, not a lift
        // Tailwind arbitrary values use `_` for spaces: 0_18px_48px_rgba(...).
        const y = parseFloat((m[1].split("_")[1] || "").replace("px", ""));
        if (!Number.isFinite(y) || y <= 0) continue; // a ring or an edge fade
        report(node, "shadowScale", { token: m[0], step: T.shadowStepFor(y) });
      }
    }

    function checkShadow(node, text, haystack) {
      for (const m of text.matchAll(T.SHADOW_OFF_LADDER)) {
        report(node, "shadowNamed", { token: m[0] });
      }
      // The node card is canvas content, so its shadow answers to the
      // `node-card` class, which may sit in another string of the same
      // className (a ternary branch) — judge against the whole attribute.
      if (T.SHADOW_CARD.test(text) && !T.NODE_CARD.test(haystack)) {
        report(node, "shadowCard", {});
      }
    }

    function checkBorder(node, text) {
      for (const m of text.matchAll(T.SOLID_BORDER)) {
        report(node, "border", { token: m[0] });
      }
    }

    function checkEmoji(node, text) {
      const hit = text.match(T.EMOJI);
      if (hit) report(node, "emoji", { glyph: hit[0] });
    }

    return {
      // Class-based rules: scoped to className/class so non-UI strings are safe.
      "JSXAttribute[name.name=/^(className|class)$/]"(node) {
        const parts = classStrings(node);
        // Context for heuristics that need the whole class list, not one
        // branch of a ternary: `bg-emerald-400` reads as a badge on its own
        // but as a status dot next to `rounded-full size-1.5`.
        const haystack = parts.map(([, t]) => t).join(" ");
        for (const [strNode, text] of parts) {
          if (on("radius")) checkRadius(strNode, text);
          if (on("type")) checkType(strNode, text);
          if (on("palette")) checkPalette(strNode, text, haystack);
          if (on("flat")) checkFlat(strNode, text);
          if (on("shadow")) checkShadow(strNode, text, haystack);
          if (on("border")) checkBorder(strNode, text);
        }
      },

      // Emoji: only what actually renders.
      JSXText(node) {
        if (on("emoji")) checkEmoji(node, node.value);
      },
      JSXAttribute(node) {
        if (!on("emoji")) return;
        if (!node.name || !VISIBLE_ATTRS.test(node.name.name || "")) return;
        const v = node.value;
        if (v && v.type === "Literal" && typeof v.value === "string") {
          checkEmoji(v, v.value);
        }
      },
    };
  },
};
