// The top toolbar's Select button opens a menu of the select family, and the
// properties panel no longer repeats those choices (or any tool family mode).
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
// slots so the menu's handlers can be invoked without a DOM.
const hooks = vi.hoisted(() => ({
  active: false,
  slots: [],
  cursor: 0,
  effects: [],
}));

vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      const setter = (next) => {
        hooks.slots[index] =
          typeof next === "function" ? next(hooks.slots[index]) : next;
      };
      return [hooks.slots[index], setter];
    },
    useRef: (initial) =>
      hooks.active ? { current: initial } : actual.useRef(initial),
    useEffect: (effect, deps) =>
      hooks.active ? hooks.effects.push(effect) : actual.useEffect(effect, deps),
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

import EditorSelectMenu from "../../src/canvas/components/editor_select_menu.jsx";
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

/** Depth-first collection of React elements matching a predicate. */
function findAll(node, predicate, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, predicate, found));
    return found;
  }
  if (!node || typeof node !== "object") return found;
  if (predicate(node)) found.push(node);
  findAll(node.props?.children, predicate, found);
  return found;
}

/** Concatenates the text children of an element tree. */
function textOf(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object") return textOf(node.props?.children);
  return "";
}

const testIdOf = (id) => (node) => node.props?.["data-testid"] === id;

/**
 * Calls EditorSelectMenu as a function under the hook harness. Slot 0 is the
 * `open` state and slot 1 the captured dropdown position.
 */
function renderSelectMenu({ tool = TOOL.SELECT, open = false } = {}) {
  const onTool = vi.fn();
  hooks.active = true;
  hooks.cursor = 0;
  hooks.slots = [open, { top: 60, left: 120 }];
  hooks.effects = [];
  try {
    const tree = EditorSelectMenu({ tool, onTool });
    return { tree, onTool };
  } finally {
    hooks.active = false;
  }
}

describe("top toolbar Select menu", () => {
  let documentListeners;

  // The dropdown renders only when a document exists, so the menu tests stub a
  // minimal one and record the listeners the open menu registers.
  beforeEach(() => {
    documentListeners = [];
    globalThis.document = {
      body: { nodeType: 1 },
      addEventListener: vi.fn((type, handler, capture) => {
        documentListeners.push({ type, handler, capture });
      }),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it("marks the Select button and its chevron as a menu trigger, closed by default", () => {
    const html = renderToStaticMarkup(
      <EditorToolbar tool={TOOL.SELECT} onTool={noop} />,
    );
    expect(html).toContain('aria-label="editor.tool.select"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });

  it("lists Select, Distort, Perspective and Puppet, in that order", () => {
    const { tree } = renderSelectMenu({ open: true });
    const menu = findAll(tree, (node) => node.props?.role === "menu");
    expect(menu).toHaveLength(1);

    const items = findAll(tree, (node) => node.props?.role === "menuitem");
    expect(items.map((item) => item.props["data-testid"])).toEqual([
      "editor-select-menu-select",
      "editor-select-menu-distort",
      "editor-select-menu-perspective",
      "editor-select-menu-puppet",
    ]);
    expect(items.map((item) => textOf(item.props.children))).toEqual([
      "editor.tool.select",
      "editor.tool.distort",
      "editor.tool.perspective",
      "editor.tool.puppetWarp",
    ]);
  });

  it("keeps the menu closed until the chevron opens it", () => {
    const { tree } = renderSelectMenu({ open: false });
    expect(findAll(tree, (node) => node.props?.role === "menu")).toHaveLength(0);
  });

  it("keeps the Select button selecting the Select tool", () => {
    const { tree, onTool } = renderSelectMenu({ open: false });
    const selectButton = findAll(tree, testIdOf("editor-select-tool"))[0];
    selectButton.props.onClick();
    expect(onTool).toHaveBeenCalledWith(TOOL.SELECT);
  });

  it("choosing Distort calls onTool with TOOL.DISTORT and closes the menu", () => {
    const { tree, onTool } = renderSelectMenu({ open: true });
    const distort = findAll(tree, testIdOf("editor-select-menu-distort"))[0];
    distort.props.onClick();
    expect(onTool).toHaveBeenCalledTimes(1);
    expect(onTool).toHaveBeenCalledWith(TOOL.DISTORT);
    expect(hooks.slots[0]).toBe(false);
  });

  describe("dismissal", () => {
    const runOpenEffects = () => {
      hooks.effects.forEach((effect) => effect());
    };

    it("closes on a pointer press outside the menu", () => {
      renderSelectMenu({ open: true });
      runOpenEffects();
      const outside = documentListeners.find(
        (listener) => listener.type === "pointerdown",
      );
      expect(outside).toBeDefined();
      outside.handler({ target: {} });
      expect(hooks.slots[0]).toBe(false);
    });

    it("closes on Escape", () => {
      renderSelectMenu({ open: true });
      runOpenEffects();
      const escape = documentListeners.find(
        (listener) => listener.type === "keydown",
      );
      expect(escape).toBeDefined();
      const stopPropagation = vi.fn();
      escape.handler({ key: "Escape", stopPropagation });
      expect(stopPropagation).toHaveBeenCalled();
      expect(hooks.slots[0]).toBe(false);
    });
  });
});

describe("properties panel does not repeat the select family", () => {
  it.each([TOOL.SELECT, TOOL.DISTORT, TOOL.PERSPECTIVE, TOOL.PUPPET_WARP])(
    "renders no tool options block for %s",
    (tool) => {
      const html = renderToStaticMarkup(
        <EditorProperties tool={tool} toolProps={toolProps} object={rect} engine={engine} />,
      );
      expect(html).not.toContain("editor.toolOptions");
      expect(html).not.toContain("tool-family-mode-");
    },
  );

  it("renders no tool family mode buttons for the brush either", () => {
    const html = renderToStaticMarkup(
      <EditorProperties tool={TOOL.BRUSH} toolProps={toolProps} object={rect} engine={engine} />,
    );
    expect(html).not.toContain("tool-family-mode-");
  });
});
