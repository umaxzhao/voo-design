import { describe, expect, it } from "vitest";
import {
  VARIABLE_BINDINGS,
  addCollection,
  addVariable,
  setVariableAlias,
  variableValue,
  bindVariable,
  resolveDocumentVariables,
  getVariablesModel,
} from "../../src/canvas/editor/scene_variables.js";
import { createDocument, createRectNode } from "../../src/canvas/editor/scene_model.js";

describe("Variable Aliases and Layout Value Bindings", () => {
  it("exposes gap and padding in VARIABLE_BINDINGS", () => {
    expect(VARIABLE_BINDINGS.gap).toBeDefined();
    expect(VARIABLE_BINDINGS.gap.key).toBe("gapVariableId");
    expect(VARIABLE_BINDINGS.gap.type).toBe("number");

    expect(VARIABLE_BINDINGS.padding).toBeDefined();
    expect(VARIABLE_BINDINGS.padding.key).toBe("paddingVariableId");
    expect(VARIABLE_BINDINGS.padding.type).toBe("number");
  });

  it("supports variable aliasOf chain and cycle detection", () => {
    let doc = createDocument(400, 400);
    doc = addCollection(doc, { id: "col-tokens", name: "Tokens" });

    // Base primitive variable
    doc = addVariable(doc, "col-tokens", {
      id: "color-blue-500",
      name: "blue-500",
      type: "color",
      value: "#3B82F6",
    });

    // Semantic alias variable
    doc = addVariable(doc, "col-tokens", {
      id: "color-primary",
      name: "primary",
      type: "color",
      value: "#000000",
    });

    doc = setVariableAlias(doc, "color-primary", "color-blue-500");

    // Resolves to base variable value
    expect(variableValue(doc, "color-primary")).toBe("#3B82F6");

    // Component-level alias
    doc = addVariable(doc, "col-tokens", {
      id: "btn-bg",
      name: "button-bg",
      type: "color",
      value: "#000000",
    });
    doc = setVariableAlias(doc, "btn-bg", "color-primary");

    expect(variableValue(doc, "btn-bg")).toBe("#3B82F6");

    // Self cycle rejection
    expect(() => setVariableAlias(doc, "color-blue-500", "color-blue-500")).toThrow(
      "variable-alias-cycle",
    );

    // Mutual cycle rejection
    expect(() => setVariableAlias(doc, "color-blue-500", "btn-bg")).toThrow(
      "variable-alias-cycle",
    );
  });

  it("binds gap and padding variables and resolves them into node layout values", () => {
    let doc = createDocument(800, 600);
    doc = addCollection(doc, { id: "col-layout", name: "Layout" });

    doc = addVariable(doc, "col-layout", {
      id: "space-md",
      name: "spacing-md",
      type: "number",
      value: 16,
    });

    const rect = createRectNode({ x: 0, y: 0, width: 200, height: 100 });
    doc.nodes = [rect];

    // Bind gap and padding
    doc = bindVariable(doc, rect.id, "space-md", "gap");
    doc = bindVariable(doc, rect.id, "space-md", "padding");

    expect(doc.nodes[0].gapVariableId).toBe("space-md");
    expect(doc.nodes[0].paddingVariableId).toBe("space-md");
    expect(doc.nodes[0].gap).toBe(16);
    expect(doc.nodes[0].padding).toBe(16);

    // Resolving document variables respects alias & mode
    const resolvedDoc = resolveDocumentVariables(doc);
    expect(resolvedDoc.nodes[0].gap).toBe(16);
    expect(resolvedDoc.nodes[0].padding).toBe(16);
  });
});
