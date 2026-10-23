import React from "react";
const hooks = vi.hoisted(() => ({ active: false, values: [], refs: [], refIndex: 0, index: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual,
    useState: (initial) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [hooks.values[index], value => { hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value; }];
    },
    useRef: (value) => {
      if (!hooks.active) return actual.useRef(value);
      const index = hooks.refIndex++;
      return hooks.refs[index] ??= { current: value };
    },
    useEffect: (...args) => { if (!hooks.active) actual.useEffect(...args); },
    useSyncExternalStore: (...args) => hooks.active ? args[1]() : actual.useSyncExternalStore(...args),
  };
});
import { AGENT_SETTING } from "../../src/canvas/agent/canvas_tools.js";
import { AGENT_DEFAULT_MODELS } from "../../src/canvas/components/onboarding/onboarding_agent_model.js";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import FirstRunOnboarding from "../../src/canvas/components/first_run_onboarding.jsx";
import { FIRST_RUN_KEY, finishFirstRun, shouldShowFirstRun } from "../../src/canvas/components/first_run_state.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { loadLocale } from "../../src/shared/i18n.js";
import { readFileSync } from "node:fs";

describe("commercial first run", () => {
  beforeEach(() => {
    setSetting(FIRST_RUN_KEY, null);
    setSetting("voo.onboarding.completedVersion", null);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("defaults to showing for a new user", () => expect(shouldShowFirstRun()).toBe(true));
  it.each(["completed", "dismissed"])("persists %s and never shows again", (status) => {
    finishFirstRun(status);
    expect(getSetting(FIRST_RUN_KEY)).toBe(status);
    expect(shouldShowFirstRun()).toBe(false);
    // Workspace setup remaining incomplete must not bring the introduction back.
    setSetting("voo.workspace.path", "");
    expect(shouldShowFirstRun()).toBe(false);
  });
  it("does not interrupt existing workspace-guide users", () => {
    setSetting("voo.onboarding.completedVersion", "2.2.0");
    expect(shouldShowFirstRun()).toBe(false);
  });
  it("URL forcing overrides automation and completed flags", () => {
    finishFirstRun();
    vi.stubGlobal("navigator", { webdriver: true });
    vi.stubGlobal("location", { search: "?firstRun=1" });
    expect(shouldShowFirstRun()).toBe(true);
  });
  it("wires the reopen event and native menu action", () => {
    const app = readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");
    expect(app).toContain('addEventListener("voo:open-first-run", handleOpenFirstRun)');
    expect(app).toContain('removeEventListener("voo:open-first-run", handleOpenFirstRun)');
    expect(app).toContain('case "help:onboarding":');
    expect(app).toContain('const handleOpenFirstRun = () => setFirstRunOpen(true)');
  });
  it("bypasses browser automation", () => {
    vi.stubGlobal("navigator", { webdriver: true });
    expect(shouldShowFirstRun()).toBe(false);
  });
  it.each(["en", "zh"])("renders translated dialog and actions in %s", async (locale) => {
    await loadLocale(locale);
    const html = renderToStaticMarkup(<FirstRunOnboarding open onClose={() => {}} onStart={() => {}} />);
    expect(html).toContain("first-run-title");
    expect(html).toContain(locale === "en" ? "Welcome to VOO Design" : "欢迎使用 VOO Design");
    expect(html).toContain(locale === "en" ? "Next" : "下一步");
    expect(html).not.toContain("firstRun.");
  });
  it("renders nothing when closed", () => {
    expect(renderToStaticMarkup(<FirstRunOnboarding open={false} onClose={() => {}} onStart={() => {}} />)).toBe("");
  });
  it("keeps workspace setup manual on app launch", () => {
    const app = readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");
    expect(app).toContain("[onboardingOpen, setOnboardingOpen] = useState(false)");
    expect(app).toContain('addEventListener("voo:open-onboarding"');
    expect(app).not.toContain("shouldShowOnboarding");
  });
});

// Exercise the component's event handlers in the repository's Node test environment.
function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}
describe("first-run interactions", () => {
  let onStart, onClose, tree;
  const draw = () => { hooks.index = 0; hooks.refIndex = 0; tree = FirstRunOnboarding({ open: true, onStart, onClose }); return tree; };
  const click = (predicate) => { const el = elements(tree).find(predicate); expect(el).toBeTruthy(); el.props.onClick(); draw(); };
  const next = () => click(el => el.props?.["data-testid"] === "first-run-next");
  const step = () => elements(tree).find(el => el.props?.["data-step"])?.props["data-step"];
  beforeEach(async () => {
    await loadLocale("en");
    hooks.active = true; hooks.values = []; hooks.refs = [];
    onStart = vi.fn(); onClose = vi.fn(); draw();
  });
  afterEach(() => { hooks.active = false; vi.unstubAllGlobals(); });
  it("navigates every step, creates the chosen template and persists the provider", () => {
    expect(step()).toBe("welcome"); next(); expect(step()).toBe("start");
    click(el => el.type === "button" && elements(el).some(child => child.props?.children === "Mobile wallet"));
    next(); expect(step()).toBe("tour");
    expect(onStart.mock.calls[0][0].category).toBe("mobile");
    next(); expect(step()).toBe("provider");
    click(el => el.type === "button" && el.props.children === "Codex");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.codex);
    click(el => el.type === "button" && el.props.children === "Claude Code");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.claude);
    click(el => el.type === "button" && el.props.children === "Back"); expect(step()).toBe("tour");
    next(); next(); expect(getSetting(FIRST_RUN_KEY)).toBe("completed"); expect(onClose).toHaveBeenCalled();
  });
  it("does not recreate the document when returning through Start", () => {
    next(); next();
    click(el => el.type === "button" && el.props.children === "Back");
    next(); expect(onStart).toHaveBeenCalledTimes(1);
  });
  it.each(["en", "zh"])("translates every step in %s", async locale => {
    await loadLocale(locale);
    for (let index = 0; index < 4; index++) {
      draw();
      expect(renderToStaticMarkup(tree)).not.toContain("firstRun.");
      if (index < 3) next();
    }
  });
  it("creates blank through the start callback", () => { next(); next(); expect(onStart).toHaveBeenCalledWith(null); });
  it.each([0, 1, 2, 3])("skip persists from step %s", index => {
    for (let i = 0; i < index; i++) next();
    click(el => el.type === "button" && el.props.children === "Skip for now");
    expect(getSetting(FIRST_RUN_KEY)).toBe("dismissed"); expect(onClose).toHaveBeenCalled();
  });
  it("Escape dismisses the dialog", () => {
    tree.props.onCancel({ preventDefault: vi.fn() });
    expect(getSetting(FIRST_RUN_KEY)).toBe("dismissed"); expect(onClose).toHaveBeenCalled();
  });
  it("persists an existing custom model through the Agent model setting", () => {
    vi.stubGlobal("localStorage", { getItem: key => key === "voo.custom_providers" ? JSON.stringify([{ id: "custom:studio", name: "Studio", models: [{ id: "model-a", label: "Model A" }] }]) : null });
    next(); next(); next();
    click(el => el.type === "button" && el.props.children === "Custom model");
    const select = elements(tree).find(el => el.type === "select");
    select.props.onChange({ target: { value: "api:custom%3Astudio:model-a" } });
    expect(getSetting(AGENT_SETTING.MODEL)).toBe("api:custom%3Astudio:model-a");
  });
  it("keeps Start open when document creation fails", () => {
    next(); onStart.mockImplementationOnce(() => { throw new Error("failed"); }); next();
    expect(step()).toBe("start");
    expect(elements(tree).some(el => el.props?.role === "alert")).toBe(true);
    next(); expect(step()).toBe("tour");
  });
  it("custom setup opens the existing provider settings", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("CustomEvent", class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } });
    const listener = vi.fn(); window.addEventListener("voo:open-settings", listener);
    next(); next(); next();
    click(el => el.type === "button" && el.props.children === "Custom model"); next();
    expect(listener.mock.calls[0][0].detail.tab).toBe("providers");
  });
  it("can finish without choosing an Agent", () => { next(); next(); next(); next(); expect(onClose).toHaveBeenCalled(); });
});
