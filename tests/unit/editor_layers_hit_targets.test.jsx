import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import EditorLayers from "../../src/canvas/components/editor_layers.jsx";

vi.mock("../../src/canvas/components/use_layer_drag.js", () => ({
  default: () => ({ overId: null, dragId: null, slot: null, beginRowDrag: vi.fn() }),
}));

const MIN_HIT_PX = 28;
const TAILWIND_UNIT_PX = 4;

/** Finds the opening tag of the button carrying the given aria-label. */
function findButtonTag(html, labelPattern) {
  const tags = html.match(/<button\b[^>]*>/g) ?? [];
  return tags.find((tag) => labelPattern.test(tag.match(/aria-label="([^"]*)"/)?.[1] ?? ""));
}

/** Reads a Tailwind spacing size class (h-7 -> 28) from a class string. */
function sizeOf(tag, axis) {
  const match = tag.match(new RegExp(`class="[^"]*\\b${axis}-(\\d+(?:\\.\\d+)?)\\b`));
  return match ? Number(match[1]) * TAILWIND_UNIT_PX : 0;
}

describe("layers panel hit targets", () => {
  const html = renderToStaticMarkup(
    createElement(EditorLayers, {
      objects: [{ id: "layer", kind: "rect", name: "Layer" }],
      selectedIds: [],
      onSelect: vi.fn(),
      onToggleSelect: vi.fn(),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
    }),
  );

  it("search toggle is at least 28x28 even though its icon stays 13px", () => {
    const tag = findButtonTag(html, /^editor\.layers\.searchToggle$|Toggle layer search|切换图层搜索/);
    expect(tag).toBeDefined();
    expect(sizeOf(tag, "h")).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(sizeOf(tag, "w")).toBeGreaterThanOrEqual(MIN_HIT_PX);
  });

  it("footer icon buttons are at least 28x28", () => {
    const tag = findButtonTag(html, /^editor\.layer\.new$/);
    expect(tag).toBeDefined();
    expect(sizeOf(tag, "h")).toBeGreaterThanOrEqual(MIN_HIT_PX);
  });
});

describe("keyboard focus indicator", () => {
  const css = readFileSync("src/index.css", "utf8");
  const rule = css.match(/^\s*:focus-visible\s*\{([^}]*)\}/m)?.[1] ?? "";

  it("draws a visible outline for :focus-visible only", () => {
    expect(rule).toMatch(/outline:\s*\d+px solid/);
    expect(rule).not.toMatch(/outline:\s*none/);
    // The reset must stay scoped to pointer focus so a mouse click shows no ring.
    expect(css).toMatch(/\*:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none/);
  });
});
