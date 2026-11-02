import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { STRUCTURAL_CSS } = require("../../design/structural-lines.cjs");

/**
 * Inspect actual interface paint. Three classes are kept apart:
 * - decorative: any painted border or ring on a control or surface (a failure);
 * - structural: the outer frame and registered module dividers (must exist);
 * - artwork / guides / focus are excluded by `[data-ui-guide]` and `:focus-visible`.
 *
 * Returns the decorative findings, for the existing `assert.deepEqual` gates.
 */
export async function scanUiBorders(page) {
  return (await scanBorders(page)).decorative;
}

/** Full classification, including measured structural lines. */
export async function scanBorders(page) {
  const registry = STRUCTURAL_CSS.map((entry) => ({
    selector: entry.selector,
    role: entry.role,
  }));
  return page.evaluate((registryEntries) => {
    const decorative = [];
    const structural = [];
    const CONTROL_ROLES = new Set([
      "button", "checkbox", "combobox", "dialog", "listbox", "menu",
      "menuitem", "option", "radio", "slider", "switch", "tab", "textbox",
    ]);
    const alpha = (color) =>
      color !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(color);
    const isControl = (el) =>
      el.matches("button, input, select, textarea, a") ||
      CONTROL_ROLES.has(el.getAttribute("role"));
    const matchesRegistry = (el) =>
      registryEntries.find((entry) => {
        try {
          return el.matches(entry.selector);
        } catch {
          return false;
        }
      });
    for (const el of document.querySelectorAll("body *")) {
      if (
        !(el instanceof HTMLElement) ||
        el.closest(
          '[data-ui-guide], [data-testid="editor-pages"], [data-editor-artboard]',
        )
      )
        continue;
      const rect = el.getBoundingClientRect();
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      )
        continue;
      const style = getComputedStyle(el);
      if (
        style.visibility !== "visible" ||
        style.display === "none" ||
        Number(style.opacity) === 0 ||
        el.closest("[inert], [hidden]")
      )
        continue;
      const sides = ["Top", "Right", "Bottom", "Left"].filter(
        (side) =>
          parseFloat(style[`border${side}Width`]) > 0 &&
          !["none", "hidden"].includes(style[`border${side}Style`]) &&
          alpha(style[`border${side}Color`]),
      );
      const ring = style.boxShadow;
      const hasRing =
        !el.matches(":focus-visible") &&
        /\s0px\s0px\s0px\s[1-9][\d.]*px/.test(ring) &&
        !/rgba\(0, 0, 0, 0\)/.test(ring);
      if (!sides.length && !hasRing) continue;
      const describe = (kind) => ({
        kind,
        tag: el.tagName,
        id: el.getAttribute("data-testid"),
        label: el.getAttribute("aria-label"),
        marker: el.getAttribute("data-ui-structure"),
        classes: String(el.className).slice(0, 160),
        registryRole: matchesRegistry(el)?.role ?? null,
        rect: [rect.x, rect.y, rect.width, rect.height].map((v) => Math.round(v)),
        sides: sides.map((side) => ({
          side,
          width: style[`border${side}Width`],
          style: style[`border${side}Style`],
          color: style[`border${side}Color`],
        })),
        ring: hasRing ? ring : undefined,
      });
      const isFrame = el.getAttribute("data-ui-structure") === "frame";
      const isDivider =
        el.getAttribute("data-ui-structure") === "divider" &&
        !isControl(el) &&
        sides.length <= 2;
      const isRegistered = Boolean(matchesRegistry(el)) && !isControl(el);
      if (!hasRing && (isFrame || isDivider || isRegistered)) {
        structural.push(describe(isFrame ? "frame" : "divider"));
      } else {
        decorative.push({
          tag: el.tagName,
          id: el.getAttribute("data-testid"),
          label: el.getAttribute("aria-label"),
          classes: el.className,
          sides,
          ring: hasRing ? ring : undefined,
        });
      }
    }
    return { decorative, structural };
  }, registry);
}
