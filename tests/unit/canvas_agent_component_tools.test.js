import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CANVAS_TOOL_SCHEMAS,
  executeCanvasTool,
} from "../../src/canvas/agent/canvas_tools.js";

function makeDoc(nodes = [], extra = {}) {
  return {
    id: "doc_1",
    canvasId: "canvas_1",
    width: 640,
    height: 480,
    nodes,
    ...extra,
  };
}

const MASTER_A = {
  canvasId: "canvas_master_a",
  width: 120,
  height: 80,
  nodes: [
    {
      id: "master_label",
      kind: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 24,
      text: "Hi",
      fill: "#ff0000",
    },
  ],
};

const MASTER_B = {
  canvasId: "canvas_master_b",
  width: 120,
  height: 80,
  nodes: [
    {
      id: "master_b_label",
      kind: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 24,
      fill: "#00ff00",
    },
  ],
};

function makeInstanceEditor() {
  const doc = makeDoc(
    [
      {
        id: "inst_1",
        kind: "canvasInstance",
        sourceCanvasId: "canvas_master_a",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        instance: {
          overrides: {
            nodes: { master_label: { text: "Old", fill: "#123456" } },
          },
        },
      },
    ],
    {
      components: {
        canvas_master_a: MASTER_A,
        canvas_master_b: MASTER_B,
        canvas_master_c: {
          canvasId: "canvas_master_c",
          width: 80,
          height: 60,
          nodes: [
            {
              id: "inst_c",
              kind: "canvasInstance",
              sourceCanvasId: "canvas_1",
              x: 0,
              y: 0,
              width: 80,
              height: 60,
              instance: {},
            },
          ],
        },
      },
    },
  );
  const editor = {
    getDoc: vi.fn(() => doc),
    getDocument: vi.fn(() => doc),
    getNode: vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null),
    setDoc: vi.fn((next, options) => {
      doc = next;
      commits.push(options?.name ?? "commit");
    }),
    commitEditorDocument: vi.fn(),
  };
  return { doc: () => doc, editor };
}

let commits;

describe("component tool schemas", () => {
  it("exposes the instance and variable tools", () => {
    const names = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    for (const name of [
      "set_instance_override",
      "reset_instance_overrides",
      "swap_instance",
      "create_variable_collection",
      "add_variable_mode",
      "create_variable",
      "set_variable_value",
      "set_active_mode",
    ]) {
      expect(names).toContain(name);
    }
  });
});

describe("instance override tools", () => {
  let doc;
  let editor;
  let commits;

  beforeEach(() => {
    commits = [];
    const built = makeInstanceEditor();
    editor = built.editor;
    doc = built.doc();
    editor.setDoc = vi.fn((next, options) => {
      doc = next;
      commits.push(options?.name ?? "commit");
    });
    globalThis.window = { __vooEditor: editor };
  });

  it("overrides one component layer of an instance", async () => {
    const result = await executeCanvasTool("set_instance_override", {
      instanceId: "inst_1",
      childId: "master_label",
      patch: { text: "Hello" },
    });

    expect(result.ok).toBe(true);
    expect(result.childId).toBe("master_label");
    const instance = doc.nodes.find((node) => node.id === "inst_1");
    expect(instance.instance.overrides.nodes.master_label).toEqual(
      expect.objectContaining({ text: "Hello", fill: "#123456" }),
    );
    expect(commits).toContain("AI: Set instance override");
  });

  it("targets the only overridable layer when childId is omitted", async () => {
    const result = await executeCanvasTool("set_instance_override", {
      instanceId: "inst_1",
      patch: { fill: "#00ff00" },
    });
    expect(result.childId).toBe("master_label");
    expect(
      doc.nodes.find((node) => node.id === "inst_1").instance.overrides.nodes
        .master_label.fill,
    ).toBe("#00ff00");
  });

  it("patches the instance's own record without childId", async () => {
    const result = await executeCanvasTool("set_instance_override", {
      instanceId: "inst_1",
      patch: { layoutMode: "fill" },
    });
    expect(result.childId).toBeNull();
    const instance = doc.nodes.find((node) => node.id === "inst_1");
    expect(instance.instance.layoutMode).toBe("fill");
  });

  it("rejects unknown override fields and invalid values", async () => {
    await expect(
      executeCanvasTool("set_instance_override", {
        instanceId: "inst_1",
        childId: "master_label",
        patch: { color: "#ffffff" },
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    await expect(
      executeCanvasTool("set_instance_override", {
        instanceId: "inst_1",
        childId: "master_label",
        patch: { fill: "not-a-color" },
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });

  it("rejects a childId that is not part of the component", async () => {
    await expect(
      executeCanvasTool("set_instance_override", {
        instanceId: "inst_1",
        childId: "master_unknown",
        patch: { text: "Hello" },
      }),
    ).rejects.toMatchObject({ code: "agentNodeNotFound" });
  });

  it("rejects a layer that is not an instance", async () => {
    doc.nodes.push({
      id: "rect",
      kind: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fill: "#000000",
    });
    editor.getNode = vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null);
    await expect(
      executeCanvasTool("set_instance_override", {
        instanceId: "rect",
        patch: { visible: false },
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });

  it("clears every layer override", async () => {
    const result = await executeCanvasTool("reset_instance_overrides", {
      instanceId: "inst_1",
    });
    expect(result.ok).toBe(true);
    const instance = doc.nodes.find((node) => node.id === "inst_1");
    expect(instance.instance.overrides.nodes).toBeUndefined();
    expect(commits).toContain("AI: Reset instance overrides");
  });

  it("swaps the instance to another main component", async () => {
    const result = await executeCanvasTool("swap_instance", {
      instanceId: "inst_1",
      componentId: "canvas_master_b",
    });
    expect(result.ok).toBe(true);
    expect(result.previousComponentId).toBe("canvas_master_a");
    const instance = doc.nodes.find((node) => node.id === "inst_1");
    expect(instance.sourceCanvasId).toBe("canvas_master_b");
    expect(instance.instance.overrides.nodes).toBeUndefined();
    expect(commits).toContain("AI: Swap instance");
  });

  it("refuses a swap that would create a canvas cycle", async () => {
    await expect(
      executeCanvasTool("swap_instance", {
        instanceId: "inst_1",
        componentId: "canvas_master_c",
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });

  it("reports a missing component document", async () => {
    doc.components = {};
    await expect(
      executeCanvasTool("swap_instance", {
        instanceId: "inst_1",
        componentId: "canvas_master_b",
      }),
    ).rejects.toMatchObject({ code: "agentApiMissing" });
  });

  it("uses the engine's override methods when available", async () => {
    editor.setInstanceOverride = vi.fn(() => ({ instanceId: "inst_1" }));
    editor.resetInstanceOverrides = vi.fn(() => ({ instanceId: "inst_1" }));
    editor.swapInstance = vi.fn(() => ({ instanceId: "inst_1" }));

    const override = await executeCanvasTool("set_instance_override", {
      instanceId: "inst_1",
      childId: "master_label",
      patch: { text: "X" },
    });
    expect(override).toEqual({ ok: true, instanceId: "inst_1", layerId: "inst_1" });
    expect(editor.setInstanceOverride).toHaveBeenCalledWith({
      instanceId: "inst_1",
      childId: "master_label",
      patch: { text: "X" },
    });
    await executeCanvasTool("reset_instance_overrides", { instanceId: "inst_1" });
    expect(editor.resetInstanceOverrides).toHaveBeenCalledWith("inst_1");
    const swapped = await executeCanvasTool("swap_instance", {
      instanceId: "inst_1",
      componentId: "canvas_master_b",
    });
    expect(swapped.componentId).toBe("canvas_master_b");
    expect(editor.setDoc).not.toHaveBeenCalled();
  });
});

describe("variable tools", () => {
  let doc;
  let editor;

  beforeEach(() => {
    doc = makeDoc([
      {
        id: "rect",
        kind: "rect",
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        fill: "#000000",
        fillVariableId: "var:accent",
      },
    ]);
    doc.variablesV2 = {
      version: 2,
      collections: [
        {
          id: "collection:theme",
          name: "Theme",
          modes: [{ id: "mode:light", name: "Light" }],
          variables: [
            {
              id: "var:accent",
              name: "Accent",
              type: "color",
              valuesByMode: { "mode:light": "#aabbcc" },
            },
          ],
        },
      ],
      activeModeByCollection: { "collection:theme": "mode:light" },
    };
    editor = {
      getDoc: vi.fn(() => doc),
      getDocument: vi.fn(() => doc),
      getNode: vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null),
      setDoc: vi.fn((next) => {
        doc = next;
      }),
    };
    globalThis.window = { __vooEditor: editor };
  });

  it("creates a collection with extra modes", async () => {
    const result = await executeCanvasTool("create_variable_collection", {
      name: "Palette",
      modes: ["Dark"],
    });
    expect(result.ok).toBe(true);
    const collection = doc.variablesV2.collections.find(
      (item) => item.id === result.collectionId,
    );
    expect(collection.name).toBe("Palette");
    expect(collection.modes.map((mode) => mode.name)).toEqual([
      "Default",
      "Dark",
    ]);
  });

  it("adds a mode, creates a variable and sets values", async () => {
    const added = await executeCanvasTool("add_variable_mode", {
      collectionId: "collection:theme",
      name: "Dark",
    });
    expect(added.modeId).toBeTruthy();
    expect(
      doc.variablesV2.collections[0].modes.map((mode) => mode.id),
    ).toContain(added.modeId);

    const created = await executeCanvasTool("create_variable", {
      collectionId: "collection:theme",
      type: "color",
      name: "Background",
      valuesByMode: { "mode:light": "#111111", [added.modeId]: "#eeeeee" },
    });
    expect(created.ok).toBe(true);
    expect(created.valuesByMode[added.modeId]).toBe("#eeeeee");
    const stored = doc.variablesV2.collections[0].variables.find(
      (variable) => variable.id === created.variableId,
    );
    expect(stored.type).toBe("color");

    await executeCanvasTool("set_variable_value", {
      variableId: created.variableId,
      modeId: added.modeId,
      value: "#ffffff",
    });
    expect(
      doc.variablesV2.collections[0].variables.find(
        (variable) => variable.id === created.variableId,
      ).valuesByMode[added.modeId],
    ).toBe("#ffffff");
  });

  it("switches the active mode by collection and by bound layer", async () => {
    const added = await executeCanvasTool("add_variable_mode", {
      collectionId: "collection:theme",
      name: "Dark",
    });
    await executeCanvasTool("set_active_mode", {
      collectionId: "collection:theme",
      modeId: added.modeId,
    });
    expect(doc.variablesV2.activeModeByCollection["collection:theme"]).toBe(
      added.modeId,
    );

    await executeCanvasTool("set_active_mode", {
      layerId: "rect",
      modeId: "mode:light",
    });
    expect(doc.variablesV2.activeModeByCollection["collection:theme"]).toBe(
      "mode:light",
    );
  });

  it("rejects an unbound layer, an unknown type and an invalid value", async () => {
    doc.nodes[0].fillVariableId = null;
    await expect(
      executeCanvasTool("set_active_mode", {
        layerId: "rect",
        modeId: "mode:light",
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });

    await expect(
      executeCanvasTool("create_variable", {
        collectionId: "collection:theme",
        type: "gradient",
        name: "Nope",
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });

    await expect(
      executeCanvasTool("set_variable_value", {
        variableId: "var:accent",
        modeId: "mode:light",
        value: "not-a-color",
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });
});
