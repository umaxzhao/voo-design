import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { DESIGN_SYSTEMS } from "../../src/canvas/design_systems.js";
import {
  CUSTOM_DESIGN_SYSTEMS_SETTING,
  applyDesignSystemToDocument,
  deleteDesignSystem,
  duplicateDesignSystem,
  listDesignSystems,
  loadCustomDesignSystems,
  renameDesignSystem,
  saveCustomDesignSystems,
  saveDesignSystemEdits,
} from "../../src/canvas/editor/design_system_registry.js";
import { BUILT_IN_DESIGN_SYSTEMS } from "../../src/canvas/editor/design_system_presets.js";
import { buildDocumentDesignContext, designSystemFields, validateDesignTokens } from "../../src/canvas/editor/design_tokens.js";
import { serialiseDocument, deserialiseDocument } from "../../src/canvas/editor/scene_model_serialization.js";
import { createDocument } from "../../src/canvas/editor/scene_doc_factory.js";

/** Minimal editor honouring the setDesignSystem contract; one call is one undo step. */
function fakeEditor(doc = {}) {
  const history = [];
  const editor = {
    doc,
    history,
    getDocument: () => editor.doc,
    setDesignSystem: vi.fn(({ designTokens, designMd, designSystemId }) => {
      validateDesignTokens(designTokens);
      history.push(editor.doc);
      editor.doc = { ...editor.doc, designTokens: structuredClone(designTokens), designMd, designSystemId };
    }),
  };
  return editor;
}

beforeEach(() => setSetting(CUSTOM_DESIGN_SYSTEMS_SETTING, null));

describe("design system registry", () => {
  it("lists the five built-in presets as read-only, valid document systems", () => {
    const presets = listDesignSystems().filter((system) => system.builtIn);
    expect(presets.map((system) => system.id)).toEqual(["studio", "wellness", "commerce", "editorial", "analytics"]);
    expect(presets.map((system) => system.id)).toEqual(Object.keys(DESIGN_SYSTEMS));
    for (const preset of presets) {
      expect(() => validateDesignTokens(preset.designTokens)).not.toThrow();
      expect(preset.designMd).toContain(preset.id);
      expect(Object.isFrozen(preset)).toBe(true);
    }
    expect(presets[0].designTokens.colors.action).toBe(DESIGN_SYSTEMS.studio.tokens.primitive.colors.brand);
    expect(presets[0].designTokens.components.button.paddingX).toBe(24);
  });

  it("rejects renaming or deleting a built-in preset", () => {
    expect(() => renameDesignSystem([], "studio", "Mine")).toThrow(/read-only/);
    expect(() => deleteDesignSystem([], "studio")).toThrow(/read-only/);
    expect(() => deleteDesignSystem([], "custom-missing")).toThrow(/not-found/);
  });

  it("selecting a preset writes its tokens, markdown and id in one undoable step", () => {
    const editor = fakeEditor({ designTokens: { old: true } });
    const preset = BUILT_IN_DESIGN_SYSTEMS.find((system) => system.id === "editorial");
    applyDesignSystemToDocument(editor, preset);
    expect(editor.setDesignSystem).toHaveBeenCalledTimes(1);
    expect(editor.history).toHaveLength(1);
    expect(editor.doc.designTokens).toEqual(preset.designTokens);
    expect(editor.doc.designTokens).not.toBe(preset.designTokens);
    expect(editor.doc.designMd).toBe(preset.designMd);
    expect(editor.doc.designSystemId).toBe("editorial");
    expect(() => applyDesignSystemToDocument({ getDocument: () => null }, preset)).toThrow(/no-document/);
  });

  it("editing a preset creates a named copy and leaves the preset unchanged", () => {
    const preset = BUILT_IN_DESIGN_SYSTEMS.find((system) => system.id === "studio");
    const before = structuredClone(preset);
    const tokens = structuredClone(preset.designTokens);
    tokens.colors.action = "#ff0000";
    const { list, system } = saveDesignSystemEdits([], preset, { designTokens: tokens, designMd: "# mine" }, "Studio copy");
    expect(system).toMatchObject({ name: "Studio copy", builtIn: false, designMd: "# mine" });
    expect(system.id).not.toBe("studio");
    expect(system.designTokens.colors.action).toBe("#ff0000");
    expect(list).toEqual([system]);
    expect(preset).toEqual(before);
    expect(listDesignSystems(list).find((entry) => entry.id === "studio").designTokens.colors.action).toBe(before.designTokens.colors.action);
  });

  it("persists custom systems and their edits through the settings store", async () => {
    const preset = BUILT_IN_DESIGN_SYSTEMS[0];
    const { list, system } = duplicateDesignSystem([], preset, "Brand");
    await saveCustomDesignSystems(list);
    expect(getSetting(CUSTOM_DESIGN_SYSTEMS_SETTING)).toHaveLength(1);
    expect(loadCustomDesignSystems()).toEqual(list);

    const tokens = structuredClone(system.designTokens);
    tokens.radius.card = 99;
    const edited = saveDesignSystemEdits(list, system, { designTokens: tokens, designMd: "# v2" }, "unused");
    expect(edited.list).toHaveLength(1);
    expect(edited.system.id).toBe(system.id);
    await saveCustomDesignSystems(edited.list);
    expect(loadCustomDesignSystems()[0].designTokens.radius.card).toBe(99);
    expect(loadCustomDesignSystems()[0].designMd).toBe("# v2");

    const renamed = renameDesignSystem(edited.list, system.id, "  Renamed ");
    expect(renamed.system.name).toBe("Renamed");
    expect(() => renameDesignSystem(edited.list, system.id, "   ")).toThrow(/invalid-name/);
    expect(deleteDesignSystem(renamed.list, system.id)).toEqual([]);
  });

  it("drops persisted entries that fail the token contract", () => {
    setSetting(CUSTOM_DESIGN_SYSTEMS_SETTING, [
      { id: "custom-bad", name: "Bad", designTokens: { colors: {} }, designMd: "" },
      { id: "custom-ok", name: "Ok", designTokens: structuredClone(BUILT_IN_DESIGN_SYSTEMS[0].designTokens), designMd: "x" },
    ]);
    expect(loadCustomDesignSystems().map((system) => system.id)).toEqual(["custom-ok"]);
  });

  it("keeps the applied copy and id self-contained in the saved document, and feeds only the copy to the agent", () => {
    const preset = BUILT_IN_DESIGN_SYSTEMS[1];
    const doc = { ...createDocument(800, 600), designTokens: preset.designTokens, designMd: preset.designMd, designSystemId: preset.id };
    const restored = deserialiseDocument(JSON.parse(JSON.stringify(serialiseDocument(doc))));
    expect(restored.designSystemId).toBe("wellness");
    expect(restored.designTokens).toEqual(preset.designTokens);
    const context = buildDocumentDesignContext(restored);
    expect(context).toContain(JSON.stringify(preset.designTokens));
    expect(context).not.toContain("designSystemId");
    expect(designSystemFields({ designSystemId: 3 })).toEqual({});
  });

  it("engine setDesignSystem stores the id with a single setDoc call", () => {
    const source = readFileSync("src/canvas/editor/editor_engine.js", "utf8");
    const body = source.slice(source.indexOf("setDesignSystem({"), source.indexOf("getZoom:"));
    expect(body.match(/setDoc\(/g)).toHaveLength(1);
    expect(body).toContain("next.designSystemId = designSystemId");
    expect(body).toContain("delete next.designSystemId");
  });
});
