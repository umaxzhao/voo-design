import { describe, expect, it } from "vitest";
import { createDefaultAdjustments, serialiseDocument } from "../../src/canvas/editor/scene_model.js";
import { reflowAutoLayout } from "../../src/canvas/editor/auto-layout-reflow.js";

const rect = (id, patch = {}) => ({ id, kind: "rect", x: 0, y: 0, width: 20, height: 20,
  fill: "#ff0000", ...patch });
const documentOf = nodes => ({ version: 2, width: 600, height: 400, backgroundColor: "transparent", nodes });

describe("document serialization does not mutate shared scene records", () => {
  it("serializes frozen live records while omitting only detached transient/default fields", () => {
    const node = Object.freeze(rect("image", { kind: "image", imageId: "durable",
      src: "blob:session-image", cornerRadius: 12, adjustments: createDefaultAdjustments() }));
    const doc = documentOf(Object.freeze([node]));
    const result = serialiseDocument(doc);
    expect(Object.hasOwn(result.nodes[0], "src")).toBe(false);
    expect(Object.hasOwn(result.nodes[0], "adjustments")).toBe(false);
    expect(result.nodes[0]).toMatchObject({ imageId: "durable", cornerRadius: 12 });
    expect(node.src).toBe("blob:session-image");
    expect(node.adjustments).toBeDefined();
  });

  it("does not rewrite current or historical nodes when reading dirty/saved snapshots", () => {
    const node = rect("shared", { adjustments: createDefaultAdjustments(), cornerRadius: 9 });
    const oldDoc = documentOf([node]);
    const current = { ...oldDoc, width: 700 };
    const snapshot = structuredClone(oldDoc);
    const first = JSON.stringify(serialiseDocument(oldDoc));
    JSON.stringify(serialiseDocument(current));
    expect(oldDoc).toEqual(snapshot);
    expect(current.nodes[0] === node).toBe(true);
    expect(JSON.stringify(serialiseDocument(oldDoc))).toBe(first);
  });

  it("detaches each output node so consumers cannot overwrite document fields", () => {
    const node = rect("detached");
    const result = serialiseDocument(documentOf([node]));
    result.nodes[0].fill = "#3388ff";
    expect(node.fill).toBe("#ff0000");
  });

  it("retains normalized layout identity and neutral adjustments after repeated saves", () => {
    const input = documentOf([rect("frame", { kind: "group", width: 120, height: 40,
      autoLayout: { direction: "horizontal" } }), rect("child", { parentId: "frame", adjustments: createDefaultAdjustments() })]);
    const doc = reflowAutoLayout(input);
    const child = doc.nodes[1];
    for (let i = 0; i < 3; i += 1) serialiseDocument(doc);
    expect(child.adjustments).toBeDefined();
    expect(reflowAutoLayout(doc).nodes[1] === child).toBe(true);
  });
});
