import { describe, expect, it, vi } from "vitest";
import { createDocument, createRectNode } from "../../src/canvas/editor/scene_model.js";
import { createEditorPropertyLibraries } from "../../src/canvas/components/editor_hooks/editor_property_libraries.js";

function fixture() {
  let doc = createDocument(300, 200);
  doc.nodes = [
    { ...createRectNode({ x: 20, y: 20, width: 50, height: 40, fill: "#ff0000" }), id: "first" },
    { ...createRectNode({ x: 90, y: 20, width: 50, height: 40, fill: "#0000ff" }), id: "second" },
  ];
  const engine = {
    getDocument: () => doc,
    setDoc: vi.fn((next) => { doc = next; }),
  };
  const actions = (id) => createEditorPropertyLibraries({
    engine, doc, propertyObject: doc.nodes.find(node => node.id === id) ?? null,
    t: (_key, { index }) => `Variable ${index}`,
  });
  return { engine, actions, document: () => doc };
}

describe("focused property library actions", () => {
  it("has no mutation actions without a property target", () => {
    const f = fixture();
    expect(f.actions("absent")).toEqual({ colorVariableActions: null, styleActions: null });
    expect(f.engine.setDoc).not.toHaveBeenCalled();
  });

  it("creates and binds a legacy colour variable to the captured target", () => {
    const f = fixture();
    const first = f.actions("first");
    first.colorVariableActions.create();
    const doc = f.document();
    expect(doc.colorVariables).toHaveLength(1);
    expect(doc.colorVariables[0]).toMatchObject({ name: "Variable 1", value: "#ff0000" });
    expect(doc.nodes[0].fillVariableId).toBe(doc.colorVariables[0].id);
    expect(doc.nodes[1].fillVariableId).toBeUndefined();
    expect(f.engine.setDoc).toHaveBeenCalledOnce();

    f.actions("second").colorVariableActions.bind(doc.colorVariables[0].id);
    expect(f.document().nodes[1].fillVariableId).toBe(doc.colorVariables[0].id);
    first.colorVariableActions.update(doc.colorVariables[0].id, { value: "#00ff00" });
    expect(f.document().colorVariables[0].value).toBe("#00ff00");
  });

  it("commits typed variables and styles with their original history names", () => {
    const f = fixture();
    f.actions("first").colorVariableActions.variableActions.addCollection({ name: "Brand" });
    expect(f.document().variablesV2.collections.some(collection => collection.name === "Brand")).toBe(true);
    expect(f.engine.setDoc).toHaveBeenLastCalledWith(f.document(), { name: "editor.history.entry.variables" });

    f.actions("second").styleActions.actions.create("paint", "Blue");
    const style = f.document().styles.paint.find(item => item.name === "Blue");
    expect(style).toBeDefined();
    expect(style.value.fill).toBe("#0000ff");
    expect(f.document().nodes[1].styleIds?.paintId).toBeUndefined();
    f.actions("second").styleActions.actions.apply("paint", style.id);
    expect(f.document().nodes[1].styleIds.paintId).toBe(style.id);
    expect(f.document().nodes[0].styleIds?.paintId).toBeUndefined();
    expect(f.engine.setDoc).toHaveBeenLastCalledWith(f.document(), { name: "editor.history.entry.styles" });
  });
});
