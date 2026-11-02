import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { useBrowserOverlay } from "../../src/canvas/components/browser_drawer/use-browser-overlay.js";
import EditorContextMenu from "../../src/canvas/components/editor_context_menu.jsx";

const hookEffects = [];
const hooks = { effects: hookEffects };
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRef: (current) => ({ current }),
    useEffect: (effect) => {
      hookEffects.push(effect);
    },
    useState: (initial) => [typeof initial === "function" ? initial() : initial, vi.fn()],
  };
});

vi.mock("react-dom", () => ({
  createPortal: (children) => children,
}));

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock("../../src/canvas/components/use_context_menu_bounds.js", () => ({
  useContextMenuBounds: () => ({
    current: {
      querySelectorAll: () => [],
      querySelector: () => null,
      contains: () => false,
    },
  }),
}));

vi.mock("../../src/canvas/codegen/index.js", () => ({
  generateCode: () => ({ code: "" }),
}));

vi.mock("../../src/canvas/editor/editor_html_clipboard.js", () => ({
  copyEditorHtml: vi.fn(),
}));

vi.mock("../../src/canvas/use_window_controls.js", () => ({
  isMacPlatform: () => false,
}));

vi.mock("../../src/canvas/components/editor_context_submenu.jsx", () => ({
  EditorContextMenuState: { Provider: ({ children }) => children },
}));

vi.mock("../../src/canvas/components/editor_context_object_items.jsx", () => ({
  default: () => null,
}));

vi.mock("../../src/canvas/components/editor_context_path_items.jsx", () => ({
  default: () => null,
}));

describe("Overlay Escape stack and Context Menu Esc handling", () => {
  let docListeners;
  let winListeners;
  let mockDocument;
  let mockWindow;
  let overlaysInDom;

  beforeEach(() => {
    hookEffects.length = 0;
    docListeners = new Map();
    winListeners = new Map();
    overlaysInDom = [];

    mockDocument = {
      body: { tagName: "BODY" },
      activeElement: { tagName: "BODY" },
      addEventListener: vi.fn((type, handler) => {
        if (!docListeners.has(type)) docListeners.set(type, []);
        docListeners.get(type).push(handler);
      }),
      removeEventListener: vi.fn((type, handler) => {
        const list = docListeners.get(type) || [];
        docListeners.set(type, list.filter((h) => h !== handler));
      }),
      querySelectorAll: vi.fn((selector) => {
        return overlaysInDom.filter((el) => el.matches?.(selector) ?? false);
      }),
    };

    mockWindow = {
      addEventListener: vi.fn((type, handler) => {
        if (!winListeners.has(type)) winListeners.set(type, []);
        winListeners.get(type).push(handler);
      }),
      removeEventListener: vi.fn((type, handler) => {
        const list = winListeners.get(type) || [];
        winListeners.set(type, list.filter((h) => h !== handler));
      }),
      innerWidth: 1024,
      innerHeight: 768,
    };

    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("HTMLElement", class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createMockEvent({ key = "Escape", target = mockDocument.body } = {}) {
    return {
      key,
      target,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault: vi.fn(function () {
        this.defaultPrevented = true;
      }),
      stopPropagation: vi.fn(function () {
        this.propagationStopped = true;
      }),
    };
  }

  describe("Browser Drawer Overlay (useBrowserOverlay)", () => {
    it("closes browser drawer when Escape is pressed and no top overlay is present", () => {
      const onClose = vi.fn();
      let cleanup;

      useBrowserOverlay(true, onClose);
      const cleanups = hooks.effects.map((fn) => fn());

      const listeners = docListeners.get("keydown") || [];
      expect(listeners.length).toBeGreaterThan(0);

      const event = createMockEvent({ key: "Escape" });
      listeners.forEach((handler) => handler(event));

      expect(onClose).toHaveBeenCalledOnce();
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();

      cleanups?.forEach(fn => fn?.());
    });

    it("does not close browser drawer on Escape when a command palette dialog is open", () => {
      const onClose = vi.fn();
      let cleanup;

      // Add a simulated Command Palette element to DOM
      const commandPalette = {
        matches: (sel) =>
          sel.includes('[data-testid="command-palette"]') ||
          sel.includes('[role="dialog"]'),
        closest: () => null,
        hidden: false,
      };
      overlaysInDom.push(commandPalette);

      useBrowserOverlay(true, onClose);
      const cleanups = hooks.effects.map((fn) => fn());

      const listeners = docListeners.get("keydown") || [];
      const event = createMockEvent({ key: "Escape" });
      listeners.forEach((handler) => handler(event));

      // Browser drawer should NOT be closed because Command Palette takes precedence
      expect(onClose).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);

      cleanups?.forEach(fn => fn?.());
    });

    it("does not close browser drawer on Escape when a context menu is open", () => {
      const onClose = vi.fn();
      const menu = {
        matches: (sel) => sel.includes('[role="menu"]'),
        closest: () => null,
        hidden: false,
      };
      overlaysInDom.push(menu);

      useBrowserOverlay(true, onClose);
      const cleanups = hooks.effects.map((fn) => fn());

      const listeners = docListeners.get("keydown") || [];
      const event = createMockEvent({ key: "Escape" });
      listeners.forEach((handler) => handler(event));

      expect(onClose).not.toHaveBeenCalled();
    });

    it("handles two-step Escape: first closes top overlay, second closes Browser Drawer", () => {
      const onBrowserClose = vi.fn();
      useBrowserOverlay(true, onBrowserClose);
      hooks.effects.map((fn) => fn());

      const commandPalette = {
        matches: (sel) => sel.includes('[data-testid="command-palette"]'),
        closest: () => null,
        hidden: false,
      };
      overlaysInDom.push(commandPalette);

      const listeners = docListeners.get("keydown") || [];

      // Step 1: First Esc with command palette open
      const firstEvent = createMockEvent({ key: "Escape" });
      listeners.forEach((handler) => handler(firstEvent));
      expect(onBrowserClose).not.toHaveBeenCalled();

      // Step 2: Command palette dismissed (removed from DOM)
      overlaysInDom = [];

      // Step 3: Second Esc
      const secondEvent = createMockEvent({ key: "Escape" });
      listeners.forEach((handler) => handler(secondEvent));
      expect(onBrowserClose).toHaveBeenCalledOnce();
      expect(secondEvent.preventDefault).toHaveBeenCalled();
      expect(secondEvent.stopPropagation).toHaveBeenCalled();
    });

    it("ignores non-Escape keys", () => {
      const onClose = vi.fn();
      useBrowserOverlay(true, onClose);
      const cleanups = hooks.effects.map((fn) => fn());

      const listeners = docListeners.get("keydown") || [];
      const event = createMockEvent({ key: "Enter" });
      listeners.forEach((handler) => handler(event));

      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not register listener when open is false", () => {
      const onClose = vi.fn();
      useBrowserOverlay(false, onClose);

      const listeners = docListeners.get("keydown") || [];
      expect(listeners.length).toBe(0);
    });

    it("ignores hidden or inert overlays", () => {
      const onClose = vi.fn();
      overlaysInDom.push({
        matches: (sel) => sel.includes('[role="dialog"]'),
        closest: (sel) => (sel.includes("aria-hidden") ? {} : null),
        hidden: false,
      });

      useBrowserOverlay(true, onClose);
      const cleanups = hooks.effects.map((fn) => fn());

      const listeners = docListeners.get("keydown") || [];
      const event = createMockEvent({ key: "Escape" });
      listeners.forEach((handler) => handler(event));

      // Since the dialog is aria-hidden, browser drawer should close
      expect(onClose).toHaveBeenCalledOnce();
      expect(event.preventDefault).toHaveBeenCalled();
      cleanups?.forEach((fn) => fn?.());
    });
  });

  describe("Editor Context Menu Escape handling (editor_context_menu.jsx)", () => {
    it("closes context menu when Escape is pressed, even if focus is outside the menu (on canvas or body)", () => {
      const onClose = vi.fn();
      const mockEngine = {
        getCanvasType: () => "2d",
        getDocument: () => ({ canvasType: "2d" }),
        sourceWorkflowNodeId: null,
      };

      // In editor_context_menu.jsx, useEffect adds keydown listener to window.
      // We simulate mounting the effect:
      EditorContextMenu({
        x: 100,
        y: 100,
        engine: mockEngine,
        selectedCount: 1,
        onClose,
      });
      const cleanups = hooks.effects.map((fn) => fn()).filter(Boolean);

      const keydownHandlers = winListeners.get("keydown") || [];
      expect(keydownHandlers.length).toBeGreaterThan(0);

      // Event target is canvas/body, NOT inside [role="menu"]
      const canvasTarget = {
        closest: (sel) => null,
      };
      const event = createMockEvent({ key: "Escape", target: canvasTarget });

      keydownHandlers.forEach((handler) => handler(event));

      expect(onClose).toHaveBeenCalledOnce();
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();

      cleanups.forEach((cleanup) => cleanup?.());
    });

    it("closes context menu when Escape is pressed while focused inside the menu", () => {
      const onClose = vi.fn();
      const mockEngine = {
        getCanvasType: () => "2d",
        getDocument: () => ({ canvasType: "2d" }),
        sourceWorkflowNodeId: null,
      };

      EditorContextMenu({
        x: 100,
        y: 100,
        engine: mockEngine,
        selectedCount: 1,
        onClose,
      });
      const cleanups = hooks.effects.map((fn) => fn()).filter(Boolean);
      const keydownHandlers = winListeners.get("keydown") || [];

      // Target inside the menu
      const menuItemTarget = {
        closest: (sel) => ({}),
      };
      const event = createMockEvent({ key: "Escape", target: menuItemTarget });

      keydownHandlers.forEach((handler) => handler(event));

      expect(onClose).toHaveBeenCalledOnce();
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();

      cleanups.forEach((cleanup) => cleanup?.());
    });

    it("does not close context menu if event.defaultPrevented is true", () => {
      const onClose = vi.fn();
      const mockEngine = {
        getCanvasType: () => "2d",
        getDocument: () => ({ canvasType: "2d" }),
        sourceWorkflowNodeId: null,
      };

      EditorContextMenu({
        x: 100,
        y: 100,
        engine: mockEngine,
        selectedCount: 1,
        onClose,
      });
      const cleanups = hooks.effects.map((fn) => fn()).filter(Boolean);
      const keydownHandlers = winListeners.get("keydown") || [];

      const event = createMockEvent({ key: "Escape" });
      event.defaultPrevented = true;

      keydownHandlers.forEach((handler) => handler(event));

      expect(onClose).not.toHaveBeenCalled();

      cleanups.forEach((cleanup) => cleanup?.());
    });
  });
});
