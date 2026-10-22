import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CANVAS_TOOL_SCHEMAS,
  executeCanvasTool,
} from "../../src/canvas/agent/canvas_tools.js";
import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";

function makeDoc(nodes = []) {
  return { id: "doc_1", canvasId: "canvas_1", width: 640, height: 480, nodes };
}

describe("design-system tool schemas", () => {
  it("exposes the component, style and variable tools", () => {
    const names = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    for (const name of [
      "create_component",
      "create_instance",
      "list_styles",
      "create_style",
      "apply_style",
      "list_variables",
      "bind_variable",
    ]) {
      expect(names).toContain(name);
    }
  });
});

describe("component tools", () => {
  let doc;
  let editor;
  let commits;

  beforeEach(() => {
    commits = [];
    doc = makeDoc([
      { id: "card", kind: "rect", name: "Card", x: 10, y: 20, width: 120, height: 80, fill: "#112233" },
    ]);
    editor = {
      getDoc: vi.fn(() => doc),
      getDocument: vi.fn(() => doc),
      getNode: vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null),
      setDoc: vi.fn((next, options) => {
        doc = next;
        commits.push(options?.name ?? "commit");
      }),
      selectExactly: vi.fn(),
      commit: vi.fn(),
    };
    globalThis.window = { __vooEditor: editor };
  });

  it("creates a main component and leaves an instance in the page", async () => {
    const result = await executeCanvasTool("create_component", { layerId: "card" });

    expect(result.ok).toBe(true);
    expect(result.componentId).toBeTruthy();
    expect(result.instanceId).toBeTruthy();
    const instance = doc.nodes.find((node) => node.id === result.instanceId);
    expect(instance.kind).toBe("canvasInstance");
    expect(instance.sourceCanvasId).toBe(result.componentId);
    expect(doc.components[result.componentId].nodes).toHaveLength(1);
    expect(commits).toContain("AI: Create component");
    expect(editor.selectExactly).toHaveBeenCalledWith([result.instanceId]);
  });

  it("places another instance at the requested position", async () => {
    const created = await executeCanvasTool("create_component", { layerId: "card" });
    const result = await executeCanvasTool("create_instance", {
      componentId: created.componentId,
      x: 300,
      y: 240,
    });

    expect(result.ok).toBe(true);
    const instance = doc.nodes.find((node) => node.id === result.instanceId);
    expect(instance.sourceCanvasId).toBe(created.componentId);
    expect(instance.x).toBe(300);
    expect(instance.y).toBe(240);
    expect(instance.width).toBe(120);
    expect(instance.height).toBe(80);
  });

  it("uses the engine's component methods when available", async () => {
    editor.createComponent = vi.fn(() => ({ componentId: "comp_1", instanceId: "inst_1" }));
    editor.createInstance = vi.fn(() => ({ componentId: "comp_1", instanceId: "inst_2" }));

    await expect(executeCanvasTool("create_component", { layerId: "card" })).resolves.toEqual({
      ok: true,
      componentId: "comp_1",
      instanceId: "inst_1",
      layerId: "inst_1",
    });
    await executeCanvasTool("create_instance", { componentId: "comp_1", x: 1, y: 2 });
    expect(editor.createComponent).toHaveBeenCalledWith({ layerId: "card", name: "Card" });
    expect(editor.createInstance).toHaveBeenCalledWith({
      componentId: "comp_1",
      x: 1,
      y: 2,
      width: undefined,
      height: undefined,
      name: undefined,
    });
  });
});

describe("style tools", () => {
  let doc;
  let editor;
  let commits;

  beforeEach(() => {
    commits = [];
    doc = makeDoc([
      { id: "rect", kind: "rect", x: 0, y: 0, width: 100, height: 50, fill: "#ff0000" },
    ]);
    editor = {
      getDoc: vi.fn(() => doc),
      getNode: vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null),
      setDoc: vi.fn((next, options) => {
        doc = next;
        commits.push(options?.name ?? "commit");
      }),
    };
    globalThis.window = { __vooEditor: editor };
  });

  it("creates, lists and applies a named paint style", async () => {
    const created = await executeCanvasTool("create_style", {
      type: "paint",
      name: "Brand red",
      fromLayerId: "rect",
    });
    expect(created.ok).toBe(true);
    expect(created.styleId).toBeTruthy();

    const listed = await executeCanvasTool("list_styles", {});
    expect(listed.styles.paint.map((style) => style.id)).toContain(created.styleId);

    const applied = await executeCanvasTool("apply_style", {
      layerId: "rect",
      type: "paint",
      styleId: created.styleId,
    });
    expect(applied.ok).toBe(true);
    expect(doc.nodes[0].fill).toBe("#ff0000");
    expect(doc.nodes[0].styleIds.paintId).toBe(created.styleId);
    expect(commits).toEqual(["AI: Create style", "AI: Apply style"]);
  });

  it("falls back to a commit-only editor without a document setter", async () => {
    const localDoc = makeDoc([
      { id: "rect", kind: "rect", x: 0, y: 0, width: 100, height: 50, fill: "#abcdef" },
    ]);
    const commitEditorDocument = vi.fn();
    globalThis.window = {
      __vooEditor: {
        getDoc: () => localDoc,
        getNode: (id) => localDoc.nodes.find((node) => node.id === id) ?? null,
        commitEditorDocument,
      },
    };

    const created = await executeCanvasTool("create_style", {
      type: "paint",
      name: "Fallback",
      fromLayerId: "rect",
    });
    expect(localDoc.styles.paint.map((style) => style.id)).toContain(created.styleId);
    expect(commitEditorDocument).toHaveBeenCalledWith({ message: "AI: Create style" });
  });

  it("rejects an unknown style type", async () => {
    await expect(
      executeCanvasTool("create_style", { type: "spacing", name: "Space" }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });
});

describe("variable tools", () => {
  let doc;
  let editor;

  beforeEach(() => {
    doc = makeDoc([
      { id: "rect", kind: "rect", x: 0, y: 0, width: 100, height: 50, fill: "#000000" },
    ]);
    doc.variablesV2 = {
      version: 2,
      collections: [
        {
          id: "collection:brand",
          name: "Brand",
          modes: [{ id: "mode:light", name: "Light" }],
          variables: [
            {
              id: "var:brand",
              name: "Brand",
              type: "color",
              valuesByMode: { "mode:light": "#00aa55" },
            },
          ],
        },
      ],
      activeModeByCollection: { "collection:brand": "mode:light" },
    };
    editor = {
      getDoc: vi.fn(() => doc),
      getNode: vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null),
      setDoc: vi.fn((next) => {
        doc = next;
      }),
    };
    globalThis.window = { __vooEditor: editor };
  });

  it("lists variables and binds a layer fill to one", async () => {
    const listed = await executeCanvasTool("list_variables", {});
    expect(listed.variables).toEqual([
      expect.objectContaining({
        id: "var:brand",
        name: "Brand",
        type: "color",
        value: "#00aa55",
      }),
    ]);

    const result = await executeCanvasTool("bind_variable", {
      layerId: "rect",
      variableId: "var:brand",
      target: "fill",
    });
    expect(result).toEqual({
      ok: true,
      layerId: "rect",
      variableId: "var:brand",
      target: "fill",
    });
    expect(doc.nodes[0].fill).toBe("#00aa55");
    expect(doc.nodes[0].fillVariableId).toBe("var:brand");
  });

  it("only accepts fill or stroke bindings", async () => {
    await expect(
      executeCanvasTool("bind_variable", {
        layerId: "rect",
        variableId: "var:brand",
        target: "opacity",
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });
});

describe("agent turn undo grouping", () => {
  function makeEditor(doc, { batch = true } = {}) {
    const state = { doc, suppressed: 0, batchDepth: 0, commits: [], setDocs: [] };
    const editor = {
      getDoc: () => state.doc,
      getDocument: () => state.doc,
      serialise: () => JSON.stringify(state.doc),
      setDoc: (next) => {
        state.setDocs.push(next);
        state.doc = next;
        if (!state.suppressed && state.batchDepth === 0) {
          state.commits.push("setDoc");
        }
      },
      commit: (name) => state.commits.push(name),
    };
    if (batch) {
      editor.beginBatch = () => {
        state.batchDepth += 1;
      };
      editor.endBatch = () => {
        state.batchDepth -= 1;
      };
    } else {
      editor.mute = async (run) => {
        state.suppressed += 1;
        try {
          return await run();
        } finally {
          state.suppressed -= 1;
        }
      };
    }
    return { editor, state };
  }

  function turn(toolCalls) {
    let calls = 0;
    return async ({ tools }) => {
      calls += 1;
      if (calls === 1) return { text: "", toolCalls };
      return { text: "done", toolCalls: [] };
    };
  }

  it("commits all mutating calls in one turn once, using beginBatch/endBatch", async () => {
    const { editor, state } = makeEditor(makeDoc([{ id: "a", x: 0 }]));
    globalThis.window = { __vooEditor: editor };
    const streamStep = turn([
      { id: "1", name: "mutate_layer_layout", arguments: JSON.stringify({ layerId: "a", patch: { x: 10 } }) },
      { id: "2", name: "rename_layer", arguments: JSON.stringify({ layerId: "a", name: "A" }) },
    ]);
    const result = await runAgentTurn({
      config: {},
      history: [],
      userText: "move and rename",
      tools: [],
      streamStep,
      executeTool: async (name, args) => {
        editor.setDoc({ ...state.doc, nodes: state.doc.nodes.map((node) => ({ ...node, ...args.patch })) });
        return { ok: true };
      },
    });

    expect(result).toBe("done");
    expect(state.commits).toEqual(["AI: Agent turn"]);
  });

  it("falls back to mute when the engine has no explicit batch API", async () => {
    const { editor, state } = makeEditor(makeDoc([{ id: "a", x: 0 }]), { batch: false });
    globalThis.window = { __vooEditor: editor };
    const streamStep = turn([
      { id: "1", name: "mutate_layer_layout", arguments: JSON.stringify({ layerId: "a", patch: { x: 10 } }) },
      { id: "2", name: "mutate_layer_layout", arguments: JSON.stringify({ layerId: "a", patch: { x: 20 } }) },
    ]);
    await runAgentTurn({
      config: {},
      history: [],
      userText: "move twice",
      tools: [],
      streamStep,
      executeTool: async (name, args) => {
        editor.setDoc({ ...state.doc, nodes: state.doc.nodes.map((node) => ({ ...node, ...args.patch })) });
        return { ok: true };
      },
    });

    expect(state.commits).toEqual(["AI: Agent turn"]);
  });

  it("does not add an undo entry for a read-only turn", async () => {
    const { editor, state } = makeEditor(makeDoc([]));
    globalThis.window = { __vooEditor: editor };
    const streamStep = turn([
      { id: "1", name: "inspect_layer_tree", arguments: "{}" },
    ]);
    await runAgentTurn({
      config: {},
      history: [],
      userText: "inspect",
      tools: [],
      streamStep,
      executeTool: async () => ({ ok: true }),
    });

    expect(state.commits).toEqual([]);
  });
});

describe("history batching", () => {
  it("suppresses pushes between beginBatch and endBatch", () => {
    const history = createHistory();
    history.reset(JSON.stringify({ v: 0 }));
    history.beginBatch();
    history.push(JSON.stringify({ v: 1 }));
    history.push(JSON.stringify({ v: 2 }));
    expect(history.getEntries()).toHaveLength(1);
    history.endBatch();
    history.push(JSON.stringify({ v: 3 }));
    expect(history.getEntries()).toHaveLength(2);
  });

  it("keeps mute active until an async run settles", async () => {
    const history = createHistory();
    history.reset(JSON.stringify({ v: 0 }));
    await history.mute(async () => {
      await Promise.resolve();
      history.push(JSON.stringify({ v: 1 }));
    });
    expect(history.getEntries()).toHaveLength(1);
    history.push(JSON.stringify({ v: 2 }));
    expect(history.getEntries()).toHaveLength(2);
  });
});
