import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";

const hookEffects = [];
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRef: (current) => ({ current }),
    useId: () => "mock-titlebar-scope",
    useEffect: (effect) => {
      hookEffects.push(effect);
    },
    useState: (initial) => [typeof initial === "function" ? initial() : initial, vi.fn()],
  };
});

const state = vi.hoisted(() => ({
  welcomeOpen: true,
  welcomeActionsReady: true,
  setWelcomeOpen: vi.fn(),
  activeDocumentId: null,
  documentLoading: false,
  agentPanelOpen: false,
  setAgentPanelOpen: vi.fn(),
  browserDrawerOpen: false,
  setBrowserDrawerOpen: vi.fn(),
}));

vi.mock("../../src/store/design_store.js", () => ({
  useDesignStore: Object.assign((selector) => selector(state), {
    getState: () => state,
  }),
}));
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../../src/canvas/components/canvas_tab_bar.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/settings_drawer.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/collab_avatars.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/welcome_dashboard.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/browser_drawer/browser_drawer.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/canvas_agent_panel.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/image_editor.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/page_switcher.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/image_size_notice.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/crash_recovery_prompt.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/loading_modal.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/onboarding/OnboardingGuide.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/first_run_onboarding.jsx", () => ({ default: () => null }));
vi.mock("../../src/release_ui.jsx", () => ({ default: () => null }));

import App from "../../src/App.jsx";
import AppTitleBar from "../../src/app_title_bar.jsx";
import { subscribeWelcomeNew } from "../../src/canvas/components/welcome_dashboard/welcome_events.js";

describe("WIN-CHROME-01 Windows chrome and New/Ctrl+N mount chain", () => {
  let winListeners;
  let menuCallback;
  let mockWindow;
  let effectCleanups;

  beforeEach(() => {
    hookEffects.length = 0;
    effectCleanups = [];
    winListeners = new Map();
    menuCallback = null;

    mockWindow = {
      addEventListener: vi.fn((type, handler) => {
        if (!winListeners.has(type)) winListeners.set(type, []);
        winListeners.get(type).push(handler);
      }),
      removeEventListener: vi.fn((type, handler) => {
        const list = winListeners.get(type) || [];
        winListeners.set(type, list.filter((h) => h !== handler));
      }),
      dispatchEvent: vi.fn((event) => {
        const list = winListeners.get(event.type) || [];
        for (const handler of list) handler(event);
        return true;
      }),
      electronAPI: {
        platform: "win32",
        onMenuAction: vi.fn((cb) => {
          menuCallback = cb;
          return () => { menuCallback = null; };
        }),
      },
      location: { search: "" },
    };

    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("CustomEvent", class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    });

    state.welcomeOpen = true;
    state.welcomeActionsReady = true;
    state.activeDocumentId = null;
  });

  afterEach(() => {
    for (const cleanup of effectCleanups) {
      if (typeof cleanup === "function") cleanup();
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mountApp() {
    App();
    for (const effect of hookEffects) {
      const cleanup = effect();
      if (typeof cleanup === "function") effectCleanups.push(cleanup);
    }
  }

  function createKeyboardEvent({
    key = "n",
    code = "KeyN",
    ctrlKey = true,
    metaKey = false,
    shiftKey = false,
    altKey = false,
    isComposing = false,
    keyCode = 78,
    defaultPrevented = false,
  } = {}) {
    let prevented = defaultPrevented;
    return {
      key,
      code,
      ctrlKey,
      metaKey,
      shiftKey,
      altKey,
      isComposing,
      keyCode,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault: vi.fn(() => {
        prevented = true;
      }),
    };
  }

  function dispatchKeydown(event) {
    const list = winListeners.get("keydown") || [];
    for (const handler of list) handler(event);
  }

  it("mounts App and verifies Ctrl+N respects IME and defaultPrevented guards", () => {
    mountApp();
    expect(winListeners.has("keydown")).toBe(true);

    const createSpy = vi.fn();
    const unsub = subscribeWelcomeNew(createSpy, mockWindow);

    // Guard 1: isComposing = true (IME in progress)
    const composingEvent = createKeyboardEvent({ isComposing: true });
    dispatchKeydown(composingEvent);
    expect(composingEvent.preventDefault).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    // Guard 2: keyCode = 229 (IME composition key code)
    const imeCodeEvent = createKeyboardEvent({ keyCode: 229 });
    dispatchKeydown(imeCodeEvent);
    expect(imeCodeEvent.preventDefault).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    // Guard 3: defaultPrevented = true (already consumed)
    const preventedEvent = createKeyboardEvent({ defaultPrevented: true });
    dispatchKeydown(preventedEvent);
    expect(preventedEvent.preventDefault).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    // Valid: standard Ctrl+N
    const validEvent = createKeyboardEvent();
    dispatchKeydown(validEvent);
    expect(validEvent.preventDefault).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("prevents duplicate document creation when native menu accelerator and DOM event both fire", () => {
    mountApp();
    expect(typeof menuCallback).toBe("function");

    const createSpy = vi.fn();
    const unsub = subscribeWelcomeNew(createSpy, mockWindow);

    // Simulate native menu action firing from Electron accelerator
    menuCallback("file:new");
    // Simulate simultaneous DOM keydown event emitted by Chromium for the same keypress
    const event = createKeyboardEvent();
    dispatchKeydown(event);

    // Deduplication must ensure exactly one creation call, not two
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();

    unsub();
  });

  it("queues cold-start Ctrl+N intent before Welcome dashboard subscribes, then runs once", () => {
    mountApp();

    // Trigger Ctrl+N BEFORE subscribeWelcomeNew is called
    const event = createKeyboardEvent();
    dispatchKeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();

    // Dashboard now mounts and subscribes
    const createSpy = vi.fn();
    const unsub = subscribeWelcomeNew(createSpy, mockWindow);

    // The queued intent must have been drained exactly once
    expect(createSpy).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("applies WIN_WINDOW_CONTROLS_INSET_PX (138px) right padding on Windows titlebar", () => {
    mockWindow.electronAPI.platform = "win32";
    const tree = AppTitleBar();
    const header = React.Children.toArray(tree.props.children)[0];
    expect(header.props.style.paddingRight).toBe(138);
    expect(header.props.style.paddingLeft).toBeUndefined();
    expect(header.props.style.WebkitAppRegion).toBe("drag");
  });

  it("applies MAC_TRAFFIC_LIGHT_INSET_PX (96px) left padding on Darwin titlebar", () => {
    mockWindow.electronAPI.platform = "darwin";
    const tree = AppTitleBar();
    const header = React.Children.toArray(tree.props.children)[0];
    expect(header.props.style.paddingLeft).toBe(96);
    expect(header.props.style.paddingRight).toBeUndefined();
    expect(header.props.style.WebkitAppRegion).toBe("drag");
  });

  it("electron/main.cjs sets hidden titleBarStyle with titleBarOverlay and autoHideMenuBar for Windows", () => {
    const mainSource = fs.readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
    expect(mainSource).toContain('titleBarStyle: process.platform === "darwin" ? "hiddenInset" : isWindows ? "hidden" : "default"');
    expect(mainSource).toContain('titleBarOverlay: {\n            color: "#000000",\n            symbolColor: "#ffffff",\n            height: 40,\n          }');
    expect(mainSource).toContain("autoHideMenuBar: true");
  });
});
