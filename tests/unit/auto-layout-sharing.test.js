import { describe, expect, it } from "vitest";
import { reflowAutoLayout } from "../../src/canvas/editor/auto-layout-reflow.js";
import { createBooleanNode } from "../../src/canvas/editor/scene_model_node_builders.js";

const rect = (id, patch = {}) => ({ id, kind: "rect", visible: true,
  x: 0, y: 0, width: 20, height: 20, fill: "#ff0000", ...patch });
const frame = (patch = {}) => rect("frame", { kind: "group", isFrame: true,
  width: 120, height: 40, autoLayout: { direction: "horizontal" }, ...patch });

describe("layout structural sharing and exact geometry", () => {
  it("keeps a settled static document and its nodes unchanged by identity", () => {
    const imported = { nodes: [frame(), rect("child", { parentId: "frame" }), rect("outside", { x: 300 })] };
    Object.freeze(imported.nodes);
    imported.nodes.forEach(Object.freeze);
    const doc = reflowAutoLayout(imported);
    expect(doc).toEqual(imported);
    expect(doc.nodes.every((node, i) => node !== imported.nodes[i])).toBe(true);
    Object.freeze(doc.nodes);
    doc.nodes.forEach(Object.freeze);
    const next = reflowAutoLayout(doc);
    expect(next === doc).toBe(true);
    expect(next.nodes === doc.nodes).toBe(true);
  });

  it("keeps an unrelated effected node while a different node is edited", () => {
    const original = reflowAutoLayout({ nodes: [frame(), rect("outside", { x: 200,
      effects: { innerShadow: { enabled: true, offsetX: 3, offsetY: 2 } } }), rect("edited", { x: 400 })] });
    const next = { ...original, nodes: original.nodes.map(node => node.id === "edited" ? { ...node, x: 401 } : node) };
    const laidOut = reflowAutoLayout(next);
    expect(laidOut.nodes[1] === original.nodes[1]).toBe(true);
    expect(laidOut.nodes[2]).toEqual(next.nodes[2]);
    expect(laidOut.nodes[2] === original.nodes[2]).toBe(false);
    expect(reflowAutoLayout(laidOut).nodes[2] === laidOut.nodes[2]).toBe(true);
    expect(original.nodes[2].x).toBe(400);
  });

  it("replaces changed boxes and moves descendants without mutating the input", () => {
    const normalized = reflowAutoLayout({ nodes: [frame({ x: 10, y: 20, autoLayout: { direction: "horizontal", padding: 5 } }),
      rect("nested", { kind: "group", x: 70, y: 80 }),
      rect("leaf", { parentId: "nested", x: 72, y: 83 }), rect("outside", { x: 400 })] });
    const doc = { ...normalized, nodes: normalized.nodes.map(node => node.id === "nested" ? { ...node, parentId: "frame" } : node) };
    const snapshot = structuredClone(doc);
    const next = reflowAutoLayout(doc);
    expect(next.nodes[0] === doc.nodes[0]).toBe(true);
    expect(next.nodes[1] === doc.nodes[1]).toBe(false);
    expect(next.nodes[2]).toMatchObject({ x: 17, y: 28 });
    expect(next.nodes[3] === doc.nodes[3]).toBe(true);
    expect(doc).toEqual(snapshot);
    expect(reflowAutoLayout(next).nodes).toEqual(next.nodes);
  });

  it("preserves fill-width text measurement metadata and unchanged resource node identities", () => {
    const resources = [rect("text", { kind: "text" }), rect("image", { kind: "image", imageId: "bitmap" }),
      rect("paint", { fills: [{ fill: "data:image/png;base64,pending" }] }), rect("mask", { maskId: "matte" }),
      rect("video", { kind: "video" })];
    const doc = { nodes: [frame(), rect("wrapped", { kind: "text", parentId: "frame", layoutWidth: "fill", width: 120 }), ...resources] };
    const next = reflowAutoLayout(doc);
    expect(next.nodes[1]).toMatchObject({ width: 120, boxWidth: 120 });
    expect(Object.hasOwn(doc.nodes[1], "boxWidth")).toBe(false);
    const stable = reflowAutoLayout(next);
    for (let i = 2; i < doc.nodes.length; i += 1) {
      expect(next.nodes[i]).toEqual(doc.nodes[i]);
      expect(stable.nodes[i] === next.nodes[i]).toBe(true);
    }
  });

  it("keeps exact numeric normalization instead of treating near-equal boxes as unchanged", () => {
    const doc = { nodes: [frame({ width: -0 })] };
    const next = reflowAutoLayout(doc);
    expect(Object.is(doc.nodes[0].width, -0)).toBe(true);
    expect(Object.is(next.nodes[0].width, 0)).toBe(true);
    expect(next.nodes[0] === doc.nodes[0]).toBe(false);
  });

  it("preserves unknown legacy paint metadata without interpreting it as a paint array", () => {
    const legacy = rect("legacy", { fills: { legacy: true }, strokes: [null] });
    const doc = { nodes: [frame(), legacy] };
    const next = reflowAutoLayout(doc);
    expect(next.nodes[1]).toEqual(legacy);
    expect(reflowAutoLayout(next).nodes[1] === next.nodes[1]).toBe(true);
  });

  it("continues to reconcile Boolean operands after layout changes", () => {
    const operands = [rect("a", { width: 10 }), rect("b", { x: 5, width: 10 })];
    const boolean = createBooleanNode(operands, "union", "frame");
    const doc = { nodes: [frame({ width: 120, autoLayout: { direction: "horizontal", padding: 10 } }),
      { ...boolean, layoutWidth: "fill" }, ...operands.map(node => ({ ...node, parentId: boolean.id }))] };
    const original = structuredClone(doc);
    const next = reflowAutoLayout(doc);
    const output = next.nodes.find(node => node.id === boolean.id);
    expect(output).toMatchObject({ x: 10, y: 10, width: 100 });
    expect(next.nodes.find(node => node.id === "a").x).toBe(10);
    expect(next.nodes.find(node => node.id === "b").width).toBeCloseTo(1000 / 15);
    expect(doc).toEqual(original);
  });
});
