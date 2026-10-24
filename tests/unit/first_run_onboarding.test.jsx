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
vi.mock("../../src/store/design_store.js", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, useDesignStore: Object.assign(
    selector => hooks.active ? selector(actual.useDesignStore.getState()) : actual.useDesignStore(selector),
    actual.useDesignStore,
  ) };
});
import { useDesignStore } from "../../src/store/design_store.js";
import { AGENT_SETTING } from "../../src/canvas/agent/canvas_tools.js";
import { AGENT_DEFAULT_MODELS } from "../../src/canvas/components/onboarding/onboarding_agent_model.js";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import FirstRunOnboarding, { syncFirstRunDialog } from "../../src/canvas/components/first_run_onboarding.jsx";
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
  it("shows on every launch, including after completion or dismissal", () => {
    expect(shouldShowFirstRun()).toBe(true);
    finishFirstRun("completed");
    expect(getSetting(FIRST_RUN_KEY)).toBe("completed");
    expect(shouldShowFirstRun()).toBe(true);
    finishFirstRun("dismissed");
    expect(shouldShowFirstRun()).toBe(true);
  });
  it("still shows for existing workspace-guide users", () => {
    setSetting("voo.onboarding.completedVersion", "2.2.0");
    expect(shouldShowFirstRun()).toBe(true);
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
    expect(app).toContain('setFirstRunReopened(true); setFirstRunOpen(true)');
    expect(app).toContain('if (firstRunOpen) return;');
    expect(app).toContain('reopened={firstRunReopened}');
  });
  it("bypasses browser automation", () => {
    vi.stubGlobal("navigator", { webdriver: true });
    expect(shouldShowFirstRun()).toBe(false);
  });
  it.each(["en", "zh"])("renders translated dialog and actions in %s", async (locale) => {
    await loadLocale(locale);
    const html = renderToStaticMarkup(<FirstRunOnboarding open onClose={() => {}} onStart={() => {}} />);
    expect(html).toContain("first-run-title");
    expect(html).toContain(locale === "en" ? "Choose your Agent (optional)" : "选择智能体（可选）");
    expect(html).toContain(locale === "en" ? "Set up later" : "稍后设置");
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

describe("first-run dialog sync", () => {
  it("only shows the modal when the dialog is closed", () => {
    const dialog = {
      open: false,
      showModal: vi.fn(() => {
        if (dialog.open) throw new Error("InvalidStateError");
        dialog.open = true;
      }),
      close: vi.fn(() => { dialog.open = false; }),
    };
    syncFirstRunDialog(dialog, true);
    syncFirstRunDialog(dialog, true);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    syncFirstRunDialog(dialog, false);
    expect(dialog.close).toHaveBeenCalledOnce();
    syncFirstRunDialog(dialog, true);
    expect(dialog.showModal).toHaveBeenCalledTimes(2);
  });
  it("accepts an unmounted dialog", () => {
    expect(() => syncFirstRunDialog(null, false)).not.toThrow();
    expect(() => syncFirstRunDialog(null, true)).not.toThrow();
  });
});

// Exercise the component's event handlers in the repository's Node test environment.
function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}
describe("first-run interactions", () => {
  let onStart, onClose, tree, reopened;
  const draw = () => { hooks.index = 0; hooks.refIndex = 0; tree = FirstRunOnboarding({ open: true, reopened, onStart, onClose }); return tree; };
  const click = (predicate) => { const el = elements(tree).find(predicate); expect(el).toBeTruthy(); el.props.onClick(); draw(); };
  const next = () => click(el => el.props?.["data-testid"] === "first-run-next");
  const step = () => elements(tree).find(el => el.props?.["data-step"])?.props["data-step"];
  beforeEach(async () => {
    await loadLocale("en");
    hooks.active = true; hooks.values = []; hooks.refs = [];
    reopened = false;
    useDesignStore.setState({ isDirty: false, nodes: [] });
    onStart = vi.fn(); onClose = vi.fn(); draw();
  });
  afterEach(() => { hooks.active = false; vi.unstubAllGlobals(); });
  it("renders the provider step and persists the chosen provider", () => {
    expect(step()).toBe("provider");
    click(el => el.type === "button" && el.props.children === "Codex");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.codex);
    click(el => el.type === "button" && el.props.children === "Claude Code");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.claude);
    next(); expect(getSetting(FIRST_RUN_KEY)).toBe("completed"); expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });
  it.each(["en", "zh"])("translates every step in %s", async locale => {
    await loadLocale(locale);
    draw();
    expect(renderToStaticMarkup(tree)).not.toContain("firstRun.");
  });
  it("skip persists from the provider step", () => {
    click(el => el.type === "button" && el.props.children === "Skip for now");
    expect(getSetting(FIRST_RUN_KEY)).toBe("dismissed"); expect(onClose).toHaveBeenCalled();
  });
  it("Escape closes for now and marks dismissed on first run", () => {
    tree.props.onCancel({ preventDefault: vi.fn() });
    expect(getSetting(FIRST_RUN_KEY)).toBe("dismissed"); expect(onClose).toHaveBeenCalled();
  });
  it.each([null, "completed", "dismissed"])("reopened Escape preserves persisted status %s", status => {
    setSetting(FIRST_RUN_KEY, status);
    reopened = true; hooks.values = []; draw();
    tree.props.onCancel({ preventDefault: vi.fn() });
    expect(getSetting(FIRST_RUN_KEY)).toBe(status); expect(onClose).toHaveBeenCalled();
  });
  it("opens the full Agent setup guide for CLI detection", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("CustomEvent", class extends Event {});
    const listener = vi.fn(); window.addEventListener("voo:open-onboarding", listener);
    click(el => el.type === "button" && el.props.children === "Codex");
    click(el => el.type === "button" && el.props.children === "Open Agent setup guide (CLI detection and connection test)");
    expect(listener).toHaveBeenCalledOnce(); expect(onClose).toHaveBeenCalled();
  });
  it("persists an existing custom model through the Agent model setting", () => {
    vi.stubGlobal("localStorage", { getItem: key => key === "voo.custom_providers" ? JSON.stringify([{ id: "custom:studio", name: "Studio", models: [{ id: "model-a", label: "Model A" }] }]) : null });
    click(el => el.type === "button" && el.props.children === "Custom model");
    const select = elements(tree).find(el => el.type === "select");
    select.props.onChange({ target: { value: "api:custom%3Astudio:model-a" } });
    expect(getSetting(AGENT_SETTING.MODEL)).toBe("api:custom%3Astudio:model-a");
  });
  it("custom setup opens the existing provider settings", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("CustomEvent", class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } });
    const listener = vi.fn(); window.addEventListener("voo:open-settings", listener);
    click(el => el.type === "button" && el.props.children === "Custom model"); next();
    expect(listener.mock.calls[0][0].detail.tab).toBe("providers");
  });
  it("can finish without choosing an Agent", () => { next(); expect(onClose).toHaveBeenCalled(); });
});
