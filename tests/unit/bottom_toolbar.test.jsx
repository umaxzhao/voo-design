import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en" }),
}));

import { EditorZoom } from "../../src/canvas/components/editor_toolbar.jsx";
import { EditorCanvasAids } from "../../src/canvas/components/editor_rulers.jsx";

const noop = () => {};
const render = () =>
  renderToStaticMarkup(
    <EditorZoom
      zoom={0.58}
      canUndo
      canRedo
      onUndo={noop}
      onRedo={noop}
      onZoomIn={noop}
      onZoomOut={noop}
      onFit={noop}
      grid={null}
      onToggleGrid={noop}
    >
      <EditorCanvasAids
        onToggleRulers={noop}
        onToggleGuides={noop}
        onToggleSnapToGrid={noop}
        onClearGuides={noop}
        t={(k) => k}
      />
    </EditorZoom>,
  );

describe("single bottom toolbar", () => {
  it("renders exactly one viewport-tools bar", () => {
    const html = render();
    expect(html.match(/viewport-tools/g)).toHaveLength(1);
    expect(html).not.toContain("calc(50% + 132px)");
    expect(html).toContain('data-testid="editor-bottom-toolbar"');
  });

  it("contains every unique control exactly once", () => {
    const html = render();
    const once = (needle) =>
      expect(html.split(needle).length - 1, needle).toBe(1);
    once('aria-label="editor.undo"');
    once('aria-label="editor.redo"');
    once('aria-label="editor.view.grid"');
    once('data-testid="editor-toggle-rulers"');
    once('data-testid="editor-toggle-guides"');
    once('data-testid="editor-toggle-snap-to-grid"');
    once('data-testid="editor-clear-guides"');
    once('aria-label="editor.zoomIn"');
    once('aria-label="editor.zoomFit"');
    once('aria-label="editor.zoomOut"');
    expect(html).toContain("58%");
  });

  it("image_editor mounts canvas aids inside the zoom bar, not beside it", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/canvas/components/image_editor.jsx"),
      "utf8",
    );
    expect(src.match(/<EditorZoom\b/g)).toHaveLength(1);
    expect(src.match(/<EditorCanvasAids\b/g)).toHaveLength(1);
    const open = src.indexOf("<EditorZoom");
    const close = src.indexOf("</EditorZoom>");
    const aids = src.indexOf("<EditorCanvasAids");
    expect(aids).toBeGreaterThan(open);
    expect(aids).toBeLessThan(close);
  });

  it("has zh/en labels for the bar", async () => {
    const en = (await import("../../src/shared/i18n/ux-en.js")).default;
    const zh = (await import("../../src/shared/i18n/ux-zh.js")).default;
    expect(en["editor.bottomBar.label"]).toBe("Canvas view controls");
    expect(zh["editor.bottomBar.label"]).toBe("画布视图控制");
  });
});
