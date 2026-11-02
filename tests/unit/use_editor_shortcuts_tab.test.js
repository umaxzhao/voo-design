import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorShortcuts } from "../../src/canvas/use_editor_shortcuts.js";
import { DESIGN_SHORTCUT_GROUPS } from "../../src/shared/editor-shortcut-catalog.js";

const hooks = vi.hoisted(() => ({ effects: [] }));
vi.mock("react", () => ({
  useRef: (current) => ({ current }),
  useEffect: (effect) => hooks.effects.push(effect),
}));

afterEach(() => {
  hooks.effects = [];
  vi.unstubAllGlobals();
});

function mountShortcuts(onSaveAndExit) {
  const listeners = new Map();
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("window", {
    innerWidth: 1000,
    innerHeight: 800,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  });
  vi.stubGlobal("document", { activeElement: { tagName: "BODY" } });
  useEditorShortcuts({ engine: {}, onSaveAndExit });
  const cleanups = hooks.effects.map((effect) => effect());
  return {
    dispatch(target, shiftKey = false) {
      const event = {
        key: "Tab",
        code: "Tab",
        target,
        shiftKey,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
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

describe("editor Tab navigation", () => {
  it.each([false, true])(
    "lets %s+Tab on the body navigate without saving and exiting",
    (shiftKey) => {
      const onSaveAndExit = vi.fn();
      const shortcuts = mountShortcuts(onSaveAndExit);
      const target = Object.assign(new HTMLElement(), {
        tagName: "BODY",
        closest: () => null,
      });
      const event = shortcuts.dispatch(target, shiftKey);

      expect(onSaveAndExit).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
      shortcuts.cleanup();
    },
  );

  it("does not intercept Tab on a button", () => {
    const shortcuts = mountShortcuts(vi.fn());
    const target = Object.assign(new HTMLElement(), {
      tagName: "BUTTON",
      closest: () => null,
    });
    const event = shortcuts.dispatch(target);

    expect(event.preventDefault).not.toHaveBeenCalled();
    shortcuts.cleanup();
  });

  it("does not map Tab to save and exit in the shortcut catalog", () => {
    const editGroup = DESIGN_SHORTCUT_GROUPS.find((group) => group.id === "edit");
    const saveAndExit = editGroup.shortcuts.find(
      (shortcut) => shortcut.labelKey === "editor.shortcut.saveAndExit",
    );

    expect(saveAndExit.key).not.toBe("Tab");
    expect(saveAndExit.key).toBe("⌃⌥⇧E");
  });
});
