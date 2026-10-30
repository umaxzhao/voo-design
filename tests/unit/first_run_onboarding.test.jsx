import React from "react";
const hooks = vi.hoisted(() => ({ active: false, values: [], refs: [], refIndex: 0, index: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual,
    useState: (initial) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
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
import AgentCardGrid from "../../src/canvas/components/onboarding/agent_card_grid.jsx";
import CustomProviderInline from "../../src/canvas/components/onboarding/custom_provider_inline.jsx";
import DeepSeekConnectorInline from "../../src/canvas/components/onboarding/deepseek_connector_inline.jsx";
import { FIRST_RUN_KEY, finishFirstRun, shouldShowFirstRun } from "../../src/canvas/components/first_run_state.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { loadLocale, t } from "../../src/shared/i18n.js";
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
    expect(html).toContain(locale === "en" ? "Next" : "下一步");
    expect(html).not.toContain(locale === "en" ? "Set up later" : "稍后设置");
    expect(html).not.toContain(locale === "en" ? "Project directory" : "项目目录");
    expect(html).not.toContain("firstRun.");
  });
  it("keeps the first-run dialog inset and content-sized below large screens", () => {
    const source = readFileSync(new URL("../../src/canvas/components/first_run_onboarding.jsx", import.meta.url), "utf8");
    expect(source).toMatch(/w-\[calc\(100%-2rem\)\].*lg:w-full/);
    expect(source).toMatch(/h-auto max-h-\[85dvh\].*lg:h-\[min\(656px,90dvh\)\]/);
    expect(source).toContain("ui-scroll flex min-h-0 flex-1");
    expect(source).toContain("overflow-y-auto");
  });
  it.each(["en", "zh"])("renders the inline custom config with translated text in %s", async (locale) => {
    await loadLocale(locale);
    const { t } = await import("../../src/shared/i18n.js");
    const groups = [{ cliId: "custom:a", name: "host", models: [{ id: "api:a:m", label: "m" }] }];
    const html = renderToStaticMarkup(<CustomProviderInline t={t} groups={groups} selectedModel="api:a:m" onSelectModel={() => {}} onConfigured={() => {}} />);
    expect(html).toContain(locale === "en" ? "Fetch models" : "拉取模型");
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/firstRun\.|settings\.customProvider\.|provider\.(apiKey|replaceKey)/);
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
  // The cards live inside AgentCardGrid, which this shallow tree does not expand: pick through its onSelect.
  const pick = (id) => { elements(tree).find(el => el.type === AgentCardGrid).props.onSelect(id); draw(); };
  const next = () => {
    click(el => el.props?.["data-testid"] === "first-run-next");
    if (step() === "workspace") click(el => el.props?.["data-testid"] === "first-run-next");
  };
  const step = () => elements(tree).find(el => el.props?.["data-step"])?.props["data-step"];
  beforeEach(async () => {
    await loadLocale("en");
    vi.stubGlobal("window", Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) }));
    hooks.active = true; hooks.values = []; hooks.refs = [];
    reopened = false;
    useDesignStore.setState({ isDirty: false, nodes: [] });
    onStart = vi.fn(); onClose = vi.fn(); draw();
  });
  afterEach(() => { hooks.active = false; vi.unstubAllGlobals(); });
  it("renders the provider step and persists the chosen provider", () => {
    expect(step()).toBe("provider");
    pick("codex");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.codex);
    pick("claude");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.claude);
    pick("deepseek-harness");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.claude);
    next(); expect(getSetting(FIRST_RUN_KEY)).toBe("completed"); expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });
  it("advances from Agent selection to the workspace step", () => {
    click(el => el.props?.["data-testid"] === "first-run-next");
    expect(step()).toBe("workspace");
    expect(renderToStaticMarkup(tree)).toContain("Project directory");
    expect(renderToStaticMarkup(tree)).toContain('data-testid="first-run-workspace-choose"');
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
    pick("codex");
    click(el => el.type === "button" && el.props.children === "Open Agent setup guide (CLI detection and connection test)");
    expect(listener).toHaveBeenCalledOnce(); expect(onClose).toHaveBeenCalled();
  });
  it("shows the DeepSeek plugin panel instead of the generic connection panel", () => {
    pick("codex");
    expect(elements(tree).filter(el => el.type === "p").map(el => el.props.children)).toContain("Agent connection");
    pick("deepseek-harness");
    const panel = elements(tree).find(el => el.type === DeepSeekConnectorInline);
    expect(panel).toBeTruthy();
    expect(panel.props.status).toBeNull();
    expect(typeof panel.props.detection.refresh).toBe("function");
    expect(elements(tree).filter(el => el.type === "p").map(el => el.props.children)).not.toContain("Agent connection");
    expect(elements(tree).filter(el => el.type === "button").map(el => el.props.children))
      .not.toContain("Open Agent setup guide (CLI detection and connection test)");
  });
  const inline = () => elements(tree).find(el => el.type === CustomProviderInline);
  it.each(["dashscope", "volcengine"])("opens %s API setup without applying a CLI model", id => {
    const previousModel = getSetting(AGENT_SETTING.MODEL);
    pick(id);
    expect(inline().props.preset.id).toBe(id);
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(previousModel);
    expect(elements(tree).filter(el => el.type === "button").map(el => el.props.children))
      .not.toContain("Open Agent setup guide (CLI detection and connection test)");
  });
  it("offers the DeepSeek Harness model card and prefills the local bridge form", () => {
    const grid = elements(tree).find(el => el.type === AgentCardGrid);
    expect(grid.props.cloudProviders.map(card => card.id))
      .toEqual(["vooCloud", "dashscope", "volcengine", "deepseek-harness-models"]);
    const previousModel = getSetting(AGENT_SETTING.MODEL);
    pick("deepseek-harness-models");
    expect(inline().props.preset.id).toBe("deepseek-harness-models");
    expect(inline().props.preset.customProviderId).toBe("custom:onboarding-deepseek-harness");
    // The preset is a shortcut into the same inline form: endpoint and a
    // loopback placeholder key are prefilled, no model is written before fetch.
    const html = renderToStaticMarkup(tree);
    expect(html).toMatch(/data-testid="first-run-custom-url"[^>]* value="http:\/\/127\.0\.0\.1:4399\/v1"/);
    expect(html).toMatch(/data-testid="first-run-custom-key"[^>]* value="voo-local"/);
    expect(html).toContain('data-testid="first-run-custom-hint"');
    expect(html).toContain("Needs the DeepSeek Harness desktop app");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(previousModel);
    expect(elements(tree).filter(el => el.type === "button").map(el => el.props.children))
      .not.toContain("Open Agent setup guide (CLI detection and connection test)");
  });
  it("persists an existing custom model through the Agent model setting", () => {
    vi.stubGlobal("localStorage", { getItem: key => key === "voo.custom_providers" ? JSON.stringify([{ id: "custom:studio", name: "Studio", models: [{ id: "model-a", label: "Model A" }] }]) : null });
    pick("custom");
    expect(inline().props.groups[0].models.map(model => model.id)).toEqual(["api:custom%3Astudio:model-a"]);
    inline().props.onSelectModel("api:custom%3Astudio:model-a");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe("api:custom%3Astudio:model-a");
    draw();
    expect(inline().props.selectedModel).toBe("api:custom%3Astudio:model-a");
  });
  it("no longer offers an Open provider settings button", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("CustomEvent", class extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } });
    const listener = vi.fn(); window.addEventListener("voo:open-settings", listener);
    const buttons = () => elements(tree).filter(el => el.type === "button").map(el => el.props.children);
    for (const id of [undefined, "codex", "custom"]) {
      if (id) pick(id);
      expect(buttons()).not.toContain("Open provider settings");
      expect(JSON.stringify(buttons())).not.toContain("provider settings");
    }
    next();
    expect(listener).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
  it("shows the inline custom config only while Custom model is selected", () => {
    expect(inline()).toBeUndefined();
    pick("custom");
    expect(inline()).toBeTruthy();
    pick("codex");
    expect(inline()).toBeUndefined();
    pick("custom");
    expect(inline()).toBeTruthy();
    pick("claude");
    expect(inline()).toBeUndefined();
  });
  it("re-reads the custom providers when the inline setup reports a stored provider", () => {
    const store = {};
    vi.stubGlobal("localStorage", { getItem: key => store[key] ?? null });
    pick("custom");
    expect(elements(tree).find(el => el.type === AgentCardGrid).props.customConfigured).toBe(false);
    store["voo.custom_providers"] = JSON.stringify([{ id: "custom:studio", name: "Studio", models: [{ id: "model-a", label: "Model A" }] }]);
    inline().props.onConfigured(); draw();
    expect(elements(tree).find(el => el.type === AgentCardGrid).props.customConfigured).toBe(true);
  });
  it("can finish without choosing an Agent", () => { next(); expect(onClose).toHaveBeenCalled(); });
});

// Rendered outside the shallow harness so the inline panel keeps its real hooks.
describe("first-run DeepSeek install panel", () => {
  it.each(["en", "zh"])("renders the plugin install guidance without raw keys in %s", async (locale) => {
    await loadLocale(locale);
    const status = {
      status: "unauthenticated",
      installed: true,
      authenticated: false,
      ready: false,
      dsh: {
        appInstalled: true,
        appPath: "/Applications/DeepSeek Harness.app",
        pluginInstalled: false,
        connectorDir: "/tmp/voo/connectors/voo",
        installCommand: "dsh plugin add link:/tmp/voo/connectors/voo",
      },
    };
    const html = renderToStaticMarkup(
      <DeepSeekConnectorInline t={t} status={status} detection={{ phase: "done", refresh: () => {} }} />,
    );
    expect(html).toContain('data-testid="deepseek-connector-inline"');
    expect(html).toContain('data-testid="deepseek-app-status"');
    expect(html).toContain('data-testid="deepseek-plugin-status"');
    expect(html).toContain('data-testid="deepseek-install-command"');
    expect(html).toContain('data-testid="deepseek-install-button"');
    expect(html).toContain('data-testid="deepseek-refresh"');
    expect(html).not.toContain("firstRun.");
    await loadLocale("en");
  });
});
