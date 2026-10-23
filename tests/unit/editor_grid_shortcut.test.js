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

describe("grid keyboard shortcut", () => {
  it.each(["metaKey", "ctrlKey"])(
    "%s toggles a hidden grid on and off while preserving size and snap",
    (modifier) => {
      const listeners = new Map();
      vi.stubGlobal("HTMLElement", class {});
      vi.stubGlobal("window", {
        innerWidth: 1000,
        innerHeight: 800,
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type) => listeners.delete(type),
      });
      let grid = { enabled: false, size: 64, snap: false };
      const engine = {
        getGrid: () => grid,
        setGrid: vi.fn((next) => { grid = next; }),
      };
      useEditorShortcuts({ engine });
      const cleanups = hooks.effects.map((effect) => effect());
      const press = () => {
        const event = {
          key: "'",
          code: "Quote",
          [modifier]: true,
          target: {},
          preventDefault: vi.fn(),
        };
        listeners.get("keydown")(event);
        expect(event.preventDefault).toHaveBeenCalledOnce();
      };
      try {
        press();
        expect(grid).toEqual({ enabled: true, size: 64, snap: false });
        press();
        expect(grid).toEqual({ enabled: false, size: 64, snap: false });
        press();
        expect(grid).toEqual({ enabled: true, size: 64, snap: false });
      } finally {
        cleanups.forEach((cleanup) => cleanup?.());
      }
    },
  );
});
