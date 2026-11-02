import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorShortcuts } from "../../src/canvas/use_editor_shortcuts.js";

const hooks = vi.hoisted(() => ({ effects: [] }));
vi.mock("react", () => ({
  useRef: (current) => ({ current }),
  useEffect: (effect) => hooks.effects.push(effect),
}));

afterEach(() => {
  hooks.effects = [];
  vi.unstubAllGlobals();
});

function mountShortcuts(engine, actions = {}) {
  const listeners = new Map();
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("window", {
    innerWidth: 1000,
    innerHeight: 800,
    getSelection: () => ({ toString: () => "" }),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  });
  vi.stubGlobal("document", { activeElement: { tagName: "BODY" } });
  useEditorShortcuts({ engine, tool: "select", onTool: vi.fn(), ...actions });
  const cleanups = hooks.effects.map((effect) => effect());
  const target = Object.assign(new HTMLElement(), {
    tagName: "BODY",
    closest: () => null,
  });
  return {
    dispatch(key, code, modifier) {
      const event = {
        key,
        code,
        target,
        shiftKey: false,
        altKey: false,
        ctrlKey: modifier === "Control",
        metaKey: modifier === "Meta",
        isComposing: false,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };
      listeners.get("keydown")?.(event);
      return event;
    },
    cleanup: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

describe("editor clipboard keyboard shortcuts", () => {
  it.each(["Meta", "Control"])("routes %s+X to cut and prevents browser cut", (modifier) => {
    const engine = {
      getTool: () => "select",
      getPixelSelection: () => null,
      getSelected: () => ({ id: "shape-1" }),
      getSelectedIds: () => ["shape-1"],
      cut: vi.fn(),
    };
    const shortcuts = mountShortcuts(engine);

    const event = shortcuts.dispatch("x", "KeyX", modifier);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(engine.cut).toHaveBeenCalledOnce();
    shortcuts.cleanup();
  });

  it.each(["Meta", "Control"])("routes %s+D to duplicate", (modifier) => {
    const engine = {
      getTool: () => "select",
      getPixelSelection: () => null,
      getSelected: () => ({ id: "shape-1" }),
      getSelectedIds: () => ["shape-1"],
      duplicateSelected: vi.fn(),
    };
    const shortcuts = mountShortcuts(engine);

    const event = shortcuts.dispatch("d", "KeyD", modifier);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(engine.duplicateSelected).toHaveBeenCalledOnce();
    shortcuts.cleanup();
  });

  it.each(["Meta", "Control"])("routes %s+S to save", (modifier) => {
    const onSave = vi.fn();
    const shortcuts = mountShortcuts({ getTool: () => "select" }, { onSave });

    const event = shortcuts.dispatch("s", "KeyS", modifier);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ saveAs: false });
    shortcuts.cleanup();
  });

  it.each(["Meta", "Control"])("routes %s+O to open", (modifier) => {
    const onOpen = vi.fn();
    const shortcuts = mountShortcuts({ getTool: () => "select" }, { onOpen });

    const event = shortcuts.dispatch("o", "KeyO", modifier);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    shortcuts.cleanup();
  });
});
