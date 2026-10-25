// Polyfill window & Element for Node environment (must precede imports)
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import PropertiesPanelShell from "../../src/canvas/components/editor_properties/properties_panel_shell.jsx";
import {
  DOCKED_PANEL_MAX_HEIGHT_CLASS,
  LAYERS_PANEL_MAX_HEIGHT_CLASS,
  PROPERTIES_PANEL_MAX_HEIGHT_CLASS,
} from "../../src/canvas/components/editor_panel_clearance.js";

const CAPS = [
  PROPERTIES_PANEL_MAX_HEIGHT_CLASS,
  LAYERS_PANEL_MAX_HEIGHT_CLASS,
  DOCKED_PANEL_MAX_HEIGHT_CLASS,
];

/** The "NNrem" clearance a cap leaves above the stage bottom, doubled by centring. */
function capRem(cap) {
  const match = cap.match(/calc\(100%-(\d+(?:\.\d+)?)rem\)/);
  return match ? Number(match[1]) : NaN;
}

describe("agent button clearance for the side panels", () => {
  it("every cap leaves room for the button (offset + size + gap), top and bottom", () => {
    const app = readFileSync("src/App.jsx", "utf8");
    const fab = app.match(/className="voo-ai-fab[^"]*"/)?.[0] ?? "";
    // Tailwind spacing unit: 1 step = 0.25rem.
    const offsetRem = Number(fab.match(/\bbottom-(\d+)\b/)?.[1]) * 0.25;
    const sizeRem = Number(fab.match(/\bsize-(\d+)\b/)?.[1]) * 0.25;
    expect(offsetRem).toBeGreaterThan(0);
    expect(sizeRem).toBeGreaterThan(0);
    for (const cap of CAPS) {
      // Panels are centred, so the cap removes the clearance from both ends.
      const clearanceEachSide = capRem(cap) / 2;
      expect(clearanceEachSide).toBeGreaterThan(offsetRem + sizeRem);
    }
  });

  it("compiles to a real max-height rule in Tailwind", async () => {
    const result = await postcss([
      tailwindcss({ content: [{ raw: CAPS.join(" ") }], corePlugins: { preflight: false } }),
    ]).process("@tailwind utilities;", { from: undefined });
    expect(result.css).toContain("max-height: min(85vh, calc(100% - 9rem))");
    expect(result.css).toContain("max-height: min(75%, calc(100% - 9rem))");
    expect(result.css).toContain("max-height: calc(100% - 9rem)");
  });

  it("applies the cap to the properties panel on either side", () => {
    for (const swapSide of [false, true]) {
      const html = renderToStaticMarkup(
        <EditorProperties isBackground backgroundColor="#000000" swapSide={swapSide} />,
      );
      expect(html).toContain('data-testid="editor-properties-panel"');
      expect(html).toContain(PROPERTIES_PANEL_MAX_HEIGHT_CLASS);
      expect(html).toContain(swapSide ? "left-4" : "right-4");
      // The old viewport-only cap must not come back on the panel or its body.
      expect(html).not.toMatch(/(?<!min\()85vh/);
    }
  });

  it("applies the cap to the 3D and Motion inspector shell, with a shrinkable body", () => {
    const html = renderToStaticMarkup(
      <PropertiesPanelShell testId="inspector" swapSide>
        <p>body</p>
      </PropertiesPanelShell>,
    );
    expect(html).toContain(DOCKED_PANEL_MAX_HEIGHT_CLASS);
    expect(html).toContain("min-h-0");
  });

  it("renders no panel without a selection, so the button has nothing to cover", () => {
    expect(renderToStaticMarkup(<EditorProperties />)).toBe("");
  });

  it("keeps the layers panel on the shared cap", () => {
    const layers = readFileSync("src/canvas/components/editor_layers.jsx", "utf8");
    expect(layers).toContain("${LAYERS_PANEL_MAX_HEIGHT_CLASS}");
    expect(layers).not.toContain("max-h-[75%]");
  });
});
