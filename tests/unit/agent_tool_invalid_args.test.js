import { describe, it, expect, beforeEach } from "vitest";
import { executeCanvasTool } from "../../src/canvas/agent/canvas_tools.js";

function makeDoc(nodes = []) {
  return { id: "doc_1", canvasId: "canvas_1", width: 640, height: 480, nodes };
}

async function messageFor(name, args) {
  try {
    await executeCanvasTool(name, args);
  } catch (error) {
    expect(error.code).toBe("agentInvalidArgs");
    return error.message;
  }
  throw new Error(`${name} should have rejected`);
}

describe("agent tool invalid-argument messages name the argument", () => {
  let doc;

  beforeEach(() => {
    doc = makeDoc([
      {
        id: "rect",
        kind: "path",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        fill: "#ff0000",
        points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      },
      { id: "inst", kind: "canvasInstance", sourceCanvasId: "comp", instance: {} },
    ]);
    globalThis.window = {
      __vooEditor: {
        getDoc: () => doc,
        getDocument: () => doc,
        getNode: (id) => doc.nodes.find((node) => node.id === id) ?? null,
        updateNode: () => {},
        addPenNode: () => ({ nodeId: "path" }),
        insertImage: async () => ({ id: "image" }),
      },
    };
  });

  it("validates create_shape kind and geometry", async () => {
    const kind = await messageFor("create_shape", { kind: "triangle", x: 0, y: 0, width: 1, height: 1 });
    expect(kind).toContain('Invalid argument "kind"');
    expect(kind).toContain("rect, ellipse, text");
    const geometry = await messageFor("create_shape", { kind: "rect", x: "left", y: 0, width: 1, height: 1 });
    expect(geometry).toContain("x");
    expect(geometry).toContain("finite numbers");
  });

  it("validates style type and reports a missing style id", async () => {
    const type = await messageFor("create_style", { type: "spacing", name: "Gap" });
    expect(type).toContain('Invalid argument "type"');
    expect(type).toContain("paint, text, effect");
    const styleId = await messageFor("apply_style", { layerId: "rect", type: "paint", styleId: "missing" });
    expect(styleId).toContain("styleId");
  });

  it("validates instance patch values", async () => {
    const message = await messageFor("set_instance_override", {
      instanceId: "inst",
      patch: { layoutMode: "diagonal" },
    });
    expect(message).toContain('Invalid argument "patch.layoutMode"');
    expect(message).toContain("got");
  });

  it("validates variable mode name and mode selector", async () => {
    const name = await messageFor("add_variable_mode", { collectionId: "collection:theme" });
    expect(name).toContain('Invalid argument "name"');
    const both = await messageFor("set_active_mode", {
      collectionId: "collection:theme",
      layerId: "rect",
      modeId: "mode:light",
    });
    expect(both).toContain("collectionId");
    expect(both).toContain("layerId");
  });

  it("validates path operations and move coordinates", async () => {
    const op = await messageFor("edit_path_nodes", {
      layerId: "rect",
      ops: [{ op: "explode", index: 0 }],
    });
    expect(op).toContain('Invalid argument "op"');
    expect(op).toContain("move, insert");
    const move = await messageFor("edit_path_nodes", {
      layerId: "rect",
      ops: [{ op: "move", index: 0 }],
    });
    expect(move).toContain("ops[].x");
    expect(move).toContain("finite");
  });

  it("validates create_path and place_image arguments", async () => {
    const path = await messageFor("create_path", { d: 42 });
    expect(path).toContain('Invalid argument "d"');
    const image = await messageFor("place_image", { url: "data:image/png;base64,AA==", width: "wide" });
    expect(image).toContain('Invalid argument "width"');
    expect(image).toContain("finite number");
  });

  it("maps an unparseable SVG path to an invalid d argument", async () => {
    globalThis.window.__vooEditor.addPenNode = () => {
      throw new Error("bad path");
    };
    const message = await messageFor("create_path", { d: "not-a-path" });
    expect(message).toContain('Invalid argument "d"');
    expect(message).toContain("SVG path");
  });
});
