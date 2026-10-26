import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
let states = [],
  cursor = 0;
vi.mock("react", async original => {
  const actual = await original();
  return {
    ...actual,
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    },
    useRef: value => ({
      current: value
    }),
    useEffect: () => {},
    useLayoutEffect: () => {}
  };
});
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: key => key
  })
}));
import Quickbar, { clampQuickbar } from "../../src/canvas/components/editor_contextual_taskbar.jsx";
const render = props => {
  cursor = 0;
  return Quickbar.type(props);
};
function find(tree, id) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.props?.id === id || tree.props?.["data-testid"] === id) return tree;
  return React.Children.toArray(tree.props?.children).map(child => find(child, id)).find(Boolean);
}
beforeEach(() => {
  states = [];
  cursor = 0;
});
describe("selection quickbar", () => {
  it.each([["image", "crop"], ["rect", "editor-taskbar-fill"], ["frame", "autoLayout"], ["group", "ungroup"]])("renders %s editing and common actions", (kind, specific) => {
    const tree = render({
      selected: {
        id: "one",
        kind
      }
    });
    expect(find(tree, specific === "font-size" ? "editor-taskbar-font-size" : specific)).toBeTruthy();
    for (const id of ["duplicate", "lock", "hide", "delete", "bringForward", "sendBackward", "ai-sparkle"]) expect(find(tree, id)).toBeTruthy();
    expect(find(tree, "editor-taskbar-ai-input")).toBeFalsy();
    // Missing APIs are safe for every rendered button.
    for (const id of ["duplicate", "lock", "hide", "delete", "bringForward", "sendBackward"]) expect(() => find(tree, id).props.onClick()).not.toThrow();
  });
  it("leaves text properties in the right panel instead of the taskbar", () => {
    const tree = render({ selected: { id: "one", kind: "text" } });
    expect(find(tree, "editor-taskbar-font-size")).toBeFalsy();
    expect(find(tree, "editor-taskbar-font-family")).toBeFalsy();
    expect(find(tree, "bold")).toBeFalsy();
    expect(find(tree, "text-align-left")).toBeFalsy();
    // Layer actions still work from the taskbar.
    for (const id of ["duplicate", "lock", "hide", "delete"]) expect(find(tree, id)).toBeTruthy();
  });

  it("opens and closes the AI input only through its toggle", () => {
    const props = {
      selected: {
        id: "one",
        kind: "text"
      }
    };
    let tree = render(props);
    find(tree, "ai-sparkle").props.onClick();
    tree = render(props);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('data-testid="editor-taskbar-ai-input"');
    find(tree, "ai-sparkle").props.onClick();
    expect(renderToStaticMarkup(render(props))).not.toContain('data-testid="editor-taskbar-ai-input"');
  });
  it("keeps full alignment, distribution, grouping and booleans together", () => {
    const engine = {
      getSelectedIds: () => ["a", "b", "c"],
      canCombineSelection: () => true,
      layoutSelection: vi.fn(),
      groupSelection: vi.fn(),
      combineSelected: vi.fn()
    };
    const tree = render({
      engine,
      selected: {
        id: "a",
        kind: "rect"
      }
    });
    for (const align of ["left", "center", "right", "top", "middle", "bottom"]) {
      find(tree, `align-${align}`).props.onClick();
    }
    expect(engine.layoutSelection).toHaveBeenCalledTimes(6);
    find(tree, "distribute-horizontal").props.onClick();
    find(tree, "group").props.onClick();
    find(tree, "boolean-union").props.onClick();
    expect(engine.groupSelection).toHaveBeenCalledOnce();
    expect(engine.combineSelected).toHaveBeenCalledWith("union");
  });
  it("updates real visibility, unlock and frame layout APIs", () => {
    const engine = {
      updateNode: vi.fn(),
      toggleLockNode: vi.fn()
    };
    const tree = render({
      engine,
      selected: {
        id: "a",
        kind: "text",
        fontSize: 24,
        locked: true,
        visible: false
      }
    });
    find(tree, "show").props.onClick();
    expect(engine.updateNode).toHaveBeenCalledWith("a", {
      visible: true
    });
    find(tree, "unlock").props.onClick();
    expect(engine.toggleLockNode).toHaveBeenCalledWith("a");
    find(render({
      engine,
      selected: {
        id: "f",
        isFrame: true
      }
    }), "autoLayout").props.onClick();
    expect(engine.updateNode).toHaveBeenCalledWith("f", {
      autoLayout: expect.objectContaining({
        direction: "vertical"
      })
    });
  });
  it("clamps all edges and reserves an eight pixel gap above the bottom toolbar", () => {
    const result = clampQuickbar({
      x: 999,
      y: 790,
      width: 80,
      height: 80
    }, 400, 38, 1000, 800, 748);
    expect(result.left).toBe(792);
    expect(result.top + 38).toBeLessThanOrEqual(740);
    expect(clampQuickbar({
      x: -100,
      y: -100,
      width: 1,
      height: 1
    }, 400, 38, 1000, 800).top).toBe(8);
  });
});
