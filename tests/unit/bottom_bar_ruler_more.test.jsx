import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Same hook harness as bottom_toolbar.test.jsx: lets the More menu open
// during a static render so its items can be inspected.
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

import { EditorZoom } from "../../src/canvas/components/editor_zoom.jsx";
import { EditorCanvasAids } from "../../src/canvas/components/editor_rulers.jsx";

const noop = () => {};
const RULER_TESTID = "editor-toggle-rulers";
const CLEAR_TESTID = "editor-clear-guides";
const TRASH_CLASS = /lucide-trash/;

const baseProps = {
  zoom: 1,
  canUndo: true,
  canRedo: true,
  onUndo: noop,
  onRedo: noop,
  onZoomIn: noop,
  onZoomOut: noop,
  onFit: noop,
  grid: null,
  onToggleGrid: noop,
  onToggleSnapToGrid: noop,
};

// The bar as image_editor.jsx mounts it: rulers in the More menu, guides eye
// as the only child.
const renderBar = (extra = {}) =>
  renderToStaticMarkup(
    <EditorZoom {...baseProps} rulersAvailable {...extra}>
      <EditorCanvasAids onToggleGuides={noop} t={(k) => k} />
    </EditorZoom>,
  );

const flatten = (node) => !node || typeof node !== "object" ? [] :
  [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];

// Calls the component as a function with the More menu forced open, so the
// returned element tree contains the menu items.
const openMenu = (props) => {
  hooks.active = true;
  hooks.open = true;
  try {
    return EditorZoom(props);
  } finally {
    hooks.active = false;
    hooks.open = false;
  }
};

describe("bottom bar: clear-guides lives in the More menu", () => {
  it("is not rendered as a bar button with the menu closed", () => {
    const html = renderBar();
    expect(html).not.toContain(`data-testid="${CLEAR_TESTID}"`);
    expect(html).not.toMatch(TRASH_CLASS);
    // The guides eye stays in the bar.
    expect(html).toContain('data-testid="editor-toggle-guides"');
  });

  it("is a menu item directly after the ruler item, not a top-level bar child", () => {
    const root = openMenu({ ...baseProps, rulersAvailable: true, canClearGuides: true, onClearGuides: noop });
    const topLevel = React.Children.toArray(root.props.children);
    expect(topLevel.some((node) => node.props?.["data-testid"] === CLEAR_TESTID)).toBe(false);
    const menu = flatten(root).find((node) => node.props?.["data-testid"] === "editor-more-menu");
    const items = flatten(menu).filter((node) => /^menuitem/.test(node.props?.role ?? ""));
    const rulerIndex = items.findIndex((node) => node.props["data-testid"] === RULER_TESTID);
    const clearIndex = items.findIndex((node) => node.props["data-testid"] === CLEAR_TESTID);
    expect(rulerIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBe(rulerIndex + 1);
    expect(items[clearIndex].props.role).toBe("menuitem");
    expect(items[clearIndex].props["aria-label"]).toBe("editor.guides.clearAll");
    expect(items[clearIndex].props.disabled).toBe(false);
  });

  it("is disabled in the menu when there are no guides to clear", () => {
    const root = openMenu({ ...baseProps, rulersAvailable: true, canClearGuides: false, onClearGuides: noop });
    const clear = flatten(root).find((node) => node.props?.["data-testid"] === CLEAR_TESTID);
    expect(clear).toBeDefined();
    expect(clear.props.disabled).toBe(true);
  });

  it("calls onClearGuides when the menu item is selected", () => {
    const clear = vi.fn();
    const root = openMenu({ ...baseProps, rulersAvailable: true, canClearGuides: true, onClearGuides: clear });
    flatten(root).find((node) => node.props?.["data-testid"] === CLEAR_TESTID).props.onClick();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("keeps the clear-guides command wired for the command palette", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/canvas/components/image_editor.jsx"), "utf8",
    );
    expect(src).toContain('id: "clear-guides"');
    expect(src).toContain("run: handleClearGuides");
  });
});

describe("bottom bar: ruler toggle lives in the More menu", () => {
  it("is not a top-level child of the bar", () => {
    const root = openMenu({ ...baseProps, rulersAvailable: true, onToggleRulers: noop });
    const topLevel = React.Children.toArray(root.props.children);
    expect(topLevel.some((node) => node.props?.["data-testid"] === RULER_TESTID)).toBe(false);
    expect(renderBar()).not.toContain(`data-testid="${RULER_TESTID}"`);
  });

  it("is a menu item inside the More menu, under the zoom group", () => {
    const root = openMenu({ ...baseProps, rulersAvailable: true, onToggleRulers: noop });
    const nodes = flatten(root);
    const menu = nodes.find((node) => node.props?.["data-testid"] === "editor-more-menu");
    expect(menu).toBeDefined();
    const inMenu = flatten(menu).find((node) => node.props?.["data-testid"] === RULER_TESTID);
    expect(inMenu).toBeDefined();
    expect(inMenu.props.role).toBe("menuitemcheckbox");
    expect(inMenu.props["aria-label"]).toBe("editor.rulers.toggle");
    expect(inMenu.props.title).toBe("editor.rulers.toggle");
    const zoomGroup = nodes.find((node) => node.props?.children === "editor.menu.groupZoom");
    expect(zoomGroup).toBeDefined();
  });

  it("is absent from the menu when rulers are not available for the focused page", () => {
    const root = openMenu({ ...baseProps, rulersAvailable: false, onToggleRulers: noop });
    const nodes = flatten(root);
    expect(nodes.find((node) => node.props?.["data-testid"] === RULER_TESTID)).toBeUndefined();
    expect(nodes.find((node) => node.props?.["data-testid"] === "editor-more-menu")).toBeDefined();
  });
});

describe("bottom bar: selecting the ruler item toggles rulers", () => {
  it("calls onToggleRulers and reflects the on/off state like the other menu items", () => {
    const toggle = vi.fn();
    const props = { ...baseProps, rulersAvailable: true, showRulers: false, onToggleRulers: toggle };
    const find = () => flatten(openMenu(props)).find((node) => node.props?.["data-testid"] === RULER_TESTID);

    const off = find();
    expect(off.props["aria-checked"]).toBe(false);
    off.props.onClick();
    expect(toggle).toHaveBeenCalledOnce();

    props.showRulers = true;
    const on = find();
    expect(on.props["aria-checked"]).toBe(true);
    const html = renderToStaticMarkup(on);
    expect(html).toContain("lucide-ruler");
    expect(html).toContain("✓");
    expect(html).toContain(">editor.rulers.toggle<");
  });

  it("keeps the Shift+R command wired to the same toggle", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/canvas/components/image_editor.jsx"), "utf8",
    );
    expect(src).toContain('id: "toggle-rulers"');
    expect(src).toContain('labelKey: "editor.rulers.toggle"');
    expect(src).toContain("run: toggleRulers");
  });

  it("image_editor wires the More-menu ruler and clear-guides items, not the bar aids", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/canvas/components/image_editor.jsx"), "utf8",
    );
    const bar = src.slice(src.indexOf("<EditorZoom"), src.indexOf("</EditorZoom>"));
    expect(bar).toContain("onToggleRulers={toggleRulers}");
    expect(bar).toContain("rulersAvailable={rulersVisible}");
    expect(bar).toContain("onClearGuides={handleClearGuides}");
    expect(bar).toContain("canClearGuides={documentGuides.length > 0}");
    expect(bar).toContain("<EditorCanvasAids");
    const aids = bar.slice(bar.indexOf("<EditorCanvasAids"));
    expect(aids).not.toContain("onClearGuides");
    expect(aids).not.toContain("canClearGuides");
  });
});
