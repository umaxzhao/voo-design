import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const hooks = vi.hoisted(() => ({ active: false, open: false, effects: [] }));
vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => hooks.active
      ? [hooks.open, (next) => { hooks.open = typeof next === "function" ? next(hooks.open) : next; }]
      : actual.useState(initial),
    useRef: (initial) => hooks.active ? { current: initial } : actual.useRef(initial),
    useEffect: (effect, deps) => hooks.active ? hooks.effects.push(effect) : actual.useEffect(effect, deps),
  };
});

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
      onToggleSnapToGrid={noop}
    >
      <EditorCanvasAids
        onToggleRulers={noop}
        onToggleGuides={noop}
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
    once('data-testid="editor-grid-menu-trigger"');
    once('lucide-grid-3x3');
    expect(html).not.toContain('data-testid="editor-toggle-snap-to-grid"');
    once('data-testid="editor-clear-guides"');
    once('aria-label="editor.zoomIn"');
    once('aria-label="editor.zoomFit"');
    once('aria-label="editor.zoomOut"');
    expect(html).toContain("58%");
  });

  it("opens grid options, toggles snap with Magnet, and selects grid sizes", () => {
    hooks.active = true;
    hooks.open = false;
    const toggleGrid = vi.fn();
    const toggleSnap = vi.fn();
    const setSize = vi.fn();
    const props = {
      zoom: 1, grid: null, snapToGrid: true, gridSize: 16,
      onZoomIn: noop, onZoomOut: noop, onFit: noop,
      onToggleGrid: toggleGrid, onToggleSnapToGrid: toggleSnap, onSetGridSize: setSize,
    };
    const flatten = (node) => !node || typeof node !== "object" ? [] :
      [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];
    const nodes = () => flatten(EditorZoom(props));
    const find = (id) => nodes().find((node) => node.props?.["data-testid"] === id);
    try {
      expect(find("editor-grid-menu")).toBeUndefined();
      nodes().find((node) => node.props?.["aria-label"] === "editor.view.grid").props.onClick();
      expect(toggleGrid).toHaveBeenCalledOnce();
      find("editor-grid-menu-trigger").props.onClick();
      expect(find("editor-grid-menu")).toBeDefined();
      expect(find("editor-grid-menu-snap").props["aria-checked"]).toBe(true);
      expect(renderToStaticMarkup(find("editor-grid-menu-snap"))).toContain("lucide-magnet");
      find("editor-grid-menu-snap").props.onClick();
      expect(toggleSnap).toHaveBeenCalledOnce();
      props.snapToGrid = false;
      expect(find("editor-grid-menu-snap").props["aria-checked"]).toBe(false);
      for (const size of [8, 16, 32, 64]) {
        hooks.open = true;
        find(`editor-grid-size-${size}`).props.onClick();
        expect(setSize).toHaveBeenLastCalledWith(size);
        expect(hooks.open).toBe(false);
      }
      const preventDefault = vi.fn();
      nodes().find((node) => node.props?.onContextMenu).props.onContextMenu({ preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(hooks.open).toBe(true);
      const listeners = {};
      vi.stubGlobal("document", {
        addEventListener: (type, handler) => { listeners[type] = handler; },
        removeEventListener: vi.fn(),
      });
      nodes();
      const cleanup = hooks.effects.at(-1)();
      listeners.keydown({ key: "Escape" });
      expect(hooks.open).toBe(false);
      hooks.open = true;
      listeners.pointerdown({ target: {} });
      expect(hooks.open).toBe(false);
      cleanup();
    } finally {
      hooks.active = false;
      hooks.effects = [];
      vi.unstubAllGlobals();
    }
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
    const gridEn = (await import("../../src/shared/i18n/rulers-en.js")).default;
    const gridZh = (await import("../../src/shared/i18n/rulers-zh.js")).default;
    for (const key of ["editor.grid.options", "editor.grid.size", "editor.snapping.toGrid"]) {
      expect(gridEn[key]).toBeTruthy();
      expect(gridZh[key]).toBeTruthy();
    }
    expect(en["editor.bottomBar.label"]).toBe("Canvas view controls");
    expect(zh["editor.bottomBar.label"]).toBe("画布视图控制");
  });
});
