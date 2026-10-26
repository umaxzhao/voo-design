import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
vi.mock("../../src/canvas/store/layout_action_helpers.js", () => ({ resolveLayoutImages: vi.fn(async () => []) }));
vi.mock("../../src/canvas/editor/html_import.js", () => ({ htmlToDocument: vi.fn(() => ({ doc: { id: "html-doc" }, pendingImages: [] })) }));
vi.mock("../../src/canvas/components/dispatch_to_agent.js", () => ({ dispatchToAgent: vi.fn() }));
import { dispatchToAgent } from "../../src/canvas/components/dispatch_to_agent.js";
import { htmlToDocument } from "../../src/canvas/editor/html_import.js";
import { HTML_IMPORT_ACCEPT, SCREENSHOT_ACCEPT, importWelcomeHtml, recreateWelcomeScreenshot } from "../../src/canvas/components/welcome_home_actions.js";
import { handleExportShortcut } from "../../src/canvas/editor/export_shortcut.js";
const read = (path) => fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");
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
  it("uses dedicated HTML and screenshot pickers, leaving Figma on the project picker", () => {
    const source = read("canvas/components/welcome_dashboard.jsx");
    expect(HTML_IMPORT_ACCEPT).toBe(".html,.htm,text/html");
    for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif"]) expect(SCREENSHOT_ACCEPT).toContain(ext);
    for (const [action, ref] of [["importBrowser", "htmlInputRef"], ["recreateScreenshot", "screenshotInputRef"], ["importFigma", "fileInputRef"]]) {
      const button = source.slice(0, source.indexOf(`t("welcome.actions.${action}")`)).split("<button").at(-1);
      expect(button).toContain(`${ref}.current?.click()`);
      expect(button).not.toContain("handleCreateNew");
    }
    expect(source).toContain('accept=".voo,.psd,.fig,.pen,.svg,application/json"');
  });
  it("waits for the target editor, inserts the screenshot, then sends a recreation prompt", async () => {
    const insertImage = vi.fn(async () => ({ id: "reference" }));
    const state = { editingNodeId: "new", welcomeOpen: false, editorBridges: {} };
    const createDesign = vi.fn(); const dispatch = vi.fn();
    const wait = vi.fn(async () => { state.editorBridges.new = { ready: true, engine: { insertImage } }; });
    const file = { name: "screen.png" };
    await recreateWelcomeScreenshot(file, { createDesign, getStore: () => state, dispatch, wait });
    expect(createDesign).toHaveBeenCalledWith(expect.objectContaining({ width: 1440, height: 900 }));
    expect(wait).toHaveBeenCalledOnce();
    expect(insertImage).toHaveBeenCalledWith(file);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0]).toMatchObject({ intent: "recreate", autoSend: true, context: { targetNodeId: "new", screenshotNodeId: "reference" } });
  });
  it("queues recreate after welcome closes and the editing node becomes available", async () => {
    const insertImage = vi.fn(async () => ({ id: "ref" }));
    const state = { welcomeOpen: true, editingNodeId: null };
    const wait = vi.fn(async () => {
      if (wait.mock.calls.length === 1) state.editingNodeId = "new";
      else { state.welcomeOpen = false; state.editorBridges = { new: { ready: true, engine: { insertImage } } }; }
    });
    await recreateWelcomeScreenshot({}, { createDesign: vi.fn(), getStore: () => state, wait });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(insertImage).toHaveBeenCalledOnce();
    expect(dispatchToAgent).toHaveBeenCalledWith(expect.objectContaining({ intent: "recreate", context: expect.objectContaining({ targetNodeId: "new" }) }));
  });
  it("throws on timeout and aborts when a different editor is selected", async () => {
    await expect(recreateWelcomeScreenshot({}, { createDesign: vi.fn(), getStore: () => ({ welcomeOpen: true }), wait: vi.fn() })).rejects.toThrow("Screenshot editor did not become ready");
    let calls = 0;
    const dispatch = vi.fn();
    await recreateWelcomeScreenshot({}, { createDesign: vi.fn(), getStore: () => ({ editingNodeId: ++calls === 1 ? "new" : "other" }), dispatch });
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("validates the provider, creates the design, then hands one generation intent to the panel", () => {
    const source = read("canvas/components/welcome_dashboard.jsx");
    const handler = source.slice(source.indexOf("const handlePromptSubmit"), source.indexOf("const handleOpenLocal"));
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
    const source = read("canvas/components/editor_layers.jsx");
    expect(source).toContain('aria-label={t("editor.layers.searchToggle")}');
    expect(source).toContain('aria-label={t("editor.layers.search")}');
    for (const lang of ["en", "zh"]) {
      const strings = read(`shared/i18n/extended-${lang}.js`);
      const label = (key) => strings.match(new RegExp(`"editor.layers.${key}": "([^"]+)"`))[1];
      expect(label("searchToggle")).not.toBe(label("search"));
    }
  });
});
