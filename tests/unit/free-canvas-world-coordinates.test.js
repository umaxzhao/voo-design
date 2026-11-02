import { describe, expect, it } from "vitest";
import { updateNode, withNodes } from "../../src/canvas/editor/doc_ops_nodes.js";

const frame = (id, x, y) => ({ id, kind: "group", isFrame: true,
  x, y, width: 200, height: 120, visible: true });
const document = () => ({ isCanvasRoot: true, width: 600, height: 400,
  crop: { x: 0, y: 0, width: 600, height: 400 }, nodes: [
    frame("moving", 20, 30),
    { id: "child", kind: "rect", parentId: "moving", x: 40, y: 50,
      width: 60, height: 30, fill: "#ff0000" },
    frame("stationary", 350, 80),
  ] });

describe("free-canvas world coordinates", () => {
  it.each([[-180, 30], [20, -90], [-180, -90], [10000, 15000]])(
    "preserves the world origin and document bounds at (%s, %s)", (x, y) => {
      const before = document();
      const after = updateNode(before, "moving", { x, y });
      expect(after.nodes[0]).toEqual({ ...before.nodes[0], x, y });
      expect(after.nodes.slice(1)).toEqual(before.nodes.slice(1));
      expect([after.width, after.height, after.crop]).toEqual([before.width, before.height, before.crop]);
      expect(before.nodes[0]).toMatchObject({ x: 20, y: 30 });
    },
  );

  it("does not repeatedly renormalise an existing negative tree during unrelated edits", () => {
    const before = document();
    before.nodes[0].x = -180;
    before.nodes[1].x = -160;
    const after = updateNode(before, "child", { fill: "#0000ff" });
    expect(after.nodes.map(({ x, y }) => [x, y])).toEqual(before.nodes.map(({ x, y }) => [x, y]));
    expect(after.nodes[1].fill).toBe("#0000ff");
    expect(withNodes(after, after.nodes)).toEqual(after);
  });

  it("keeps ordinary document geometry and explicit crop semantics unchanged", () => {
    const before = { ...document(), isCanvasRoot: false };
    const after = updateNode(before, "moving", { x: -180, y: -90 });
    expect(after).toEqual({ ...before, nodes: [{ ...before.nodes[0], x: -180, y: -90 }, ...before.nodes.slice(1)] });
  });
});
