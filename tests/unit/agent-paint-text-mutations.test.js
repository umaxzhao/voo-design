import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCanvasTool, CANVAS_TOOL_SCHEMAS } from "../../src/canvas/agent/canvas_tools.js";
import { validateLayerPatch } from "../../src/canvas/agent/canvas_mutation_validation.js";

let doc;
let editor;
beforeEach(() => {
  doc = { width: 500, height: 400, nodes: [
    { id: "text", kind: "text", text: "Keep this content", fill: "#000000", fontSize: 20 },
    { id: "rect", kind: "rect", fill: "#ffffff", x: 10, y: 10, width: 100, height: 80 },
  ] };
  editor = {
    getNode: (id) => doc.nodes.find((node) => node.id === id), getDocument: () => doc,
    updateNode: vi.fn((id, patch) => { doc = { ...doc, nodes: doc.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) }; }),
    updateNodes: vi.fn((patches) => { for (const { id, ...patch } of patches) editor.updateNode(id, patch); }),
    commitEditorDocument: vi.fn(),
  };
  vi.stubGlobal("window", { __vooEditor: editor, dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class { constructor(type, options) { this.type = type; this.detail = options?.detail; } });
});
afterEach(() => vi.unstubAllGlobals());

const text = () => doc.nodes.find((node) => node.id === "text");
describe("agent paint and typography parity", () => {
  it("keeps text content when applying only typography and normalizes render aliases", async () => {
    await executeCanvasTool("mutate_layer_text", { layerId: "text", patch: {
      italic: true, underline: true, lineHeight: 1.5, letterSpacing: 2, textAlign: "center", color: "#123456", fontWeight: 600,
    } });
    expect(text()).toMatchObject({ text: "Keep this content", italic: true, underline: true, lineHeight: 1.5, letterSpacing: 2, align: "center", fill: "#123456", fontWeight: 600 });
    expect(text()).not.toHaveProperty("textContent");
    expect(text()).not.toHaveProperty("textAlign");
    expect(text()).not.toHaveProperty("color");
    expect(editor.updateNode).toHaveBeenCalledTimes(1);
  });
  it("normalizes text aliases identically inside an atomic batch", async () => {
    await executeCanvasTool("batch_mutate_layers", { mutations: [
      { type: "text", layerId: "text", patch: { textContent: "Replaced", textAlign: "right", color: "#ff0000" } },
      { type: "style", layerId: "rect", patch: { blendMode: "multiply", strokeDash: [4, 2] } },
    ] });
    expect(text()).toMatchObject({ text: "Replaced", align: "right", fill: "#ff0000" });
    expect(editor.updateNodes).toHaveBeenCalledTimes(1);
  });
  it("converts structured gradients and accepts actual panel effect/stroke fields", async () => {
    const result = await executeCanvasTool("mutate_layer_style", { layerId: "rect", patch: {
      gradient: { type: "linear", angle: 90, stops: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 100 }],
        geometry: { startX: 10, startY: 20, endX: 90, endY: 80 } },
      layerBlur: 4, backgroundBlur: 2, blendMode: "multiply", strokeDash: "dashed", strokeCap: "round", strokeJoin: "bevel", strokeAlign: "inside",
      effects: { shadow: { enabled: true, color: "#000000", blur: 8, offsetX: 10, offsetY: 10, opacity: 50 } },
    } });
    expect(result.updated.fill).toContain("linear-gradient(90deg");
    expect(result.updated.fill).toContain("voo-gradient-line: 10% 20% 90% 80%");
    expect(result.updated).not.toHaveProperty("gradient");
    expect(doc.nodes[1]).toMatchObject({ layerBlur: 4, backgroundBlur: 2, strokeDash: "dashed", blendMode: "multiply" });
  });
  it.each([
    ["text", { italic: "yes" }], ["text", { lineHeight: -1 }], ["text", { letterSpacing: Infinity }],
    ["text", { textAlign: "center", align: "right" }], ["style", { blendMode: "unknown" }],
    ["style", { effects: { shadow: { blur: NaN } } }], ["style", { effects: { mystery: {} } }],
    ["style", { effects: { shadow: { color: "oops" } } }], ["style", { strokeDash: [2, -1] }],
    ["style", { gradient: { type: "linear", stops: [] } }], ["style", { fill: "linear-gradient(bogus)" }],
  ])("rejects invalid %s fields without writing anything", async (type, patch) => {
    await expect(executeCanvasTool(`mutate_layer_${type}`, { layerId: type === "text" ? "text" : "rect", patch })).rejects.toMatchObject({ code: "agentInvalidArgs" });
    expect(editor.updateNode).not.toHaveBeenCalled();
  });
  it("validates the entire batch before any mutation", async () => {
    await expect(executeCanvasTool("batch_mutate_layers", { mutations: [
      { type: "text", layerId: "text", patch: { italic: true } },
      { type: "style", layerId: "rect", patch: { layerBlur: -1 } },
    ] })).rejects.toMatchObject({ code: "agentInvalidArgs" });
    expect(editor.updateNodes).not.toHaveBeenCalled();
  });
  it("rejects text mutation on a non-text layer", async () => {
    await expect(executeCanvasTool("mutate_layer_text", { layerId: "rect", patch: { italic: true } })).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });
  it("advertises the new fields in both the editor and generated MCP tool catalog", async () => {
    const { buildMcpTools } = await import("../../electron/mcp_server/tool_catalog.js");
    for (const name of ["mutate_layer_style", "mutate_layer_text"]) {
      const schema = CANVAS_TOOL_SCHEMAS.find((entry) => entry.function.name === name).function.parameters;
      expect(buildMcpTools().find((entry) => entry.name === name).inputSchema).toEqual(schema);
    }
    expect(validateLayerPatch("text", { fontSize: 24 })).toEqual({ fontSize: 24 });
  });
});
