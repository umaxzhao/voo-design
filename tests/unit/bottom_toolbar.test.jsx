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
      props.grid = { enabled: false, size: 16 };
      expect(nodes().find((node) => node.props?.["aria-label"] === "editor.view.grid").props["aria-pressed"]).toBe(false);
      props.grid = { enabled: true, size: 16 };
      expect(nodes().find((node) => node.props?.["aria-label"] === "editor.view.grid").props["aria-pressed"]).toBe(true);
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
      const menu = find("editor-grid-menu");
      const items = Array.from({ length: 5 }, () => ({ focus: vi.fn() }));
      menu.ref.current = { querySelector: () => items[0] };
      const cleanup = hooks.effects.at(-1)();
      expect(items[0].focus).toHaveBeenCalledOnce();
      const navigate = (key, index, expected) => {
        const preventDefault = vi.fn();
        menu.props.onKeyDown({
          key, target: items[index], preventDefault,
          currentTarget: { querySelectorAll: () => items },
        });
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(items[expected].focus).toHaveBeenCalled();
        items.forEach((item) => item.focus.mockClear());
      };
      navigate("ArrowDown", 0, 1);
      navigate("ArrowUp", 1, 0);
      navigate("ArrowUp", 0, 4);
      navigate("ArrowDown", 4, 0);
      navigate("End", 0, 4);
      navigate("Home", 4, 0);
      expect(find("editor-grid-menu-trigger").props.className).toContain("h-7 w-5");
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

  it("preserves the last grid size and snap setting through visibility toggles", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/canvas/components/image_editor.jsx"), "utf8",
    );
    // Exercise the actual editor callbacks without mounting its canvas engines.
    const callback = (name, context) => {
      const body = src.split(`${name}={`)[1].split("\n              }}")[0];
      return new Function(...Object.keys(context), `return (${body}});`)(...Object.values(context));
    };
    for (const multi of [false, true]) {
      const lastGridSizeRef = { current: 32 };
      let grid = null;
      const engine = { setGrid: vi.fn((next) => { grid = next; }) };
      let snapToGrid = true;
      const context = () => ({ lastGridSizeRef, grid, multi, engine,
        enginesRef: { current: new Map([["canvas", { engine }]]) }, bump: noop,
        setSnapToGrid: (next) => { snapToGrid = next; } });
      const select = callback("onSetGridSize", context());
      select(64);
      expect(grid.size).toBe(64);
      for (let i = 0; i < 2; i++) {
        callback("onToggleGrid", context())();
        expect(grid).toEqual({ enabled: false, size: 64 });
        expect(lastGridSizeRef.current).toBe(64);
        callback("onToggleGrid", context())();
        expect(grid).toEqual({ enabled: true, size: 64 });
      }
      expect(snapToGrid).toBe(true);
      expect(src).toContain("gridSize={grid?.size ?? lastGridSizeRef.current}");
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
    for (const key of ["editor.grid.options", "editor.grid.size", "editor.grid.sizeLabel", "editor.snapping.toGrid"]) {
      expect(gridEn[key]).toBeTruthy();
      expect(gridZh[key]).toBeTruthy();
    }
    expect(en["editor.bottomBar.label"]).toBe("Canvas view controls");
    expect(zh["editor.bottomBar.label"]).toBe("画布视图控制");
  });
});
