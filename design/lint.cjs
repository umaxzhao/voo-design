/**
 * Builds the design-gate linter. Shared by `scripts/check-design.mjs` and
 * `tests/design_gate.test.js` so the CLI and the tests exercise one identical
 * configuration — a test that constructs its own linter proves nothing about
 * the one that actually guards commits.
 */

const { ESLint } = require("eslint");
const designRule = require("../eslint-rules/design-system.cjs");
const { DATA_FILE_PATTERN } = require("../eslint-rules/design-system.cjs");
const aiTells = require("../eslint-rules/design-ai-tells.cjs");

const RULE_ID = "design/design-system";

// Extend designRule with contrast enforcement (Design.md §2 & §11):
// Text must not use neutral-600 or darker (contrast < 3:1); placeholders must not use neutral-500 or darker (< 4.5:1).
const DARK_TEXT_NEUTRAL =
  /(?<![\w-])(?:(?:[a-z0-9-]+:)*)text-(?:neutral|zinc|gray|stone|slate)-(?:600|700|800|900|950)(?:\/\d+)?\b/g;
const DARK_PLACEHOLDER_NEUTRAL =
  /(?<![\w-])(?:(?:[a-z0-9-]+:)*)(?:placeholder:(?:text-)?|placeholder-)(?:neutral|zinc|gray|stone|slate)-(?:[5-9]\d{2})(?:\/\d+)?\b/g;
const DARK_TEXT_NEUTRAL_TEST = new RegExp(DARK_TEXT_NEUTRAL.source);
const DARK_PLACEHOLDER_NEUTRAL_TEST = new RegExp(
  DARK_PLACEHOLDER_NEUTRAL.source,
);

const { contrastViolations } = require("./contrast-utilities.cjs");

// ─── shared style string constants ─────────────────────────────────────────
// `className` only reaches class strings written inline in JSX. A class string
// exported from a module — `controlClass` in editor_controls.jsx,
// `SETTINGS_INPUT_CLASS` in settings_section.jsx — is inherited by every
// component that imports it, yet escaped the gate entirely: the same constant
// rendered at two different contrasts depending on where it was used. So
// string *constants* are run through the same checks as a className.
//
// The heuristic is deliberately narrow, because a false positive on prose is
// how a lint rule gets `eslint-disable`d and dies. A candidate must be the
// initialiser of a `const`/`let`/`var` (not an arbitrary return value or an
// i18n dictionary entry), and it must read as a class list: at least two
// whitespace-separated tokens that are a Tailwind utility with an explicit
// value (`text-[11px]`, `w-full`, `placeholder:text-neutral-700`), or one such
// token that is variant-prefixed or arbitrary. Bare English words (`rounded`,
// `shadow`, `text`, `content`) do not count, and CSS custom properties
// (`--color-bg-panel`) never match.
const STYLE_VALUE_ROOTS = `
  min-w min-h max-w max-h grid-cols grid-rows col-span row-span space-x space-y divide-x divide-y
  place-content place-items place-self pointer-events backdrop-blur backdrop-brightness
  backdrop-contrast backdrop-grayscale backdrop-invert backdrop-opacity backdrop-saturate
  backdrop-sepia overflow-x overflow-y overscroll hue-rotate drop-shadow will-change vertical-align
  line-clamp underline-offset subpixel-antialiased object-cover object-contain inline-flex inline-grid
  inline-block list-item flow-root isolation-auto not-sr-only bg-clip bg-origin bg-repeat bg-blend
  mix-blend focus-visible focus-within placeholder rounded shadow border ring outline bg text font
  leading tracking fill stroke from via to accent caret decoration divide opacity transition duration
  ease delay animate transform scale rotate translate skew origin blur brightness contrast grayscale
  invert saturate sepia filter overflow scroll snap touch select cursor resize appearance items justify
  content self place order col row gap grow shrink basis flex grid table columns container float clear
  object aspect list inset top right bottom left z size w h p px py pt pb pl pr ps pe m mx my mt mb ml
  mr ms me block inline hidden contents static fixed absolute relative sticky uppercase lowercase
  capitalize normal-case italic not-italic underline overline line-through no-underline truncate
  whitespace break hyphens align indent visible invisible collapse isolate
`
  .trim()
  .split(/\s+/);
const STYLE_VALUE_ROOT = new RegExp(
  `^(?:${STYLE_VALUE_ROOTS.slice()
    .sort((a, b) => b.length - a.length)
    .join("|")})(?:-|\\[)`,
);

/** A single whitespace token that is a Tailwind utility carrying an explicit value. */
function isStyleValueToken(token) {
  const base = token.includes(":")
    ? token.slice(token.lastIndexOf(":") + 1)
    : token;
  return base.length > 0 && STYLE_VALUE_ROOT.test(base);
}

/** Whether a string reads as a Tailwind class list rather than prose. */
function looksLikeStyleClassString(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // A lone dark text/placeholder tone is unambiguous: no sentence is a single
  // class token, so prose that merely *mentions* the token is left alone.
  if (
    tokens.length === 1 &&
    (DARK_TEXT_NEUTRAL_TEST.test(text) ||
      DARK_PLACEHOLDER_NEUTRAL_TEST.test(text))
  ) {
    return true;
  }
  let valueTokens = 0;
  let strongTokens = 0;
  for (const token of tokens) {
    if (!isStyleValueToken(token)) continue;
    valueTokens += 1;
    if (token.includes(":") || token.includes("[")) strongTokens += 1;
  }
  if (valueTokens === 0 || valueTokens / tokens.length < 0.5) return false;
  return valueTokens >= 2 || strongTokens >= 1;
}

/** String initialisers of a variable declarator, as `[node, text]`. */
function constantStrings(node) {
  const init = node.init;
  if (!init) return [];
  if (init.type === "Literal" && typeof init.value === "string") {
    return [[init, init.value]];
  }
  if (init.type === "TemplateLiteral") {
    return init.quasis
      .map((quasi) => [quasi, quasi.value.raw])
      .filter(([, text]) => text.trim().length > 0);
  }
  return [];
}

function wrapRuleWithContrast(baseRule) {
  return {
    meta: {
      ...baseRule.meta,
      messages: {
        ...baseRule.meta.messages,
        contrastText:
          "`{{token}}` violates contrast rules. Minimum auxiliary text tone is `neutral-500` (contrast 3:1); `neutral-600` is only 2.36:1 and illegible on dark panels (Design.md §2, §11).",
        contrastPlaceholder:
          "`{{token}}` violates contrast rules. Minimum placeholder tone is `neutral-400` (contrast ≥ 4.5:1); placeholders darker than `neutral-400` are illegible (Design.md §2, §11).",
        contrastTextHex:
          "`{{token}}` is too dark to read — it measures {{ratio}} against `{{background}}`, under the 3:1 floor for text and icons. Use `{{replacement}}`, or the named step it stands for (Design.md §2, §11). An arbitrary hex also escapes the palette rule, so prefer the neutral scale over a hand-picked grey.",
        contrastPlaceholderHex:
          "`{{token}}` is too dark to read — it measures {{ratio}} against `{{background}}`, under the 4.5:1 floor for placeholders. Use `{{replacement}}` (Design.md §11).",
        ...aiTells.MESSAGES,
      },
    },
    create(context) {
      const listeners = baseRule.create(context);
      const originalJsxAttr =
        listeners["JSXAttribute[name.name=/^(className|class)$/]"];
      const report = (node, messageId, data) =>
        context.report({ node, messageId, data });
      // Same exemption the base palette rule applies, read from the same
      // constant so the two cannot drift. Without it this file reported every
      // entry in a swatch preset table as unreadable UI.
      const isDataFile = DATA_FILE_PATTERN.test(
        context.getFilename() || context.filename || "",
      );

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

      function reportContrast(strNode, text) {
        for (const m of text.matchAll(DARK_PLACEHOLDER_NEUTRAL)) {
          context.report({
            node: strNode,
            messageId: "contrastPlaceholder",
            data: { token: m[0] },
          });
        }
        for (const m of text.matchAll(DARK_TEXT_NEUTRAL)) {
          // Ignore if it is a placeholder variant (e.g. placeholder:text-neutral-600),
          // which is handled by contrastPlaceholder.
          if (/(?:placeholder:(?:text-)?|placeholder-)/.test(m[0])) continue;
          context.report({
            node: strNode,
            messageId: "contrastText",
            data: { token: m[0] },
          });
        }

        // Preset colours are data; existing named text floors still apply to
        // actual UI class strings even inside a preset module.
        if (!isDataFile) {
          for (const violation of contrastViolations(text)) {
            context.report({ node: strNode, ...violation });
          }
        }
      }

      return {
        ...listeners,
        "JSXAttribute[name.name=/^(className|class)$/]"(node) {
          if (originalJsxAttr) originalJsxAttr(node);

          const parts = classStrings(node);
          const haystack = parts.map(([, t]) => t).join(" ");
          for (const [strNode, text] of parts) {
            reportContrast(strNode, text);
            aiTells.checkClassText(report, strNode, text, haystack);
          }
        },

        // Class strings exported from a module are inherited by every consumer
        // but reach no JSXAttribute. Present each one to the base rule as a
        // synthetic className value: the base listener only reads `node.value`,
        // so this applies the identical radius/type/palette/flat/shadow/border
        // checks, and reports at the real literal.
        VariableDeclarator(node) {
          for (const [strNode, text] of constantStrings(node)) {
            if (!looksLikeStyleClassString(text)) continue;
            if (originalJsxAttr) {
              originalJsxAttr({ type: "JSXAttribute", value: strNode });
            }
            reportContrast(strNode, text);
            aiTells.checkClassText(report, strNode, text, text);
          }
        },

        ...aiTells.createIconTileListeners(report),
      };
    },
  };
}

const enhancedRule = wrapRuleWithContrast(designRule);

function createLinter(cwd) {
  return new ESLint({
    cwd,
    useEslintrc: false,
    extensions: [".js", ".jsx"],
    // ESLint 8's Node API takes plugin objects directly, so the rule needs no
    // package of its own and no --rulesdir (which cannot load a .cjs rule from
    // a "type": "module" project anyway).
    plugins: { design: { rules: { "design-system": enhancedRule } } },
    overrideConfig: {
      // The legacy config format still needs the plugin declared by name here,
      // even though the object itself is injected above.
      plugins: ["design"],
      env: { browser: true, es2022: true },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      rules: { [RULE_ID]: "error" },
    },
  });
}

/**
 * Lints a JSX snippet and returns only this rule's findings, as
 * `{ line, column, label, message }`. Messages from other rules are dropped:
 * a source file may carry `eslint-disable` comments naming rules from the main
 * config, which this narrow config reports as missing definitions.
 */
const LABEL = {
  radiusArbitrary: "radius",
  radiusUnknown: "radius",
  typeArbitrary: "type",
  typeNamed: "type",
  hue: "palette",
  hueBannedGray: "palette",
  hueSolid: "palette",
  hex: "palette",
  tintedGray: "palette",
  contrastText: "palette",
  contrastPlaceholder: "palette",
  contrastTextHex: "palette",
  contrastPlaceholderHex: "palette",
  flat: "flat",
  shadowScale: "shadow",
  shadowNamed: "shadow",
  shadowCard: "shadow",
  border: "border",
  emoji: "emoji",
  ...aiTells.LABEL,
};

async function lintCode(linter, code, filePath = "snippet.jsx") {
  const [result] = await linter.lintText(code, { filePath });
  return result.messages
    .filter((m) => m.ruleId === RULE_ID)
    .map((m) => ({
      line: m.line,
      column: m.column,
      label: LABEL[m.messageId] || "design",
      messageId: m.messageId,
      message: m.message,
    }));
}

module.exports = { createLinter, lintCode, RULE_ID, LABEL };
