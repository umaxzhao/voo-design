/**
 * The "looks AI-generated" checks of the design gate (Design.md §1.1).
 *
 * Generated UIs share a handful of habits that a reader spots instantly: an
 * icon parked inside a tinted square or circle, cards that jump up on hover,
 * bold everywhere, bouncing attention-grabbers. None of them is wrong in
 * isolation, which is exactly why they spread — every agent reaches for them
 * by default. This module turns each habit into a finding that names the
 * replacement, and is merged into the single `design/design-system` rule by
 * `design/lint.cjs` so there is still one gate, one output and one hook.
 *
 * Kept deliberately narrow. A false positive is how a lint rule gets
 * `eslint-disable`d and dies, so every check below matches a concrete token
 * or a concrete JSX shape, never a vague "looks decorative".
 */

const MESSAGES = {
  iconTile:
    "`<{{icon}}>` sits inside a decorative background (`{{token}}`). Icons stand bare: drop the wrapper's background and let the icon take the parent's text colour. The icon-in-a-tile look is the most recognisable AI-generated pattern. A clickable control's own hover/active background is fine — put it on the <button> (Design.md §1.1, §12).",
  hoverLift:
    "`{{token}}` lifts the element on hover — the floating-card template. Hover is a colour or lightness change (`transition-colors`), optionally a slight `scale-105` (Design.md §1.1, §9).",
  attentionAnimation:
    "`{{token}}` is an attention-grabbing loop. Motion reports state: `animate-spin` on a spinner, `animate-pulse` on something actually running — nothing bounces or pings (Design.md §1.1).",
  heavyWeight:
    "`{{token}}` is heavier than the type system allows. Hierarchy comes from size and colour: body is regular, titles `font-medium` (Design.md §1.1, §3).",
  boldOffScale:
    "`font-bold` belongs to the single display size only (`text-[15px]`, e.g. the Agent greeting). Everywhere else use `font-medium` and let size and colour carry the hierarchy (Design.md §1.1, §3).",
};

const LABEL = {
  iconTile: "ai",
  hoverLift: "ai",
  attentionAnimation: "ai",
  heavyWeight: "ai",
  boldOffScale: "ai",
};

/** `hover:x`, `group-hover:x`, `md:hover:x` → { variants: [...], base: "x" }. */
function splitToken(token) {
  const i = token.lastIndexOf(":");
  return i === -1
    ? { variants: [], base: token }
    : { variants: token.slice(0, i).split(":"), base: token.slice(i + 1) };
}

const LIFT = /^-?translate-y-/;
const ATTENTION = /^animate-(bounce|ping)$/;
const HEAVY = /^font-(extrabold|black)$/;
// The display size, or the VOO wordmark (a logo, which keeps its own weight).
const BOLD_ALLOWED = /(?<![\w-])(text-\[15px\]|brand-name)(?![\w-])/;

/**
 * Token checks for one class string. `haystack` is the whole className, so
 * `font-bold` in one ternary branch is judged against the size in another.
 */
function checkClassText(report, node, text, haystack) {
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const { variants, base } = splitToken(token);
    if (LIFT.test(base) && variants.some((v) => v.endsWith("hover"))) {
      report(node, "hoverLift", { token });
    }
    if (ATTENTION.test(base)) report(node, "attentionAnimation", { token });
    if (HEAVY.test(base)) report(node, "heavyWeight", { token });
    if (base === "font-bold" && !BOLD_ALLOWED.test(haystack)) {
      report(node, "boldOffScale", {});
    }
  }
}

// ─── icon tiles ─────────────────────────────────────────────────────────────
// A tile is a NON-interactive span/div that paints a background and holds
// exactly one icon and nothing else. Grounds that do a job are exempt:
//   - interactive elements, and wrappers whose background reacts to hover:
//     that background is a control state, not decoration;
//   - overlays (absolute/fixed, or lifted with an overlay shadow): something
//     floating over an image or other content needs its own ground to read;
//   - checkbox marks: a small filled square/circle holding a check IS the
//     control's checked state;
//   - `data-media-placeholder`: the icon stands in for a missing thumbnail in
//     a row of real thumbnails, so it keeps the thumbnail's frame.

const ICON_MODULE = /(^lucide-react$|\/icons(\.jsx?)?$)/;
// Third-party marks keep their own presentation (Design.md §12).
const BRAND_NAME = /(Logo|Brand|Provider)/;
const INTERACTIVE_ATTR =
  /^(on(Click|MouseDown|PointerDown|KeyDown)|role|tabIndex|href|data-media-placeholder)$/;
const HOVER_SURFACE = /(^|:)(group-|peer-)?hover:bg-/;
const OVERLAY = /^(absolute|fixed)$|^shadow-(pop|menu|panel)$/;
const CHECK_ICON = /^IconCheck/;
// Checkbox-sized: 20px or less (h-4, size-5, w-[18px] …).
const CHECKBOX_SIZE = /^(size|h|w)-(3|3\.5|4|4\.5|5|\[(1\d|20)px\])$/;
// Background utilities that paint colour — not bg-cover, bg-clip-text, etc.
const PAINT_BG =
  /^bg-(?!transparent$|none$|clip-|cover$|contain$|center$|no-repeat$|repeat|fixed$|local$|scroll$|origin-|blend-|auto$|bottom|top|left|right)/;

function classAttrText(attr) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "Literal" && typeof n.value === "string") out.push(n.value);
    else if (n.type === "TemplateElement") out.push(n.value.raw);
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const child = n[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child.type === "string") walk(child);
    }
  };
  walk(attr.value);
  return out.join(" ");
}

function createIconTileListeners(report) {
  const iconNames = new Set();

  return {
    ImportDeclaration(node) {
      if (!ICON_MODULE.test(String(node.source.value))) return;
      for (const spec of node.specifiers) {
        const name = spec.local && spec.local.name;
        if (name && !BRAND_NAME.test(name)) iconNames.add(name);
      }
    },

    JSXElement(node) {
      const open = node.openingElement;
      if (open.name.type !== "JSXIdentifier") return;
      if (open.name.name !== "span" && open.name.name !== "div") return;

      const attrs = open.attributes.filter((a) => a.type === "JSXAttribute");
      if (attrs.some((a) => INTERACTIVE_ATTR.test(a.name.name || ""))) return;
      const cls = attrs.find((a) =>
        /^(className|class)$/.test(a.name.name || ""),
      );
      if (!cls) return;

      const tokens = classAttrText(cls).split(/\s+/).filter(Boolean);
      const paint = tokens.find((t) => !t.includes(":") && PAINT_BG.test(t));
      if (!paint) return;
      if (tokens.some((t) => HOVER_SURFACE.test(t) || OVERLAY.test(t))) return;

      const kids = node.children.filter(
        (c) => !(c.type === "JSXText" && c.value.trim() === ""),
      );
      if (kids.length !== 1 || kids[0].type !== "JSXElement") return;
      const kidName = kids[0].openingElement.name;
      if (kidName.type !== "JSXIdentifier" || !iconNames.has(kidName.name))
        return;
      if (
        CHECK_ICON.test(kidName.name) &&
        tokens.some((t) => CHECKBOX_SIZE.test(t))
      ) {
        return;
      }

      report(cls, "iconTile", { icon: kidName.name, token: paint });
    },
  };
}

module.exports = { MESSAGES, LABEL, checkClassText, createIconTileListeners };
