import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import EditorPage from "../../src/canvas/components/editor_page.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: key => key, locale: "en", toggleLocale: () => {} }),
}));

function pageCallbacks() {
  return Object.fromEntries([
    "onFocus", "onEngine", "onBeforeDispose", "onChange",
    "onGeneratedOutput", "onVisibility",
  ].map(name => [name, vi.fn()]));
}

describe("EditorPage markup contracts", () => {
  it("M3.1: omits per-artboard DOM canvases in free mode", () => {
    const callbacks = pageCallbacks();
    const artboardIds = ["artboard_1", "artboard_2", "artboard_3"];
    const htmlOutputs = artboardIds.map((id, index) => renderToStaticMarkup(
      <EditorPage
        nodeId={id}
        title={`Artboard ${index + 1}`}
        index={index}
        focused={index === 0}
        active
        mode="free"
        rect={{ x: index * 1200, y: 0, width: 1024, height: 768 }}
        sharedZoom={1}
        {...callbacks}
      />,
    ));
    htmlOutputs.forEach(html => {
      expect(html).not.toContain('data-testid="editor-2d-canvas"');
      expect(html).not.toContain('data-testid="skia-canvas"');
    });
    // SSR checks markup only. Lifecycle callbacks are exercised by the browser suite.
    Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled());
  });

  it("M3.2: retains the full-mode DOM canvas fallback", () => {
    const callbacks = pageCallbacks();
    const html = renderToStaticMarkup(
      <EditorPage
        nodeId="single_page_1"
        title="Page 1"
        index={0}
        focused
        active
        mode="full"
        {...callbacks}
      />,
    );
    expect(html).toContain('data-testid="editor-2d-canvas"');
    Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled());
  });

  it("M3.3: declares the unified workspace canvas in image_editor JSX", () => {
    // Importing the entire editor to check typeof verified no canvas behavior
    // and made a structural check depend on the first module transform time.
    const source = readFileSync(
      new URL("../../src/canvas/components/image_editor.jsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/<canvas\b[^>]*data-testid="workspace-skia-canvas"/);
  });
});
