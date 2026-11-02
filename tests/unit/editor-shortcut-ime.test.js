import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorShortcuts } from "../../src/canvas/use_editor_shortcuts.js";
import { createPointerKeyboard } from "../../src/canvas/editor/editor-pointer-bindings.js";
import { handleModifierShortcut } from "../../src/canvas/editor-shortcut-modifiers.js";

const hooks = vi.hoisted(() => ({ effects: [] }));
vi.mock("react", () => ({
  useRef: (current) => ({ current }),
  useEffect: (effect) => hooks.effects.push(effect),
  useLayoutEffect: (effect) => hooks.effects.push(effect),
}));
afterEach(() => {
  hooks.effects = [];
  vi.unstubAllGlobals();
});

function mount() {
  const listeners = new Map();
  vi.stubGlobal("HTMLElement", class {});
  const target = Object.assign(new HTMLElement(), {
    tagName: "BODY",
    closest: () => null,
  });
  vi.stubGlobal("window", {
    innerWidth: 1000,
    innerHeight: 800,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  });
  vi.stubGlobal("document", { activeElement: target });
  const calls = [];
  const engine = new Proxy(
    { getTool: () => "select", getMagneticLassoDraft: () => null },
    {
      get: (object, key) =>
        object[key] ??
        ((...args) => {
          calls.push([key, ...args]);
          return undefined;
        }),
    },
  );
  useEditorShortcuts({
    engine,
    tool: "select",
    onTool: vi.fn(),
    onSave: () => calls.push(["save"]),
    onToggleCommandPalette: () => calls.push(["palette"]),
  });
  const cleanups = hooks.effects.map((effect) => effect());
  calls.length = 0;
  const dispatch = (type, props = {}) => {
    const event = {
      target,
      key: "s",
      code: "KeyS",
      isComposing: false,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      ...props,
    };
    for (const fn of listeners.get(type) ?? []) fn(event);
    return event;
  };
  return { calls, dispatch, cleanup: () => cleanups.forEach((fn) => fn?.()) };
}

describe("canvas IME ownership", () => {
  it.each([
    { key: "s", code: "KeyS", ctrlKey: true },
    { key: "k", code: "KeyK", ctrlKey: true },
    { key: "ArrowRight", code: "ArrowRight" },
    { key: "Delete", code: "Delete" },
    { key: "b", code: "KeyB" },
    { key: "Enter", code: "Enter" },
  ])("does not run canvas commands for composing $code", (props) => {
    const audit = mount();
    const event = audit.dispatch("keydown", { ...props, isComposing: true });
    expect(audit.calls).toEqual([]);
    expect(event.preventDefault).not.toHaveBeenCalled();
    audit.cleanup();
  });

  it("keeps keyCode 229 and the full composition session out of global commands", () => {
    const audit = mount();
    audit.dispatch("keydown", { ctrlKey: true, keyCode: 229 });
    expect(audit.calls).toEqual([]);
    audit.dispatch("compositionstart");
    audit.dispatch("keydown", { ctrlKey: true });
    expect(audit.calls).toEqual([]);
    audit.dispatch("compositionend");
    audit.dispatch("keydown", { ctrlKey: true });
    expect(audit.calls).toEqual([["save"]]);
    audit.cleanup();
  });
});

function pointerAudit() {
  const setSpaceDown = vi.fn(),
    onPointerUp = vi.fn();
  const keyboard = createPointerKeyboard({
    stage: { style: {} },
    shared: false,
    getGesture: () => ({ kind: "move", pointerId: 1 }),
    getLastPointerEvent: () => null,
    setSpaceDown,
    dispatchMove: vi.fn(),
    onPointerUp,
    hover: { updateHoverCursor: vi.fn() },
  });
  return { keyboard, setSpaceDown, onPointerUp };
}

describe("pointer keyboard ownership", () => {
  it("does not cancel a pointer transaction for an IME candidate Escape", () => {
    const audit = pointerAudit();
    audit.keyboard.onKeyDown({
      key: "Escape",
      isComposing: true,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    });
    expect(audit.onPointerUp).not.toHaveBeenCalled();
  });

  it.each(["BUTTON", "SELECT"])(
    "does not arm temporary pan on a native %s",
    (tagName) => {
      vi.stubGlobal("HTMLElement", class {});
      const target = Object.assign(new HTMLElement(), {
        tagName,
        closest: () => ({}),
      });
      const audit = pointerAudit();
      const event = {
        key: " ",
        code: "Space",
        target,
        preventDefault: vi.fn(),
      };
      audit.keyboard.onKeyDown(event);
      expect(audit.setSpaceDown).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    },
  );
});

describe("modified bracket ownership", () => {
  it.each(["ctrlKey", "metaKey"])(
    "keeps %s+brackets as layer operations over a brush",
    (modifier) => {
      const engine = {
        bringToFront: vi.fn(),
        sendToBack: vi.fn(),
        setBrushWidth: vi.fn(),
        getBrushWidth: () => 12,
      };
      const context = { engine, toolRef: { current: "brush" } };
      for (const code of ["BracketRight", "BracketLeft"]) {
        handleModifierShortcut(
          { code, [modifier]: true, preventDefault: vi.fn() },
          context,
        );
      }
      expect(engine.bringToFront).toHaveBeenCalledOnce();
      expect(engine.sendToBack).toHaveBeenCalledOnce();
      expect(engine.setBrushWidth).not.toHaveBeenCalled();
    },
  );
});
