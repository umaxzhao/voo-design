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

  it("uses the desktop visibility signal to expand layers when properties are absent", async () => {
    const css = (readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8") + readFileSync("src/canvas/components/editor_compact_layout.css", "utf8")).replace(/\s+/g, " ");
    expect(css).toContain("max-width: 768px");
    expect(css).toContain("height: 55%");
    expect(css).toContain("height: calc(81.818% - var(--editor-mobile-panel-gap))");
    expect(css).toContain('data-properties-open="true"');
    expect(css).toContain("width: calc(100% - 2 * var(--editor-mobile-panel-gap))");
    expect(css).toContain("width: calc((100% - 3 * var(--editor-mobile-panel-gap)) * 8 / 17)");
    expect(css).toContain("width: calc((100% - 3 * var(--editor-mobile-panel-gap)) * 9 / 17)");
    expect(css).toContain("right: var(--editor-mobile-panel-gap)");
    expect(css).toContain("--editor-mobile-panel-gap: 0.375rem");
    expect(css).toContain("border-radius: 1rem");
    expect(css).toContain("transition: width 180ms ease, left 180ms ease, opacity 180ms ease");
    // Each mobile panel can collapse to a 3.5rem header independently.
    expect(css).toContain('[data-mobile-layers-expanded="false"] [data-testid="editor-layers-panel"]');
    expect(css).toContain('[data-mobile-properties-expanded="false"] [data-testid="editor-properties-panel"]');
    // A 48px target plus header padding needs a 72px collapsed dock.
    expect(css).toContain("height: 4.5rem");
    expect(css).toContain('[data-testid="editor-layers-tabs"]');
    expect(css).toContain('data-testid="editor-layers-panel"');
    expect(css).toContain('data-testid="editor-properties-panel"');
    const editor = await import("../../src/canvas/components/image_editor.jsx?raw");
    expect(editor.default).toContain("data-properties-open={propertiesOpen ? \"true\" : \"false\"}");
    expect(editor.default).toContain("backgroundSelected");
  });

  it("keeps title actions outside the horizontally scrollable tab strip on narrow screens", async () => {
    const titleBar = await import("../../src/app_title_bar.jsx?raw");
    const css = readFileSync("src/index.css", "utf8");
    expect(titleBar.default).toContain('data-testid="editor-top-bar-actions"');
    expect(titleBar.default).toContain('data-testid="editor-top-bar"');
    expect(css).toContain(".app-title-tabs {");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain(".app-title-actions {");
    expect(css).toContain(".app-title-brand-row {");
  });

  it("docks the bottom toolbar above the bottom panels only on narrow screens", () => {
    const css = (readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8") + readFileSync("src/canvas/components/editor_compact_layout.css", "utf8")).replace(/\s+/g, " ");
    expect(css).toContain("--editor-mobile-zoom-bottom: calc(45% + 0.25rem)");
    expect(css).toContain("bottom: var(--editor-mobile-zoom-bottom)");
    expect(css).toContain('[data-testid="design-editor"].editor-narrow .viewport-tools');
  });

  it("keeps the desktop panel rules outside narrow media styling", () => {
    const css = (readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8") + readFileSync("src/canvas/components/editor_compact_layout.css", "utf8")).replace(/\s+/g, " ");
    const desktopRules = css.slice(0, css.indexOf("@media (max-width: 768px)"));
    expect(desktopRules).not.toContain('[data-testid="editor-layers-panel"]');
    expect(desktopRules).not.toContain('[data-testid="editor-properties-panel"]');
    expect(css).not.toContain("@media (min-width");
  });

  it("keeps desktop panels floating and places the narrow agent button above them", async () => {
    const css = (readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8") + readFileSync("src/canvas/components/editor_compact_layout.css", "utf8")).replace(/\s+/g, " ");
    expect(css).toMatch(/\.voo-ai-fab(?:\.absolute)?\s*\{[^}]*top: calc\(55% - 3rem\)/);
    const app = await import("../../src/App.jsx?raw");
    expect(app.default).toContain('className="voo-ai-fab absolute bottom-4 right-4');
    const properties = await import("../../src/canvas/components/editor_properties/index.jsx?raw");
    const layers = await import("../../src/canvas/components/editor_layers.jsx?raw");
    expect(properties.default).toContain("absolute ${sideClass} top-1/2");
    expect(layers.default).toContain("absolute ${sideClass} top-1/2");
  });
});
