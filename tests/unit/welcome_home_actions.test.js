import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
vi.mock("../../src/canvas/store/layout_action_helpers.js", () => ({ resolveLayoutImages: vi.fn(async () => []) }));
vi.mock("../../src/canvas/editor/html_import.js", () => ({ htmlToDocument: vi.fn(() => ({ doc: { id: "html-doc" }, pendingImages: [] })) }));
vi.mock("../../src/canvas/components/dispatch_to_agent.js", () => ({ dispatchToAgent: vi.fn() }));
import { htmlToDocument } from "../../src/canvas/editor/html_import.js";
import { HTML_IMPORT_ACCEPT, SCREENSHOT_ACCEPT, importWelcomeHtml, openWelcomeBrowser } from "../../src/canvas/components/welcome_home_actions.js";
import { handleExportShortcut } from "../../src/canvas/editor/export_shortcut.js";
import { useWelcomePromptSubmit } from "../../src/canvas/components/welcome_dashboard/use_welcome_prompt_submit.js";
import { useDesignStore } from "../../src/store/design_store.js";
const read = (path) => fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");
// The welcome dashboard was split into focused modules; assertions about its
// behaviour read the dashboard entry plus every module it is composed from.
const readWelcomeDashboard = () => [
  "canvas/components/welcome_dashboard.jsx",
  ...fs.readdirSync(new URL("../../src/canvas/components/welcome_dashboard/", import.meta.url))
    .filter((name) => /\.(jsx?|js)$/.test(name))
    .map((name) => `canvas/components/welcome_dashboard/${name}`),
].map(read).join("\n");
globalThis.CustomEvent ??= class extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } };

describe("welcome home actions", () => {
  it("imports selected HTML and closes welcome only after loading", async () => {
    const store = { loadVooProject: vi.fn(), setWelcomeOpen: vi.fn() };
    await importWelcomeHtml({ name: "site.htm", text: async () => "<main>Hello</main>" }, store);
    expect(htmlToDocument).toHaveBeenCalledWith("<main>Hello</main>", { width: 1440, height: 900 });
    expect(store.loadVooProject).toHaveBeenCalledWith(expect.objectContaining({ fileName: "site.voo", vooData: expect.objectContaining({ document: { id: "html-doc" } }) }));
    expect(store.setWelcomeOpen).toHaveBeenCalledWith(false);
    htmlToDocument.mockImplementationOnce(() => { throw new Error("invalid html"); });
    store.setWelcomeOpen.mockClear();
    await expect(importWelcomeHtml({ text: async () => "bad" }, store)).rejects.toThrow();
    expect(store.setWelcomeOpen).not.toHaveBeenCalled();
  });
  it("opens the browser panel through its shared command", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    try {
      openWelcomeBrowser();
      expect(dispatchEvent.mock.calls[0][0].type).toBe("voo:open-browser");
    } finally { vi.unstubAllGlobals(); }
  });
  it("uses the screenshot attachment picker and leaves Figma on the project picker", () => {
    const source = readWelcomeDashboard();
    expect(HTML_IMPORT_ACCEPT).toBe(".html,.htm,text/html");
    for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif"]) expect(SCREENSHOT_ACCEPT).toContain(ext);
    expect(source).toContain("onClick={openWelcomeBrowser}");
    expect(source).toContain("await handleAttachmentsSelected(files)");
    expect(source).not.toContain("recreateWelcomeScreenshot");
    expect(source).toContain('accept=".voo,.zip,.psd,.fig,.pen,.svg,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.ico,application/json"');
  });
  it("validates the provider, creates the design, then hands one generation intent to the panel", () => {
    const source = readWelcomeDashboard();
    const handler = source.slice(source.indexOf("const handlePromptSubmit"), source.indexOf("return { handlePromptSubmit }"));
    expect(handler).toContain("buildGenerationIntent({");
    expect(handler).toContain("await resolveAgentProvider(intent.modelId)");
    expect(handler.indexOf("await resolveAgentProvider")).toBeLessThan(handler.indexOf("store.newVooProject"));
    expect(handler.indexOf("store.newVooProject")).toBeLessThan(handler.indexOf("store.setPendingGeneration(intent)"));
    expect(handler).toContain("await handleCreateNew");
    expect(handler).not.toContain("dispatchToAgent(");
    expect(handler).not.toContain("setTimeout");
  });

  it("opens settings when agent provider is unconfigured, avoiding document creation", async () => {
    const store = { newVooProject: vi.fn(), setPendingGeneration: vi.fn() };
    const prevGetState = useDesignStore.getState;
    useDesignStore.getState = () => store;
    const setConfigNotice = vi.fn();
    const openAgentSettings = vi.fn();
    const handleCreateNew = vi.fn();
    const setSubmitting = vi.fn();
    const setPromptText = vi.fn();
    const clearAttachments = vi.fn();

    const { handlePromptSubmit } = useWelcomePromptSubmit({
      promptText: "Build a landing page",
      setPromptText,
      activePill: "web",
      attachments: [],
      references: { isReading: false, clearAttachments },
      submitting: false,
      setSubmitting,
      setConfigNotice,
      styleId: "minimal",
      designSystemId: null,
      modelId: "api:unconfigured-provider:gpt-4",
      size: { width: 1440, height: 900 },
      candidates: 1,
      locale: "en",
      t: (k) => k,
      openAgentSettings,
      handleCreateNew,
    });

    await handlePromptSubmit({ preventDefault: vi.fn() });

    expect(setConfigNotice).toHaveBeenCalledWith("welcome.prompt.configNeeded");
    expect(openAgentSettings).toHaveBeenCalled();
    expect(store.newVooProject).not.toHaveBeenCalled();
    expect(store.setPendingGeneration).not.toHaveBeenCalled();
    expect(handleCreateNew).not.toHaveBeenCalled();
    useDesignStore.getState = prevGetState;
  }, 15000);

  it("creates project in memory and dispatches single generation intent on valid submit", async () => {
    const store = { newVooProject: vi.fn(), setPendingGeneration: vi.fn() };
    const prevGetState = useDesignStore.getState;
    useDesignStore.getState = () => store;
    const setConfigNotice = vi.fn();
    const openAgentSettings = vi.fn();
    const handleCreateNew = vi.fn();
    const setSubmitting = vi.fn();
    const setPromptText = vi.fn();
    const clearAttachments = vi.fn();

    const { handlePromptSubmit } = useWelcomePromptSubmit({
      promptText: "Modern portfolio website",
      setPromptText,
      activePill: "web",
      attachments: [],
      references: { isReading: false, clearAttachments },
      submitting: false,
      setSubmitting,
      setConfigNotice,
      styleId: "minimal",
      designSystemId: null,
      modelId: "claude-code:default",
      size: { width: 1440, height: 900 },
      candidates: 1,
      locale: "en",
      t: (k) => k,
      openAgentSettings,
      handleCreateNew,
    });

    await handlePromptSubmit({ preventDefault: vi.fn() });

    expect(store.newVooProject).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1440, height: 900 })
    );
    expect(store.setPendingGeneration).toHaveBeenCalledTimes(1);
    expect(store.setPendingGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Modern portfolio website",
        prompt: expect.stringContaining("Modern portfolio website"),
      })
    );
    expect(setPromptText).toHaveBeenCalledWith("");
    expect(clearAttachments).toHaveBeenCalled();
    expect(handleCreateNew).not.toHaveBeenCalled();
    useDesignStore.getState = prevGetState;
  });

});
describe("export and layer search accessibility", () => {
  it.each(["ctrlKey", "metaKey"])("opens export with %s+Shift+E without taking plain E", (modifier) => {
    const dispatchEvent = vi.fn(); vi.stubGlobal("window", { dispatchEvent });
    const event = { code: "KeyE", [modifier]: true, shiftKey: true, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    expect(handleExportShortcut(event)).toBe(true);
    expect(dispatchEvent.mock.calls[0][0].type).toBe("voo:editor-export");
    expect(handleExportShortcut({ ...event, shiftKey: false })).toBe(false);
    expect(handleExportShortcut({ ...event, ctrlKey: false, metaKey: false })).toBe(false);
    vi.unstubAllGlobals();
  });
  it("wires title bar export and shortcut listener to onTriggerExport", () => {
    expect(read("canvas/components/editor_hooks/use_editor_apply.js")).toContain('window.addEventListener("voo:editor-export", onTriggerExport)');
    expect(read("canvas/editor/export_shortcut.js")).toContain("shiftKey");
  });
  it("gives search toggle and input distinct labels in both languages", () => {
    const source = read("canvas/components/editor_layers_header.jsx");
    expect(source).toContain('aria-label={t(panelTab === "assets" ? "editor.assets.searchToggle" : "editor.layers.searchToggle")}');
    expect(source).toContain('aria-label={t(panelTab === "assets" ? "editor.assets.search" : "editor.layers.search")}');
    for (const lang of ["en", "zh"]) {
      const strings = read(`shared/i18n/extended-${lang}.js`);
      const label = (key) => strings.match(new RegExp(`"editor.layers.${key}": "([^"]+)"`))[1];
      expect(label("searchToggle")).not.toBe(label("search"));
    }
  });
});
