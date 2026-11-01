import React from "react";
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { createRequire } from "node:module";

const state = vi.hoisted(() => ({ welcomeOpen: false, welcomeActionsReady: false, setWelcomeOpen: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original(),
  useState: (initial) => [initial, vi.fn()],
  useEffect: () => {},
  useRef: (current) => ({ current }),
  useId: () => "titlebar-popover-scope",
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
function visibleText(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node) || node.props["aria-hidden"]) return "";
  return React.Children.toArray(node.props.children).map(visibleText).join("");
}
const source = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

describe("title bar actions", () => {
  it.each([false, true])("gates welcome import/new on action readiness=%s", ready => {
    state.welcomeOpen = true;
    state.welcomeActionsReady = ready;
    vi.stubGlobal("window", {});
    try {
      const actions = buttons(AppTitleBar());
      for (const title of ["titlebar.openTitle", "welcome.header.new"]) {
        expect(actions.find(button => button.props.title === title).props.disabled).toBe(!ready);
      }
      state.welcomeOpen = false;
      const editing = buttons(AppTitleBar());
      expect(editing.find(button => button.props.title === "titlebar.openTitle").props.disabled).toBe(false);
    } finally {
      state.welcomeOpen = false;
      state.welcomeActionsReady = false;
      vi.unstubAllGlobals();
    }
  });
  it.each([
    [true, 3, ["titlebar.openTitle", "welcome.header.new", "titlebar.browser"], ["voo:welcome-menu-action", "voo:welcome-new"]],
    [false, 4, ["titlebar.openTitle", "titlebar.snapshotTitle", "titlebar.browser", "titlebar.prefsTitle"], ["voo:file-open", "voo:file-export-snapshot"]],
  ])("places welcome settings in the bottom-left and keeps editor settings on the right (welcome=%s)", (welcomeOpen, count, titles, events) => {
    state.welcomeOpen = welcomeOpen;
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("CustomEvent", class { constructor(type, options) { this.type = type; this.detail = options?.detail; } });
    try {
      const tree = AppTitleBar();
      const header = React.Children.toArray(tree.props.children)[0];
      const right = React.Children.toArray(header.props.children)[1];
      const allActions = buttons(right);
      const more = allActions.filter((button) => button.props.title === "titlebar.more");
      // The compact overflow trigger is always present for narrow widths.
      expect(more).toHaveLength(1);
      expect(more[0].props["aria-haspopup"]).toBe("menu");
      expect(more[0].props["aria-expanded"]).toBe(false);
      const actions = allActions.filter((button) => button.props.title !== "titlebar.more");
      expect(actions).toHaveLength(count);
      expect(actions.map((button) => button.props.title)).toEqual(titles);
      // The visible label follows the title: Open + New on welcome, Open + Export in the editor.
      expect(actions.slice(0, 2).map(visibleText)).toEqual([
        "titlebar.open", welcomeOpen ? "welcome.header.new" : "editor.export",
      ]);
      actions[0].props.onClick();
      if (welcomeOpen) expect(dispatchEvent.mock.calls[0][0].detail).toEqual({ action: "open-file" });
      actions[1].props.onClick();
      expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(events);
      const settings = buttons(tree).filter(button => button.props["aria-label"] === "welcome.settings.open");
      expect(settings).toHaveLength(1);
      expect(settings[0].props.onClick.toString()).toContain("setSettingsOpen(true)");
      expect(settings[0].props.className.includes("fixed bottom-3 left-6")).toBe(welcomeOpen);
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
    expect(main).toContain('require("./native-menu.cjs")');
    const buildMenu = createRequire(import.meta.url)("../../electron/native-menu.cjs");
    let template;
    const dispatchMenuAction = vi.fn();
    buildMenu({ app: { name: "VOO Design", getLocale: () => "en" }, platform: "win32", dispatchMenuAction,
      Menu: { buildFromTemplate: value => { template = value; return value; }, setApplicationMenu() {} } });
    const help = template.find(item => item.label === "Help").submenu;
    help.find(item => item.label === "Agent / CLI Setup Wizard").click();
    help.find(item => item.label === "About VOO Design").click();
    expect(dispatchMenuAction.mock.calls).toEqual([["help:onboarding"], ["help:about"]]);
    expect(source("../../src/App.jsx")).toMatch(/case "help:onboarding":\s*window.dispatchEvent\(new CustomEvent\("voo:open-onboarding"\)\)/);
  });
});
