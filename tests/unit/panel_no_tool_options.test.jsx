// The properties panel no longer repeats the tool family modes (brush modes,
// marquee / lasso shapes, healing, pen, shapes, fill, select). Every one of
// those choices is listed by a dropdown on the matching top-toolbar button.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Hook harness: while `active`, useState/useRef/useEffect run against plain
// slots so the open dropdown can be inspected without a DOM.
const hooks = vi.hoisted(() => ({ active: false, slots: [], cursor: 0 }));

vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], () => {}];
    },
    useRef: (initial) =>
      hooks.active ? { current: initial } : actual.useRef(initial),
    useEffect: (effect, deps) =>
      hooks.active ? undefined : actual.useEffect(effect, deps),
  };
});

// The portal is identity here so the dropdown stays in the element tree.
vi.mock("react-dom", async (original) => {
  const actual = await original();
  return { ...actual, createPortal: (children) => children };
});

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import EditorBrushMenu from "../../src/canvas/components/editor_brush_menu.jsx";
import EditorFamilyMenu from "../../src/canvas/components/editor_family_menu.jsx";
import EditorFillMenu from "../../src/canvas/components/editor_fill_menu.jsx";
import EditorHealingMenu from "../../src/canvas/components/editor_healing_menu.jsx";
import EditorMarqueeMenu from "../../src/canvas/components/editor_marquee_menu.jsx";
import EditorPenMenu from "../../src/canvas/components/editor_pen_menu.jsx";
import ShapeToolsMenu from "../../src/canvas/components/editor_shape_menu.jsx";
import EditorToolbar from "../../src/canvas/components/editor_toolbar.jsx";
import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const noop = () => {};
const engine = {
  getDocument: () => ({ nodes: [], modifiers: [] }),
  subscribeRender: () => () => {},
  setTool: noop,
};
const rect = { id: "r1", kind: "rect", x: 0, y: 0, width: 40, height: 40, fill: "#ff0000" };
const toolProps = {
  onTool: noop,
  marqueeMode: "rect",
  brushMode: "normal",
  healingMode: "aiRepair",
  onMarqueeMode: noop,
  onBrushMode: noop,
  onHealingMode: noop,
  color: "#00ffcc",
  onColor: noop,
  brushWidth: 24,
  onBrushWidth: noop,
  brushHardness: 0.5,
  onBrushHardness: noop,
  brushOpacity: 1,
  onBrushOpacity: noop,
};

// Each family tool and a marquee mode to render it with.
const PANEL_CASES = [
  ["brush", TOOL.BRUSH, "rect"],
  ["marquee", TOOL.MARQUEE, "ellipse"],
  ["marquee polygon", TOOL.MARQUEE, "poly"],
  ["lasso", TOOL.LASSO, "rect"],
  ["healing", TOOL.HEALING, "rect"],
  ["pen", TOOL.PEN, "rect"],
  ["curvature pen", TOOL.CURVATURE_PEN, "rect"],
  ["free pen", TOOL.FREE_PEN, "rect"],
  ["rect", TOOL.RECT, "rect"],
  ["ellipse", TOOL.ELLIPSE, "rect"],
  ["arrow", TOOL.ARROW, "rect"],
  ["fill", TOOL.FILL, "rect"],
  ["gradient", TOOL.GRADIENT, "rect"],
  ["select", TOOL.SELECT, "rect"],
  ["distort", TOOL.DISTORT, "rect"],
  ["perspective", TOOL.PERSPECTIVE, "rect"],
  ["puppet", TOOL.PUPPET_WARP, "rect"],
];

describe("properties panel has no tool family mode buttons", () => {
  it.each(PANEL_CASES)("%s", (_name, tool, marqueeMode) => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={tool}
        toolProps={{ ...toolProps, marqueeMode }}
        object={rect}
        engine={engine}
      />,
    );
    expect(html).not.toContain("tool-family-mode-");
  });

  it("renders no family mode buttons with a selected layer or without one", () => {
    for (const object of [rect, null]) {
      const html = renderToStaticMarkup(
        <EditorProperties
          tool={TOOL.BRUSH}
          toolProps={toolProps}
          object={object}
          engine={engine}
        />,
      );
      expect(html).not.toContain("tool-family-mode-");
    }
  });
});

/** Items an open dropdown renders, as `[testid, label key]` pairs. */
function openMenuItems(element) {
  hooks.active = true;
  hooks.cursor = 0;
  hooks.slots = [true, { top: 60, left: 120 }];
  try {
    const tree = EditorFamilyMenu({ ...element.props });
    const found = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      if (node.props?.role === "menuitem") {
        const label = [node.props.children].flat(Infinity).find(
          (child) => child?.type === "span",
        );
        found.push([node.props["data-testid"], label.props.children]);
      }
      walk(node.props?.children);
    };
    walk(tree);
    return found;
  } finally {
    hooks.active = false;
  }
}

describe("top toolbar menus list every family mode", () => {
  beforeEach(() => {
    globalThis.document = { body: { nodeType: 1 } };
  });
  afterEach(() => {
    delete globalThis.document;
  });

  it("brush lists Normal, Smudge, Blur, Sharpen, Dodge, Burn and Sponge", () => {
    const element = EditorBrushMenu({ tool: TOOL.BRUSH, onTool: noop });
    expect(openMenuItems(element)).toEqual(
      ["normal", "smudge", "blur", "sharpen", "dodge", "burn", "sponge"].map(
        (mode) => [`editor-brush-menu-${mode}`, `editor.brushMode.${mode}`],
      ),
    );
  });

  it("brush modes go through onBrushMode and switch to the brush tool", () => {
    const onTool = vi.fn();
    const onBrushMode = vi.fn();
    const element = EditorBrushMenu({ tool: TOOL.ERASER, onTool, onBrushMode });
    element.props.items.find((item) => item.key === "blur").onChoose();
    expect(onBrushMode).toHaveBeenCalledWith("blur");
    expect(onTool).toHaveBeenCalledWith(TOOL.BRUSH);
  });

  it("marquee lists the marquee shapes and the lasso family", () => {
    const element = EditorMarqueeMenu({ tool: TOOL.MARQUEE, onTool: noop });
    expect(openMenuItems(element).map(([id]) => id)).toEqual([
      "editor-marquee-menu-rect",
      "editor-marquee-menu-ellipse",
      "editor-marquee-menu-lasso",
      "editor-marquee-menu-poly",
      "editor-marquee-menu-magnetic",
    ]);
  });

  it("marquee and lasso entries pick their tool and mode", () => {
    const onTool = vi.fn();
    const onMarqueeMode = vi.fn();
    const element = EditorMarqueeMenu({ tool: TOOL.SELECT, onTool, onMarqueeMode });
    const choose = (key) =>
      element.props.items.find((item) => item.key === key).onChoose();
    choose("lasso");
    expect(onTool).toHaveBeenLastCalledWith(TOOL.LASSO);
    choose("magnetic");
    expect(onMarqueeMode).toHaveBeenLastCalledWith("magnetic");
    expect(onTool).toHaveBeenLastCalledWith(TOOL.MARQUEE);
  });

  it("healing lists AI repair, spot, patch and clone", () => {
    const element = EditorHealingMenu({ tool: TOOL.HEALING, onTool: noop });
    expect(openMenuItems(element).map(([id]) => id)).toEqual([
      "editor-healing-menu-aiRepair",
      "editor-healing-menu-spot",
      "editor-healing-menu-patch",
      "editor-healing-menu-clone",
    ]);
    const onTool = vi.fn();
    const onHealingMode = vi.fn();
    const clone = EditorHealingMenu({ tool: TOOL.SELECT, onTool, onHealingMode });
    clone.props.items.find((item) => item.key === "clone").onChoose();
    expect(onHealingMode).toHaveBeenCalledWith("clone");
    expect(onTool).toHaveBeenCalledWith(TOOL.HEALING);
  });

  it("pen lists pen, curvature pen and free pen", () => {
    const element = EditorPenMenu({ tool: TOOL.PEN, onTool: noop });
    expect(openMenuItems(element).map(([, label]) => label)).toEqual([
      "editor.tool.pen",
      "editor.tool.curvaturePen",
      "editor.tool.freePen",
    ]);
  });

  it("shapes lists all six shape tools", () => {
    const element = ShapeToolsMenu({ tool: TOOL.RECT, onTool: noop });
    expect(openMenuItems(element).map(([, label]) => label)).toEqual([
      "editor.tool.rect",
      "editor.tool.ellipse",
      "editor.tool.line",
      "editor.tool.polygon",
      "editor.tool.star",
      "editor.tool.arrow",
    ]);
    const onTool = vi.fn();
    ShapeToolsMenu({ tool: TOOL.RECT, onTool })
      .props.items.find((item) => item.key === TOOL.STAR)
      .onChoose();
    expect(onTool).toHaveBeenCalledWith(TOOL.STAR);
  });

  it("fill lists fill and gradient", () => {
    const element = EditorFillMenu({ tool: TOOL.FILL, onTool: noop });
    expect(openMenuItems(element).map(([, label]) => label)).toEqual([
      "editor.tool.fill",
      "editor.tool.gradient",
    ]);
  });

  it("the toolbar mounts a closed menu trigger for every family", () => {
    const html = renderToStaticMarkup(
      <EditorToolbar
        tool={TOOL.BRUSH}
        onTool={noop}
        marqueeMode="rect"
        brushMode="normal"
        healingMode="aiRepair"
      />,
    );
    for (const id of ["select", "marquee", "brush", "pen", "shapes", "fill", "healing"]) {
      expect(html).toContain(`data-testid="editor-${id}-menu-trigger"`);
    }
    expect(html).not.toContain('role="menu"');
  });
});
