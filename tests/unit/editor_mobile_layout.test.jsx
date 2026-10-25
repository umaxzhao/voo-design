import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { subscribeToNarrowViewport } from "../../src/canvas/use_is_narrow.js";

describe("mobile editor layout", () => {
  it("updates the narrow hook when matchMedia changes", () => {
    let matches = false;
    const listeners = new Set();
    const media = {
      get matches() { return matches; },
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    const values = [];
    const unsubscribe = subscribeToNarrowViewport((value) => values.push(value), media);
    expect(values).toEqual([false]);
    matches = true;
    listeners.forEach((listener) => listener({ matches }));
    expect(values).toEqual([false, true]);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("docks both panels in equal bottom halves and reserves the upper 55% for canvas", async () => {
    const css = readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8");
    expect(css).toContain("max-width: 768px");
    expect(css).toContain("height: 55%");
    expect(css).toContain("height: 81.818%");
    expect(css).toContain("width: 50%");
    expect(css).toContain('data-testid="editor-layers-panel"');
    expect(css).toContain('data-testid="editor-properties-panel"');
  });

  it("keeps desktop panels floating and places the narrow agent button above them", async () => {
    const css = readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8");
    expect(css).toContain("bottom: calc(45% + 1rem)");
    const app = await import("../../src/App.jsx?raw");
    expect(app.default).toContain('className="voo-ai-fab absolute bottom-4 right-4');
    const properties = await import("../../src/canvas/components/editor_properties/index.jsx?raw");
    const layers = await import("../../src/canvas/components/editor_layers.jsx?raw");
    expect(properties.default).toContain("absolute ${sideClass} top-1/2");
    expect(layers.default).toContain("absolute ${sideClass} top-1/2");
  });
});
