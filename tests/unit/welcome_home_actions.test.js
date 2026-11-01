import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
vi.mock("../../src/canvas/store/layout_action_helpers.js", () => ({ resolveLayoutImages: vi.fn(async () => []) }));
vi.mock("../../src/canvas/editor/html_import.js", () => ({ htmlToDocument: vi.fn(() => ({ doc: { id: "html-doc" }, pendingImages: [] })) }));
vi.mock("../../src/canvas/components/dispatch_to_agent.js", () => ({ dispatchToAgent: vi.fn() }));
import { htmlToDocument } from "../../src/canvas/editor/html_import.js";
import { HTML_IMPORT_ACCEPT, SCREENSHOT_ACCEPT, importWelcomeHtml, openWelcomeBrowser } from "../../src/canvas/components/welcome_home_actions.js";
import { handleExportShortcut } from "../../src/canvas/editor/export_shortcut.js";
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
    expect(source).toContain('accept=".voo,.zip,.psd,.fig,.pen,.svg,application/json"');
  });
  it("validates the provider, creates the design, then hands one generation intent to the panel", () => {
    const source = readWelcomeDashboard();
    const handler = source.slice(source.indexOf("const handlePromptSubmit"), source.indexOf("return { handlePromptSubmit }"));
    expect(handler).toContain("buildGenerationIntent({");
    expect(handler).toContain("await resolveAgentProvider(intent.modelId)");
    expect(handler.indexOf("await resolveAgentProvider")).toBeLessThan(handler.indexOf("await handleCreateNew"));
    expect(handler.indexOf("await handleCreateNew")).toBeLessThan(handler.indexOf("setPendingGeneration(intent)"));
    expect(handler).not.toContain("dispatchToAgent(");
    expect(handler).not.toContain("setTimeout");
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
  it("keeps title bar minimal (no Export) while export stays reachable via shortcut listener", () => {
    const titlebar = read("app_title_bar.jsx");
    expect(titlebar).not.toContain('data-testid="titlebar-export-btn"');
    expect(titlebar).not.toContain('voo:editor-export');
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
