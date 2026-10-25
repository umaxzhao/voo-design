import React from "react";
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";

const state = vi.hoisted(() => ({ welcomeOpen: false, setWelcomeOpen: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original(),
  useState: (initial) => [initial, vi.fn()],
  useEffect: () => {},
}));
vi.mock("../../src/store/design_store.js", () => ({ useDesignStore: (selector) => selector(state) }));
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../../src/canvas/components/canvas_tab_bar.jsx", () => ({ default: () => null }));
vi.mock("../../src/canvas/components/settings_drawer.jsx", () => ({ default: () => null }));
import AppTitleBar from "../../src/app_title_bar.jsx";
import CollabAvatars from "../../src/canvas/components/collab_avatars.jsx";

function buttons(node) {
  if (!React.isValidElement(node)) return [];
  if (node.type === "button") return [node];
  return React.Children.toArray(node.props.children).flatMap(buttons);
}
const source = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

describe("title bar actions", () => {
  it.each([
    [true, ["titlebar.openTitle", "welcome.header.new", "titlebar.settingsTitle"], ["voo:file-open", "voo:welcome-new"]],
    [false, ["titlebar.openTitle", "titlebar.saveTitle", "titlebar.prefsTitle"], ["voo:file-open", "voo:file-save"]],
  ])("offers open plus new/save and settings on the right (welcome=%s)", (welcomeOpen, titles, events) => {
    state.welcomeOpen = welcomeOpen;
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("CustomEvent", class { constructor(type) { this.type = type; } });
    try {
      const tree = AppTitleBar();
      const header = React.Children.toArray(tree.props.children)[0];
      const right = React.Children.toArray(header.props.children)[1];
      const actions = buttons(right);
      expect(actions).toHaveLength(3);
      expect(actions.map((button) => button.props.title)).toEqual(titles);
      // The visible label follows the title: Open + New on welcome, Open + Save in the editor.
      expect(actions.slice(0, 2).map((button) => button.props.children)).toEqual([
        "titlebar.open", welcomeOpen ? "welcome.header.new" : "titlebar.save",
      ]);
      actions[0].props.onClick();
      actions[1].props.onClick();
      expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(events);
      expect(actions[2].props.onClick.toString()).toContain("setSettingsOpen(true)");
      for (const event of ["voo:open-about", "voo:open-onboarding", "voo:editor-export", "voo:open-first-run"]) {
        expect(source("../../src/app_title_bar.jsx")).not.toContain(event);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([[false, true], [true, false]])(
    "places CollabAvatars before Open in the editor only (welcome=%s)", (welcomeOpen, shown) => {
      state.welcomeOpen = welcomeOpen;
      vi.stubGlobal("window", {});
      try {
        const header = React.Children.toArray(AppTitleBar().props.children)[0];
        const right = React.Children.toArray(header.props.children)[1];
        const flat = (node) => React.Children.toArray(node?.props?.children).flatMap((c) => [c, ...flat(c)]);
        const kids = flat(right);
        const collabIndex = kids.findIndex((c) => c.type === CollabAvatars);
        expect(collabIndex >= 0).toBe(shown);
        if (shown) {
          expect(collabIndex).toBeLessThan(kids.findIndex((c) => c.props?.title === "titlebar.openTitle"));
        }
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("keeps CollabAvatars out of the floating toolbar", () => {
    const toolbar = source("../../src/canvas/components/editor_toolbar.jsx");
    expect(toolbar).not.toContain("CollabAvatars");
    expect(toolbar).not.toContain("collab_avatars");
  });

  it("keeps wizard entry points in Settings and the native Help menu", () => {
    const settings = source("../../src/canvas/components/settings_drawer.jsx");
    expect(settings).toContain('t("titlebar.cliWizard")');
    expect(settings).toContain('new CustomEvent("voo:open-onboarding")');
    const main = source("../../electron/main.cjs");
    expect(main).toContain('dispatchMenuAction("help:onboarding")');
    expect(main).toContain('dispatchMenuAction("help:about")');
    expect(source("../../src/App.jsx")).toMatch(/case "help:onboarding":\s*window.dispatchEvent\(new CustomEvent\("voo:open-onboarding"\)\)/);
  });
});
