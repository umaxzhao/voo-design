import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";

const state = vi.hoisted(() => ({
  welcomeOpen: false,
  welcomeActionsReady: true,
  setWelcomeOpen: vi.fn(),
  activeDocumentId: "doc-1",
  agentPanelOpen: false,
  setAgentPanelOpen: vi.fn(),
  browserDrawerOpen: false,
  setBrowserDrawerOpen: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...await original(),
  useState: (initial) => [initial, vi.fn()],
  useEffect: () => {},
  useRef: (current) => ({ current }),
  useId: () => "titlebar-popover-scope",
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

import AppTitleBar from "../../src/app_title_bar.jsx";
import { subscribeWelcomeNew, requestWelcomeNew } from "../../src/canvas/components/welcome_dashboard/welcome_events.js";

describe("WIN-CHROME-01 Windows chrome and New/Ctrl+N mount chain", () => {
  beforeEach(() => {
    state.welcomeOpen = false;
    state.welcomeActionsReady = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies WIN_WINDOW_CONTROLS_INSET_PX (138px) right padding on Windows titlebar", () => {
    vi.stubGlobal("window", {
      electronAPI: { platform: "win32" },
    });
    const tree = AppTitleBar();
    const header = React.Children.toArray(tree.props.children)[0];
    expect(header.props.style.paddingRight).toBe(138);
    expect(header.props.style.paddingLeft).toBeUndefined();
    expect(header.props.style.WebkitAppRegion).toBe("drag");
  });

  it("applies MAC_TRAFFIC_LIGHT_INSET_PX (96px) left padding on Darwin titlebar", () => {
    vi.stubGlobal("window", {
      electronAPI: { platform: "darwin" },
    });
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

  it("routes file:new to requestWelcomeNew when welcomeOpen is true", () => {
    const listeners = new Map();
    const mockWindow = {
      addEventListener: (event, handler) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(handler);
      },
      removeEventListener: (event, handler) => {
        const list = listeners.get(event) || [];
        listeners.set(event, list.filter(h => h !== handler));
      },
      dispatchEvent: (event) => {
        const list = listeners.get(event.type) || [];
        for (const handler of list) handler(event);
        return true;
      },
    };
    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("CustomEvent", class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    });

    state.welcomeOpen = true;
    let welcomed = false;
    const unsub = subscribeWelcomeNew(() => {
      welcomed = true;
    }, mockWindow);

    // Verify App.jsx implementation routes file:new to requestWelcomeNew when welcomeOpen is true
    const appSource = fs.readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");
    expect(appSource).toContain('case "file:new":\n            if (useDesignStore.getState().welcomeOpen) {\n              requestWelcomeNew();\n            } else {\n              window.dispatchEvent(new CustomEvent("voo:file-new"));\n            }');

    // Execute the action that App.jsx performs when welcomeOpen is true:
    requestWelcomeNew(mockWindow);
    expect(welcomed).toBe(true);

    unsub();
  });
});
