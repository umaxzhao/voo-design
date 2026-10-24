import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANVAS_TOOL_SCHEMAS,
  executeCanvasTool,
} from "../../src/canvas/agent/canvas_tools.js";
import { duplicateComponentMaster } from "../../src/canvas/agent/canvas_tools_components.js";

const MASTER = {
  canvasId: "master_button",
  name: "Button",
  width: 120,
  height: 80,
  nodes: [
    {
      id: "label",
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

function makeEditor() {
  let doc = {
    id: "doc_1",
    canvasId: "canvas_1",
    width: 640,
    height: 480,
    nodes: [
      {
        id: "inst_1",
        kind: "canvasInstance",
        sourceCanvasId: "master_button",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        instance: {
          overrides: { nodes: { label: { text: "Old" } } },
        },
      },
    ],
    components: { master_button: MASTER },
  };
  const editor = {
    getDoc: () => doc,
    getDocument: () => doc,
    getNode: (id) => doc.nodes.find((node) => node.id === id) ?? null,
    setDoc: (next) => {
      doc = next;
    },
  };
  return { editor, doc: () => doc };
}

let editor;
let doc;

beforeEach(() => {
  const built = makeEditor();
  editor = built.editor;
  doc = built.doc;
  globalThis.window = { __vooEditor: editor };
});

describe("component variant schemas", () => {
  it("registers the variant tools", () => {
    const names = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "create_component_variant",
        "list_component_variants",
        "set_instance_variant",
      ]),
    );
  });

  it("documents every registered canvas tool", () => {
    const catalog = readFileSync(resolve(process.cwd(), "docs/agents.md"), "utf8");
    for (const name of CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name)) {
      expect(catalog, `Missing ${name} from docs/agents.md`).toContain(`\`${name}\``);
    }
  });
});

describe("component variant tools", () => {
  it("duplicates a master into a shared variant group", async () => {
    const result = await executeCanvasTool("create_component_variant", {
      sourceComponentId: "master_button",
      variantName: "Dark",
      name: "Button / Dark",
    });

    expect(result.ok).toBe(true);
    expect(result.variantName).toBe("Dark");
    expect(result.componentId).not.toBe("master_button");
    const source = doc().components.master_button;
    const variant = doc().components[result.componentId];
    expect(source.variantGroupId).toBe(result.variantGroupId);
    expect(source.variantName).toBe("Default");
    expect(variant.variantGroupId).toBe(result.variantGroupId);
    expect(variant.variantName).toBe("Dark");
    expect(variant.nodes.map((node) => node.id)).toEqual(["label"]);
  });

  it("lists variants by component id or by group id", async () => {
    const created = await executeCanvasTool("create_component_variant", {
      sourceComponentId: "master_button",
      variantName: "Dark",
    });

    const byComponent = await executeCanvasTool("list_component_variants", {
      componentId: "master_button",
    });
    expect(byComponent.variantGroupId).toBe(created.variantGroupId);
    expect(byComponent.variants.map((variant) => variant.variantName)).toEqual([
      "Dark",
      "Default",
    ]);

    const byGroup = await executeCanvasTool("list_component_variants", {
      variantGroupId: created.variantGroupId,
    });
    expect(byGroup.variants.map((variant) => variant.componentId)).toEqual(
      expect.arrayContaining(["master_button", created.componentId]),
    );
  });

  it("creates a persisted multi-axis matrix and switches an instance by properties in one commit", async () => {
    let commits = 0;
    const originalSetDoc = editor.setDoc;
    editor.setDoc = (next) => { commits += 1; originalSetDoc(next); };
    const created = await executeCanvasTool("create_component_variant_matrix", {
      sourceComponentId: "master_button",
      axes: { State: ["Default", "Hover"], Size: ["M", "L"] },
    });
    expect(created.variants).toHaveLength(4);
    expect(Object.keys(doc().components)).toHaveLength(4);
    expect(doc().components.master_button.variantName).toBe("State=Default, Size=M");

    const beforeSwitch = commits;
    const properties = await executeCanvasTool("list_instance_variant_properties", { instanceId: "inst_1" });
    expect(properties.axes).toEqual([
      { key: "State", values: ["Default", "Hover"] },
      { key: "Size", values: ["M", "L"] },
    ]);
    const switched = await executeCanvasTool("set_instance_variant", {
      instanceId: "inst_1",
      properties: { State: "Hover", Size: "L" },
    });
    expect(switched.variantName).toBe("State=Hover, Size=L");
    expect(commits).toBe(beforeSwitch + 1);
    expect(doc().nodes[0].sourceCanvasId).toBe(switched.componentId);
    expect(doc().components[switched.componentId].variantName).toBe("State=Hover, Size=L");
  });

  it("swaps an instance to a named sibling variant", async () => {
    const created = await executeCanvasTool("create_component_variant", {
      sourceComponentId: "master_button",
      variantName: "Dark",
    });

    const result = await executeCanvasTool("set_instance_variant", {
      instanceId: "inst_1",
      variantName: "Dark",
    });

    expect(result.ok).toBe(true);
    expect(result.previousComponentId).toBe("master_button");
    expect(result.componentId).toBe(created.componentId);
    const instance = doc().nodes.find((node) => node.id === "inst_1");
    expect(instance.sourceCanvasId).toBe(created.componentId);
    expect(instance.instance.overrides.nodes).toBeUndefined();
  });

  it("rejects an unknown variant and a missing selector", async () => {
    await executeCanvasTool("create_component_variant", {
      sourceComponentId: "master_button",
      variantName: "Dark",
    });
    await expect(
      executeCanvasTool("set_instance_variant", {
        instanceId: "inst_1",
        variantName: "Nope",
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    await expect(
      executeCanvasTool("list_component_variants", {}),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });
});

describe("duplicateComponentMaster", () => {
  it("keeps layer ids but gives the variant its own canvas id", () => {
    const copy = duplicateComponentMaster(MASTER, {
      componentId: "master_dark",
      variantGroupId: "group_1",
      variantName: "Dark",
    });
    expect(copy.canvasId).toBe("master_dark");
    expect(copy.nodes.map((node) => node.id)).toEqual(["label"]);
    expect(copy.variantGroupId).toBe("group_1");
    expect(copy.variantName).toBe("Dark");
  });
});
