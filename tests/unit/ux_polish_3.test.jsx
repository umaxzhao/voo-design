import React from "react";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Force the "More actions" menu open without a DOM, as bottom_toolbar.test does.
const hooks = vi.hoisted(() => ({ active: false }));
vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => (hooks.active ? [true, () => {}] : actual.useState(initial)),
    useRef: (initial) => (hooks.active ? { current: initial } : actual.useRef(initial)),
    useEffect: (effect, deps) => (hooks.active ? undefined : actual.useEffect(effect, deps)),
  };
});
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en" }),
}));

import { EditorZoom } from "../../src/canvas/components/editor_toolbar.jsx";
import ScrubField from "../../src/canvas/components/scrub_field.jsx";
import EditorCanvasTreeRow from "../../src/canvas/components/editor_canvas_tree_row.jsx";

const MINT = "bg-[#a7ffd4]";
const PURPLE = /E5B2FF|eed0ff|purple|violet/i;
const read = (path) => readFileSync(path, "utf8");
const noop = () => {};

describe("scrub field suffix contrast", () => {
  it("uses neutral-400 (>= 4.5:1), not neutral-500", () => {
    const html = renderToStaticMarkup(
      <ScrubField suffix="%" value={50} min={0} max={100} onValueChange={noop} ariaLabel="Opacity" />,
    );
    const tag = html.match(/<span[^>]*>%<\/span>/)?.[0] ?? "";
    expect(tag).toContain("text-neutral-400");
    expect(tag).not.toContain("text-neutral-500");
  });
});

describe("zoom-to-fit menu item", () => {
  it("renders the label and the shortcut as separate elements, under group labels", () => {
    hooks.active = true;
    try {
      const html = renderToStaticMarkup(
        <EditorZoom zoom={1} onZoomIn={noop} onZoomOut={noop} onFit={noop} grid={null} />,
      );
      const item = html.match(/<button[^>]*data-testid="editor-fit-btn"[\s\S]*?<\/button>/)?.[0] ?? "";
      expect(item).toContain("editor.zoomFit.label</span>");
      expect(item).toMatch(/data-testid="editor-fit-shortcut"[^>]*>editor\.zoomFit\.shortcut</);
      expect(item).not.toMatch(/Shift\+1/);
      expect(html).toContain("editor.menu.groupZoom");
      expect(html).toContain("editor.menu.groupGrid");
    } finally {
      hooks.active = false;
    }
  });
});

describe("layer name button hit area", () => {
  it("stretches to the full row height", () => {
    const html = renderToStaticMarkup(
      <EditorCanvasTreeRow page={{ id: "p1", title: "Page", type: "design" }} t={(k) => k} />,
    );
    const tag = html.match(/<button[^>]*data-testid="editor-canvas-layer"[^>]*>/)?.[0] ?? "";
    expect(tag).toMatch(/class="[^"]*\bself-stretch\b/);
  });
});
