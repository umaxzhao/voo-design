import { describe, expect, it, vi } from "vitest";
import { reorderSelection } from "../../src/canvas/components/editor_contextual_taskbar.jsx";

function createEngine() {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id }));
  return {
    getDoc: () => ({ nodes }),
    reorderNode: vi.fn((id, direction) => {
      const index = nodes.findIndex((node) => node.id === id);
      const target = index + direction;
      if (target < 0 || target >= nodes.length) return;
      [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    }),
    nodes,
  };
}

describe("EditorContextualTaskBar selection reordering", () => {
  it("moves two selected layers forward while preserving their order", () => {
    const engine = createEngine();

    reorderSelection(engine, ["b", "c"], 1);

    expect(engine.nodes.map((node) => node.id)).toEqual(["a", "d", "b", "c"]);
    expect(engine.reorderNode.mock.calls).toEqual([["c", 1], ["b", 1]]);
  });

  it("moves two selected layers backward while preserving their order", () => {
    const engine = createEngine();

    reorderSelection(engine, ["b", "c"], -1);

    expect(engine.nodes.map((node) => node.id)).toEqual(["b", "c", "a", "d"]);
    expect(engine.reorderNode.mock.calls).toEqual([["b", -1], ["c", -1]]);
  });
});
