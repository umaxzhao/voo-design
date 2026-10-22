import { describe, it, expect } from "vitest";
import {
  VARIABLE_TYPES,
  LEGACY_COLLECTION_ID,
  DEFAULT_MODE_ID,
  normalizeColorVariables,
  normalizeColorVariablesV1,
  normalizeVariablesV2,
  normalizeVariableValue,
  variablesFromLegacyColorVariables,
  getVariablesModel,
  findVariable,
  activeModeId,
  variableValue,
  legacyColorVariablesFromModel,
  migrateColorVariablesV1,
  resolveDocumentVariables,
  setActiveCollectionMode,
  setVariableValue,
  addCollection,
  renameCollection,
  deleteCollection,
  addMode,
  renameMode,
  deleteMode,
  addVariable,
  renameVariable,
  deleteVariable,
  bindVariable,
  createVariablesPanelActions,
  serializeVariables,
  deserializeVariables,
  addColorVariable,
  bindColorVariable,
  deleteColorVariable,
  updateColorVariable,
} from "../../src/canvas/editor/scene_variables.js";
import * as legacyModule from "../../src/canvas/editor/scene_color_variables.js";

const hex = (n) => `#${String(n).padStart(6, "0")}`;

function legacyDoc() {
  return {
    id: "doc-1",
    width: 800,
    height: 600,
    colorVariables: [
      { id: "brand", name: "Brand", value: "#7c5cff" },
      { id: "ink", name: "Ink", value: "#111111" },
    ],
    nodes: [
      { id: "n1", kind: "rect", fill: "#7c5cff", fillVariableId: "brand" },
      { id: "n2", kind: "rect", fill: "#000000", stroke: "#7c5cff", strokeVariableId: "brand" },
      { id: "n3", kind: "rect", fill: "#ffffff" },
    ],
  };
}

function v2Doc() {
  return {
    id: "doc-2",
    nodes: [
      { id: "rect", kind: "rect", fill: "#ffffff", fillVariableId: "brand" },
      { id: "text", kind: "text", text: "Placeholder", textVariableId: "label" },
      { id: "number", kind: "rect", opacity: 1, opacityVariableId: "fade", cornerRadius: 0, cornerRadiusVariableId: "radius" },
    ],
    variablesV2: {
      version: 2,
      collections: [
        {
          id: "core",
          name: "Core",
          modes: [
            { id: "light", name: "Light" },
            { id: "dark", name: "Dark" },
          ],
          variables: [
            {
              id: "brand",
              name: "Brand",
              type: "color",
              valuesByMode: { light: "#7c5cff", dark: "#a78bfa" },
            },
            {
              id: "label",
              name: "Label",
              type: "string",
              valuesByMode: { light: "Hello", dark: "Dark hello" },
            },
            {
              id: "fade",
              name: "Fade",
              type: "number",
              valuesByMode: { light: 0.5, dark: 1 },
            },
            {
              id: "radius",
              name: "Radius",
              type: "number",
              valuesByMode: { light: 8, dark: 16 },
            },
            {
              id: "enabled",
              name: "Enabled",
              type: "boolean",
              valuesByMode: { light: true, dark: false },
            },
          ],
        },
        {
          id: "palette",
          name: "Palette",
          modes: [{ id: "light", name: "Light" }],
          variables: [
            {
              id: "accent",
              name: "Accent",
              type: "color",
              valuesByMode: { light: "#00ff00" },
            },
          ],
        },
      ],
      activeModeByCollection: { core: "light", palette: "light" },
    },
  };
}

describe("v1 normaliser compatibility", () => {
  it("keeps the original normalisation rules", () => {
    const input = [
      { id: "a", name: "A", value: "#ABCDEF" },
      { id: "a", name: "Duplicate", value: "#000000" },
      { id: "b", name: "B", value: "not-a-color" },
      { id: "", name: "C", value: "#fff" },
      { id: "d", name: "  D  ", value: "  #123456  " },
      null,
    ];
    expect(normalizeColorVariables(input)).toEqual([
      { id: "a", name: "A", value: "#ABCDEF" },
      { id: "d", name: "D", value: "#123456" },
    ]);
    expect(normalizeColorVariables("nope")).toEqual([]);
    expect(normalizeColorVariablesV1).toBe(normalizeColorVariables);
  });

  it("is re-exported unchanged by the compatibility module", () => {
    expect(legacyModule.normalizeColorVariables).toBe(normalizeColorVariables);
    expect(legacyModule.addColorVariable).toBe(addColorVariable);
    expect(legacyModule.updateColorVariable).toBe(updateColorVariable);
    const legacy = legacyDoc();
    expect(legacyModule.normalizeColorVariables(legacy.colorVariables)).toEqual(
      normalizeColorVariables(legacy.colorVariables),
    );
  });

  it("legacy ops still behave exactly like v1 on a v1 document", () => {
    const doc = legacyDoc();
    const added = addColorVariable(doc, { id: "accent", name: "Accent", value: "#00ff00" });
    expect(added.colorVariables).toHaveLength(3);
    expect(added).not.toBe(doc);
    expect(() =>
      addColorVariable(doc, { id: "brand", name: "Dup", value: "#ffffff" }),
    ).toThrow("color-variable-invalid");
    expect(() =>
      addColorVariable(doc, { id: "bad", name: "Bad", value: "red" }),
    ).toThrow("color-variable-invalid");

    const bound = bindColorVariable(doc, "n3", "brand");
    expect(bound.nodes.find((node) => node.id === "n3")).toMatchObject({
      fill: "#7c5cff",
      fillVariableId: "brand",
    });
    const unbound = bindColorVariable(doc, "n1", null);
    expect(unbound.nodes.find((node) => node.id === "n1").fillVariableId).toBeNull();
    expect(() => bindColorVariable(doc, "missing", "brand")).toThrow(
      "color-variable-node-missing",
    );
    expect(() => bindColorVariable(doc, "n1", "nope")).toThrow(
      "color-variable-missing",
    );

    const updated = updateColorVariable(doc, "brand", { value: "#ffffff" });
    expect(updated.colorVariables.find((item) => item.id === "brand").value).toBe(
      "#ffffff",
    );
    expect(updated.nodes.find((node) => node.id === "n1").fill).toBe("#ffffff");
    expect(updated.nodes.find((node) => node.id === "n2").stroke).toBe("#ffffff");

    const deleted = deleteColorVariable(doc, "brand");
    expect(deleted.colorVariables.map((item) => item.id)).toEqual(["ink"]);
    expect(deleted.nodes.find((node) => node.id === "n1").fillVariableId).toBeNull();
    expect(deleted.nodes.find((node) => node.id === "n2").strokeVariableId).toBeNull();
    expect(() => deleteColorVariable(doc, "nope")).toThrow("color-variable-missing");
  });
});

describe("v1 -> v2 migration", () => {
  it("creates a Colors collection while preserving ids and bindings", () => {
    const doc = legacyDoc();
    const migrated = migrateColorVariablesV1(doc);
    const model = getVariablesModel(migrated);
    expect(model.collections).toHaveLength(1);
    const [colors] = model.collections;
    expect(colors.id).toBe(LEGACY_COLLECTION_ID);
    expect(colors.name).toBe("Colors");
    expect(colors.modes).toEqual([{ id: DEFAULT_MODE_ID, name: "Default" }]);
    expect(colors.variables.map((variable) => variable.id)).toEqual(["brand", "ink"]);
    expect(colors.variables[0]).toMatchObject({
      name: "Brand",
      type: "color",
      valuesByMode: { [DEFAULT_MODE_ID]: "#7c5cff" },
    });
    expect(model.activeModeByCollection).toEqual({
      [LEGACY_COLLECTION_ID]: DEFAULT_MODE_ID,
    });
    // Bindings survive; nodes still resolve to the same values.
    expect(migrated.nodes.find((node) => node.id === "n1").fillVariableId).toBe("brand");
    expect(migrated.nodes.find((node) => node.id === "n1").fill).toBe("#7c5cff");
    expect(migrated.nodes.find((node) => node.id === "n2").stroke).toBe("#7c5cff");
    // The v1 mirror stays available for the old UI/serialiser.
    expect(normalizeColorVariables(migrated.colorVariables)).toEqual(
      normalizeColorVariables(doc.colorVariables),
    );
  });

  it("is idempotent", () => {
    const once = migrateColorVariablesV1(legacyDoc());
    const twice = migrateColorVariablesV1(once);
    expect(twice).toEqual(once);
    expect(migrateColorVariablesV1(twice)).toEqual(once);
  });

  it("returns a document without variables untouched", () => {
    const doc = { id: "empty", nodes: [] };
    expect(migrateColorVariablesV1(doc)).toBe(doc);
    const malformed = { id: "x", colorVariables: "bad", nodes: [] };
    expect(migrateColorVariablesV1(malformed)).toBe(malformed);
  });

  it("merges legacy colours added after a first migration", () => {
    const migrated = migrateColorVariablesV1(legacyDoc());
    const later = {
      ...migrated,
      colorVariables: [
        ...migrated.colorVariables,
        { id: "late", name: "Late", value: "#abcdef" },
      ],
    };
    const merged = migrateColorVariablesV1(later);
    const colors = getVariablesModel(merged).collections[0];
    expect(colors.variables.map((variable) => variable.id)).toEqual([
      "brand",
      "ink",
      "late",
    ]);
    expect(migrateColorVariablesV1(merged)).toEqual(merged);
  });
});

describe("normalisation / validation (never throws)", () => {
  it("drops duplicates, bad types, bad values and unknown modes", () => {
    const model = normalizeVariablesV2({
      collections: [
        {
          id: "c1",
          name: " One ",
          modes: [
            { id: "light", name: "Light" },
            { id: "light", name: "Duplicate mode" },
            { id: "bad" },
          ],
          variables: [
            { id: "v1", name: "V1", type: "color", valuesByMode: { light: "#fff", bad: "#000", ghost: "#111" } },
            { id: "v1", name: "Dup", type: "color", valuesByMode: { light: "#000" } },
            { id: "v2", name: "V2", type: "wat", valuesByMode: { light: "x" } },
            { id: "v3", name: "V3", type: "number", valuesByMode: { light: Number.NaN } },
            { id: "v4", name: "V4", type: "number", valuesByMode: { light: "12.5" } },
            { id: "v5", name: "V5", type: "boolean", valuesByMode: { light: "true" } },
          ],
        },
        { id: "c1", name: "Duplicate collection", modes: [], variables: [] },
        { id: "c2", modes: [], variables: [] },
        null,
      ],
      activeModeByCollection: { c1: "ghost", c2: "nope", unknown: "light" },
    });
    expect(model.collections.map((collection) => collection.id)).toEqual(["c1", "c2"]);
    const [c1, c2] = model.collections;
    expect(c1.name).toBe("One");
    expect(c1.modes.map((mode) => mode.id)).toEqual(["light", "bad"]);
    expect(c1.variables.map((variable) => variable.id)).toEqual(["v1", "v4", "v5"]);
    expect(c1.variables[0].valuesByMode).toEqual({ light: "#fff", bad: "#000" });
    expect(c1.variables[1].valuesByMode).toEqual({ light: 12.5, bad: 12.5 });
    expect(c1.variables[2].valuesByMode).toEqual({ light: true, bad: true });
    // Empty mode list repaired with a default mode; invalid active mode repaired.
    expect(c2.modes).toEqual([{ id: DEFAULT_MODE_ID, name: "Default" }]);
    expect(model.activeModeByCollection).toEqual({
      c1: "light",
      c2: DEFAULT_MODE_ID,
    });
  });

  it("tolerates garbage without throwing", () => {
    for (const input of [null, undefined, [], "x", 42, { collections: "x" }, { collections: [null] }]) {
      expect(() => normalizeVariablesV2(input)).not.toThrow();
      expect(normalizeVariablesV2(input).collections).toEqual([]);
    }
    expect(() => deserializeVariables(null)).not.toThrow();
    expect(deserializeVariables(null)).toEqual({});
    expect(() => migrateColorVariablesV1(null)).not.toThrow();
    expect(() => resolveDocumentVariables(null)).not.toThrow();
    expect(resolveDocumentVariables({ nodes: "bad" })).toEqual({ nodes: "bad" });
  });

  it("validates values by type", () => {
    expect(normalizeVariableValue("color", "#abc")).toEqual({ ok: true, value: "#abc" });
    expect(normalizeVariableValue("color", "#AABBCCDD")).toEqual({ ok: true, value: "#AABBCCDD" });
    expect(normalizeVariableValue("color", "abc").ok).toBe(false);
    expect(normalizeVariableValue("number", 0)).toEqual({ ok: true, value: 0 });
    expect(normalizeVariableValue("number", "3")).toEqual({ ok: true, value: 3 });
    expect(normalizeVariableValue("number", Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(normalizeVariableValue("number", Number.NaN).ok).toBe(false);
    expect(normalizeVariableValue("number", "abc").ok).toBe(false);
    expect(normalizeVariableValue("string", "hi")).toEqual({ ok: true, value: "hi" });
    expect(normalizeVariableValue("string", 4)).toEqual({ ok: true, value: "4" });
    expect(normalizeVariableValue("boolean", false)).toEqual({ ok: true, value: false });
    expect(normalizeVariableValue("boolean", "false")).toEqual({ ok: true, value: false });
    expect(normalizeVariableValue("boolean", 0).ok).toBe(false);
    expect(normalizeVariableValue("bogus", "x").ok).toBe(false);
    expect(VARIABLE_TYPES).toEqual(["color", "number", "string", "boolean"]);
  });

  it("rebuilds a model from the v1 list", () => {
    const model = variablesFromLegacyColorVariables([{ id: "a", name: "A", value: "#000000" }]);
    expect(model.collections[0].variables[0]).toMatchObject({
      id: "a",
      type: "color",
      valuesByMode: { [DEFAULT_MODE_ID]: "#000000" },
    });
    expect(variablesFromLegacyColorVariables([]).collections).toEqual([]);
  });
});

describe("serialisation helpers", () => {
  it("round-trips through serializeVariables / deserializeVariables", () => {
    const doc = v2Doc();
    const patch = serializeVariables(doc);
    expect(Object.keys(patch)).toEqual(["variablesV2"]);
    const raw = JSON.parse(JSON.stringify(patch));
    const restored = deserializeVariables(raw);
    expect(restored.variablesV2).toEqual(getVariablesModel(doc));
    // The v1 mirror is included so the existing fill/stroke resolution works.
    expect(restored.colorVariables).toEqual(
      legacyColorVariablesFromModel(getVariablesModel(doc)),
    );
  });

  it("serialises legacy documents as migrated v2 + v1 mirror", () => {
    const doc = legacyDoc();
    const restored = deserializeVariables(JSON.parse(JSON.stringify(doc)));
    expect(getVariablesModel(restored).collections[0].id).toBe(LEGACY_COLLECTION_ID);
    expect(restored.colorVariables).toEqual(normalizeColorVariables(doc.colorVariables));
  });

  it("returns {} for documents without variables", () => {
    expect(serializeVariables({ nodes: [] })).toEqual({});
    expect(serializeVariables(null)).toEqual({});
    expect(deserializeVariables({ nodes: [] })).toEqual({});
  });

  it("drops stale variablesV2 when it normalises to nothing", () => {
    const doc = { ...legacyDoc(), variablesV2: { collections: [] } };
    const restored = deserializeVariables(doc);
    expect(getVariablesModel(restored).collections).toHaveLength(1);
  });
});

describe("resolution of bound node properties", () => {
  it("resolves colour, number and string bindings from the active modes", () => {
    const resolved = resolveDocumentVariables(v2Doc());
    expect(resolved.nodes[0]).toMatchObject({ fill: "#7c5cff", fillVariableId: "brand" });
    expect(resolved.nodes[1]).toMatchObject({ text: "Hello", textVariableId: "label" });
    expect(resolved.nodes[2]).toMatchObject({
      opacity: 0.5,
      opacityVariableId: "fade",
      cornerRadius: 8,
      cornerRadiusVariableId: "radius",
    });
  });

  it("leaves unresolved bindings in place and keeps current values", () => {
    const doc = v2Doc();
    doc.nodes = [
      { id: "a", fill: "#123456", fillVariableId: "missing" },
      { id: "b", text: "keep", textVariableId: "label" },
    ];
    const resolved = resolveDocumentVariables(doc);
    expect(resolved.nodes[0]).toEqual({ id: "a", fill: "#123456", fillVariableId: "missing" });
    expect(resolved.nodes[1].text).toBe("Hello");
  });

  it("clamps numeric bindings to their valid ranges", () => {
    const doc = v2Doc();
    doc.variablesV2.collections[0].variables.find((v) => v.id === "fade").valuesByMode.light = 4;
    doc.variablesV2.collections[0].variables.find((v) => v.id === "radius").valuesByMode.light = -5;
    const resolved = resolveDocumentVariables(doc);
    expect(resolved.nodes[2].opacity).toBe(1);
    expect(resolved.nodes[2].cornerRadius).toBe(0);
  });

  it("is a no-op for documents without v2 variables", () => {
    const doc = legacyDoc();
    expect(resolveDocumentVariables(doc)).toBe(doc);
  });
});

describe("mode switching", () => {
  it("re-resolves bound values without losing bindings", () => {
    const doc = v2Doc();
    const dark = setActiveCollectionMode(doc, "core", "dark");
    expect(dark).not.toBe(doc);
    expect(dark.variablesV2.activeModeByCollection.core).toBe("dark");
    expect(dark.nodes[0]).toMatchObject({ fill: "#a78bfa", fillVariableId: "brand" });
    expect(dark.nodes[1]).toMatchObject({ text: "Dark hello", textVariableId: "label" });
    expect(dark.nodes[2]).toMatchObject({ opacity: 1, cornerRadius: 16 });
    // Switching back restores the first mode and keeps bindings.
    const light = setActiveCollectionMode(dark, "core", "light");
    expect(light.nodes[0]).toMatchObject({ fill: "#7c5cff", fillVariableId: "brand" });
    expect(light.nodes[1].text).toBe("Hello");
    // Unrelated collections keep their own active mode and bindings.
    expect(dark.variablesV2.activeModeByCollection.palette).toBe("light");
  });

  it("rejects unknown collection/mode ids", () => {
    expect(() => setActiveCollectionMode(v2Doc(), "nope", "dark")).toThrow(
      "variable-collection-missing",
    );
    expect(() => setActiveCollectionMode(v2Doc(), "core", "nope")).toThrow(
      "variable-mode-missing",
    );
  });

  it("migrates a legacy document before switching modes", () => {
    const migrated = setActiveCollectionMode(legacyDoc(), LEGACY_COLLECTION_ID, DEFAULT_MODE_ID);
    expect(getVariablesModel(migrated).collections).toHaveLength(1);
    expect(migrated.nodes[0].fill).toBe("#7c5cff");
  });
});

describe("value edits", () => {
  it("updates the active mode value and bound nodes", () => {
    const doc = v2Doc();
    const next = setVariableValue(doc, "brand", "light", "#000000");
    expect(next.nodes[0]).toMatchObject({ fill: "#000000", fillVariableId: "brand" });
    expect(variableValue(next, "brand")).toBe("#000000");
    // The v1 mirror follows the active mode.
    expect(next.colorVariables.find((item) => item.id === "brand").value).toBe("#000000");
  });

  it("does not touch bound nodes when editing an inactive mode", () => {
    const doc = v2Doc();
    const next = setVariableValue(doc, "brand", "dark", "#000000");
    expect(next.nodes[0].fill).toBe("#7c5cff");
    expect(vnext(next)).toBe("#000000");
    const switched = setActiveCollectionMode(next, "core", "dark");
    expect(switched.nodes[0].fill).toBe("#000000");
  });

  it("validates the value against the variable type", () => {
    const doc = v2Doc();
    expect(() => setVariableValue(doc, "brand", "light", "not-a-colour")).toThrow(
      "variable-value-invalid",
    );
    expect(() => setVariableValue(doc, "fade", "light", "x")).toThrow(
      "variable-value-invalid",
    );
    expect(() => setVariableValue(doc, "nope", "light", "#fff")).toThrow(
      "variable-missing",
    );
    expect(() => setVariableValue(doc, "brand", "nope", "#fff")).toThrow(
      "variable-mode-missing",
    );
    expect(setVariableValue(doc, "fade", "light", 0.25).nodes[2].opacity).toBe(0.25);
  });
});

// Read the Inactive-mode value through the model to avoid duplicating logic.
function vnext(doc) {
  const model = getVariablesModel(doc);
  return model.collections.find((collection) => collection.id === "core").variables.find(
    (variable) => variable.id === "brand",
  ).valuesByMode.dark;
}

describe("CRUD", () => {
  it("adds, renames and deletes collections", () => {
    const added = addCollection(v2Doc(), { id: "extra", name: "Extra" });
    expect(getVariablesModel(added).collections.map((collection) => collection.id)).toEqual([
      "core",
      "palette",
      "extra",
    ]);
    const renamed = renameCollection(added, "extra", "Renamed");
    expect(getVariablesModel(renamed).collections.at(-1).name).toBe("Renamed");
    expect(() => addCollection(added, { id: "core", name: "Dup" })).toThrow(
      "variable-collection-duplicate",
    );
    expect(() => renameCollection(added, "nope", "X")).toThrow(
      "variable-collection-missing",
    );
    const deleted = deleteCollection(added, "core");
    expect(getVariablesModel(deleted).collections.map((collection) => collection.id)).toEqual([
      "palette",
      "extra",
    ]);
    // Bindings to the deleted collection's variables are cleared.
    expect(deleted.nodes[0].fillVariableId).toBeNull();
    expect(deleted.nodes[1].textVariableId).toBeNull();
    expect(deleted.nodes[2].opacityVariableId).toBeNull();
    expect(getVariablesModel(deleted).activeModeByCollection.core).toBeUndefined();
  });

  it("adds, renames and deletes modes with default fallback", () => {
    const added = addMode(v2Doc(), "core", { id: "hc", name: "High contrast" });
    const core = getVariablesModel(added).collections.find((c) => c.id === "core");
    expect(core.modes.map((mode) => mode.id)).toEqual(["light", "dark", "hc"]);
    // New modes start with a copy of the default mode's values.
    expect(core.variables.find((v) => v.id === "brand").valuesByMode.hc).toBe("#7c5cff");
    const renamed = renameMode(added, "core", "hc", "Contrast");
    expect(getVariablesModel(renamed).collections[0].modes.at(-1).name).toBe("Contrast");
    expect(() => addMode(added, "core", { id: "light" })).toThrow("variable-mode-duplicate");

    const darkDoc = setActiveCollectionMode(added, "core", "dark");
    const removedDark = deleteMode(darkDoc, "core", "dark");
    const coreAfter = getVariablesModel(removedDark).collections[0];
    expect(coreAfter.modes.map((mode) => mode.id)).toEqual(["light", "hc"]);
    expect(coreAfter.variables.find((v) => v.id === "brand").valuesByMode.dark).toBeUndefined();
    // Deleting the active mode falls back to the collected default.
    expect(getVariablesModel(removedDark).activeModeByCollection.core).toBe("light");
    expect(removedDark.nodes[0].fill).toBe("#7c5cff");

    const oneMode = addCollection(v2Doc(), { id: "single", name: "Single" });
    expect(() => deleteMode(oneMode, "single", DEFAULT_MODE_ID)).toThrow(
      "variable-mode-invalid",
    );
    expect(() => deleteMode(oneMode, "single", "nope")).toThrow("variable-mode-missing");
  });

  it("adds, renames and deletes variables", () => {
    const added = addVariable(v2Doc(), "core", {
      id: "spacing",
      name: "Spacing",
      type: "number",
      value: 8,
    });
    const core = getVariablesModel(added).collections.find((c) => c.id === "core");
    const spacing = core.variables.find((variable) => variable.id === "spacing");
    expect(spacing.valuesByMode).toEqual({ light: 8, dark: 8 });
    expect(() =>
      addVariable(added, "core", { id: "spacing", name: "Dup", type: "number", value: 1 }),
    ).toThrow("variable-duplicate");
    expect(() =>
      addVariable(added, "core", { id: "bad", name: "Bad", type: "regex", value: "x" }),
    ).toThrow("variable-type-invalid");
    expect(() =>
      addVariable(added, "core", { id: "bad2", name: "Bad", type: "color", value: "red" }),
    ).toThrow("variable-value-invalid");

    const renamed = renameVariable(added, "spacing", "Gap");
    expect(
      getVariablesModel(renamed).collections[0].variables.find((v) => v.id === "spacing").name,
    ).toBe("Gap");

    const deleted = deleteVariable(added, "brand");
    expect(
      getVariablesModel(deleted).collections[0].variables.some((variable) => variable.id === "brand"),
    ).toBe(false);
    expect(deleted.nodes[0].fillVariableId).toBeNull();
    expect(() => deleteVariable(added, "nope")).toThrow("variable-missing");
  });

  it("binds and unbinds node variables with type checks", () => {
    const doc = v2Doc();
    const bound = bindVariable(doc, "rect", "accent", "stroke");
    const rect = bound.nodes.find((node) => node.id === "rect");
    expect(rect).toMatchObject({ stroke: "#00ff00", strokeVariableId: "accent", fillVariableId: "brand" });
    expect(() => bindVariable(doc, "rect", "accent", "opacity")).toThrow(
      "variable-type-mismatch",
    );
    expect(() => bindVariable(doc, "rect", "brand", "nope")).toThrow(
      "variable-binding-invalid",
    );
    expect(() => bindVariable(doc, "missing", "brand", "fill")).toThrow(
      "variable-node-missing",
    );
    const unbound = bindVariable(bound, "rect", null, "stroke");
    expect(unbound.nodes.find((node) => node.id === "rect").strokeVariableId).toBeNull();
    expect(unbound.nodes.find((node) => node.id === "rect").stroke).toBe("#00ff00");
  });

  it("keeps the legacy colour API working on a v2 document", () => {
    const migrated = migrateColorVariablesV1(legacyDoc());
    const updated = updateColorVariable(migrated, "brand", { value: "#ffffff" });
    expect(updated.nodes.find((node) => node.id === "n1").fill).toBe("#ffffff");
    expect(updated.colorVariables.find((item) => item.id === "brand").value).toBe("#ffffff");
    expect(getVariablesModel(updated).collections[0].variables[0].valuesByMode[DEFAULT_MODE_ID]).toBe(
      "#ffffff",
    );

    const renamed = updateColorVariable(updated, "brand", { name: "Primary" });
    expect(renamed.colorVariables.find((item) => item.id === "brand").name).toBe("Primary");

    const added = addColorVariable(updated, { id: "accent", name: "Accent", value: "#00ff00" });
    expect(getVariablesModel(added).collections[0].variables.map((v) => v.id)).toContain("accent");
    expect(added.colorVariables.map((item) => item.id)).toContain("accent");

    const bound = bindColorVariable(added, "n3", "accent");
    expect(bound.nodes.find((node) => node.id === "n3")).toMatchObject({
      fill: "#00ff00",
      fillVariableId: "accent",
    });

    const removed = deleteColorVariable(bound, "accent");
    expect(removed.nodes.find((node) => node.id === "n3").fillVariableId).toBeNull();
    expect(getVariablesModel(removed).collections[0].variables.map((v) => v.id)).not.toContain(
      "accent",
    );
  });
});

describe("queries", () => {
  it("finds variables and active modes", () => {
    const doc = v2Doc();
    const found = findVariable(doc, "accent");
    expect(found.collection.id).toBe("palette");
    expect(found.variable.type).toBe("color");
    expect(findVariable(doc, "missing")).toBeNull();
    expect(activeModeId(getVariablesModel(doc), "palette")).toBe("light");
    expect(activeModeId(getVariablesModel(doc), "missing")).toBeNull();
    expect(variableValue(doc, "brand")).toBe("#7c5cff");
    expect(variableValue(doc, "missing")).toBeNull();
  });

  it("mirrors colour variables in the v1 list from the active mode", () => {
    const dark = setActiveCollectionMode(migrateColorVariablesV1(legacyDoc()), LEGACY_COLLECTION_ID, DEFAULT_MODE_ID);
    expect(legacyColorVariablesFromModel(getVariablesModel(dark))).toEqual([
      { id: "brand", name: "Brand", value: "#7c5cff" },
      { id: "ink", name: "Ink", value: "#111111" },
    ]);
    // Only the legacy Colors collection is mirrored; other collections do not
    // leak into the v1 list.
    const doc = v2Doc();
    expect(legacyColorVariablesFromModel(getVariablesModel(doc))).toEqual([
      { id: "brand", name: "Brand", value: "#7c5cff" },
    ]);
  });
});

describe("panel action factory", () => {
  function harness(doc) {
    let current = doc;
    const commits = [];
    return {
      get current() {
        return current;
      },
      commits,
      actions: createVariablesPanelActions({
        getDocument: () => current,
        commit: (next, options) => {
          commits.push({ next, options });
          current = next;
        },
        getNodeId: () => "n3",
        historyName: "editor.history.entry.variables",
      }),
    };
  }

  it("commits one document per action with a history name", () => {
    const store = harness(legacyDoc());
    store.actions.addCollection({ id: "brands", name: "Brands" });
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0].options).toEqual({ name: "editor.history.entry.variables" });
    expect(getVariablesModel(store.current).collections.map((c) => c.id)).toContain("brands");

    store.actions.setActiveMode(LEGACY_COLLECTION_ID, DEFAULT_MODE_ID);
    store.actions.renameCollection("brands", "Brands 2");
    store.actions.addMode("brands", { name: "Dark" });
    store.actions.deleteMode("brands", DEFAULT_MODE_ID);
    store.actions.renameVariable("brand", "Primary");
    store.actions.updateValue("brand", DEFAULT_MODE_ID, "#ffffff");
    store.actions.deleteVariable("ink");
    store.actions.deleteCollection("brands");
    expect(store.commits).toHaveLength(9);
    for (const commit of store.commits.slice(1)) {
      expect(commit.options).toEqual({ name: "editor.history.entry.variables" });
    }
  });

  it("creates typed variables with defaults and binds the selected node", () => {
    const store = harness(migrateColorVariablesV1(legacyDoc()));
    store.actions.addVariable(LEGACY_COLLECTION_ID, "number");
    store.actions.addVariable(LEGACY_COLLECTION_ID, "boolean");
    const collection = getVariablesModel(store.current).collections[0];
    expect(collection.variables.at(-2)).toMatchObject({
      name: "Number 1",
      type: "number",
      valuesByMode: { [DEFAULT_MODE_ID]: 0 },
    });
    expect(collection.variables.at(-1)).toMatchObject({
      name: "Boolean 1",
      type: "boolean",
      valuesByMode: { [DEFAULT_MODE_ID]: false },
    });
    store.actions.bind("brand");
    expect(store.current.nodes.find((node) => node.id === "n3")).toMatchObject({
      fill: "#7c5cff",
      fillVariableId: "brand",
    });
    store.actions.bind(null);
    expect(store.current.nodes.find((node) => node.id === "n3").fillVariableId).toBeNull();
  });

  it("does not expose bind without a node resolver", () => {
    const actions = createVariablesPanelActions({
      getDocument: () => legacyDoc(),
      commit: () => {},
    });
    expect(actions.bind).toBeUndefined();
  });
});

describe("first-use seeding (no variablesV2 on the document)", () => {
  function freshHarness(doc, nodeId = "n1") {
    let current = doc;
    const commits = [];
    const actions = createVariablesPanelActions({
      getDocument: () => current,
      commit: (next, options) => {
        commits.push({ next, options });
        current = next;
      },
      getNodeId: () => nodeId,
      historyName: "editor.history.entry.variables",
    });
    return {
      actions,
      commits,
      get current() {
        return current;
      },
    };
  }

  it("addCollection creates variablesV2 on a completely fresh document", () => {
    const store = freshHarness({ id: "fresh", width: 100, height: 100, nodes: [] });
    expect(() => store.actions.addCollection({ id: "brand", name: "Brand" })).not.toThrow();
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0].options).toEqual({ name: "editor.history.entry.variables" });
    const model = getVariablesModel(store.current);
    expect(model.collections.map((collection) => collection.id)).toEqual(["brand"]);
    expect(store.current.colorVariables).toEqual([]);
  });

  it("seeds from legacy colour variables on the first typed action", () => {
    const store = freshHarness(legacyDoc());
    // Legacy ids and node bindings survive the implicit migration.
    store.actions.addVariable(LEGACY_COLLECTION_ID, "number");
    expect(store.commits).toHaveLength(1);
    const seeded = getVariablesModel(store.current);
    expect(seeded.collections).toHaveLength(1);
    expect(seeded.collections[0].id).toBe(LEGACY_COLLECTION_ID);
    expect(
      seeded.collections[0].variables.slice(0, 2).map((variable) => variable.id),
    ).toEqual(["brand", "ink"]);
    expect(seeded.collections[0].variables.at(-1)).toMatchObject({
      name: "Number 1",
      type: "number",
      valuesByMode: { [DEFAULT_MODE_ID]: 0 },
    });
    expect(store.current.colorVariables.map((item) => item.id)).toEqual(["brand", "ink"]);
    expect(store.current.nodes.find((node) => node.id === "n1")).toMatchObject({
      fill: "#7c5cff",
      fillVariableId: "brand",
    });

    // Legacy-colour operations work immediately after seeding.
    store.actions.updateValue("brand", DEFAULT_MODE_ID, "#ffffff");
    expect(store.current.nodes.find((node) => node.id === "n1").fill).toBe("#ffffff");
    store.actions.bind("ink");
    expect(store.current.nodes.find((node) => node.id === "n1")).toMatchObject({
      fill: "#111111",
      fillVariableId: "ink",
    });
    expect(store.commits).toHaveLength(3);
  });

  it("seeds idempotently: the second action does not duplicate the legacy collection", () => {
    const store = freshHarness(legacyDoc());
    store.actions.addCollection({ id: "brands", name: "Brands" });
    store.actions.addVariable("brands", "color");
    const model = getVariablesModel(store.current);
    expect(model.collections.map((collection) => collection.id)).toEqual([
      LEGACY_COLLECTION_ID,
      "brands",
    ]);
    expect(model.collections[0].variables.map((variable) => variable.id)).toEqual([
      "brand",
      "ink",
    ]);
    expect(model.collections[1].variables).toHaveLength(1);
    expect(store.current.colorVariables.map((item) => item.id)).toEqual(["brand", "ink"]);
  });

  it("switches modes after first-use seeding and re-resolves bound nodes", () => {
    const store = freshHarness(legacyDoc());
    store.actions.addMode(LEGACY_COLLECTION_ID, { id: "dark", name: "Dark" });
    store.actions.updateValue("brand", "dark", "#000000");
    expect(store.current.nodes.find((node) => node.id === "n1").fill).toBe("#7c5cff");
    store.actions.setActiveMode(LEGACY_COLLECTION_ID, "dark");
    expect(store.current.nodes.find((node) => node.id === "n1")).toMatchObject({
      fill: "#000000",
      fillVariableId: "brand",
    });
    expect(store.current.colorVariables.find((item) => item.id === "brand").value).toBe(
      "#000000",
    );
    store.actions.setActiveMode(LEGACY_COLLECTION_ID, DEFAULT_MODE_ID);
    expect(store.current.nodes.find((node) => node.id === "n1").fill).toBe("#7c5cff");
    expect(store.current.colorVariables.find((item) => item.id === "brand").value).toBe(
      "#7c5cff",
    );
  });

  it("every first-use action returns a new document without throwing", () => {
    const store = freshHarness(legacyDoc(), null);
    const docs = [
      store.actions.addCollection({ id: "c2", name: "Two" }),
      store.actions.renameCollection(LEGACY_COLLECTION_ID, "Colors 2"),
      store.actions.addMode(LEGACY_COLLECTION_ID, { id: "dark", name: "Dark" }),
      store.actions.renameVariable("brand", "Primary"),
      store.actions.updateValue("brand", DEFAULT_MODE_ID, "#123456"),
      store.actions.deleteVariable("ink"),
      store.actions.deleteCollection("c2"),
    ];
    for (const doc of docs) {
      expect(doc).toBeTruthy();
      expect(getVariablesModel(doc).collections.length).toBeGreaterThan(0);
    }
    // The last write won: node fill follows the updated primary colour.
    expect(store.current.nodes.find((node) => node.id === "n1").fill).toBe("#123456");
  });
});
