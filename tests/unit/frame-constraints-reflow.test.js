import { describe, expect, it, vi } from "vitest";
import { reflowFrameNodeResize } from "../../src/canvas/editor/document-resize-constraints.js";
import { createEngineDocumentController } from "../../src/canvas/editor/editor_engine_document.js";

const frame = {
  id: "frame",
  kind: "group",
  isFrame: true,
  x: 100,
  y: 100,
  width: 200,
  height: 100,
};
const child = {
  id: "child",
  kind: "rect",
  parentId: "frame",
  x: 260,
  y: 110,
  width: 20,
  height: 20,
  constraints: { horizontal: "right", vertical: "top" },
};
const doc = { nodes: [frame, child], width: 1000, height: 1000 };

describe("frame constraint reflow", () => {
  it("keeps a right-constrained child pinned when the frame widens", () => {
    const next = reflowFrameNodeResize(doc, "frame", { width: 400 });
    const nextFrame = next.nodes.find((node) => node.id === "frame");
    const nextChild = next.nodes.find((node) => node.id === "child");
    expect(nextFrame.width).toBe(400);
    // trailing offset was 40 (200 - 160): x stays 400 - 40 - 20 = 340
    expect(nextChild.x).toBe(460);
  });

  it("carries an unconstrained child with the frame when it moves", () => {
    const plain = { ...child, constraints: undefined };
    const next = reflowFrameNodeResize(
      { ...doc, nodes: [frame, plain] },
      "frame",
      { x: 130 },
    );
    const nextChild = next.nodes.find((node) => node.id === "child");
    expect(nextChild.x).toBe(290);
  });

  it("is a no-op when the frame box does not change", () => {
    expect(reflowFrameNodeResize(doc, "frame", {})).toBe(doc);
  });

  it("moves nested constrained descendants with their constrained container", () => {
    const group = { ...child, id: "inner", kind: "group", x: 150, width: 100, height: 60 };
    const nested = { ...child, id: "nested", parentId: "inner", x: 220, y: 130 };
    const next = reflowFrameNodeResize({ ...doc, nodes: [frame, group, nested] }, "frame", { width: 400 });
    expect(next.nodes.find((node) => node.id === "inner").x).toBe(350);
    expect(next.nodes.find((node) => node.id === "nested").x).toBe(420);
    expect(nested.x).toBe(220);
  });

  it("carries an unconstrained group's entire subtree when the frame moves", () => {
    const group = { ...child, id: "inner", kind: "group", constraints: undefined };
    const nested = { ...child, id: "nested", parentId: "inner", x: 270 };
    const next = reflowFrameNodeResize({ ...doc, nodes: [frame, group, nested] }, "frame", { x: 130 });
    expect(next.nodes.find((node) => node.id === "inner").x).toBe(290);
    expect(next.nodes.find((node) => node.id === "nested").x).toBe(300);
  });

  it("leaves flow geometry to auto layout during frame resize", () => {
    const next = reflowFrameNodeResize({ ...doc, nodes: [{ ...frame, autoLayout: { direction: "horizontal" } }, child] },
      "frame", { width: 400 });
    expect(next.nodes.find((node) => node.id === "child").x).toBe(child.x);
  });

  it("keeps other frame attributes in the same atomic engine update", () => {
    const setDoc = vi.fn();
    const controller = createEngineDocumentController({ getDoc: () => doc, setDoc, crop: {}, viewportTools: {}, cameraMode: "shared" });
    controller.updateFrameNode("frame", { width: 400, rotation: 5, opacity: 0.5 });
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][0].nodes.find((node) => node.id === "frame"))
      .toMatchObject({ width: 400, rotation: 5, opacity: 0.5 });
  });
});
