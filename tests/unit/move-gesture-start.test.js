import { describe, expect, it, vi } from "vitest";
import { startNodeMoveGesture } from "../../src/canvas/editor/move-gesture-start.js";

function createStackApi() {
  const nodes = [
    { id: "bottom", kind: "rect", x: 0, y: 0, width: 20, height: 20 },
    { id: "top", kind: "rect", x: 0, y: 0, width: 20, height: 20 },
  ];
  let selectedIds = ["top"];
  const api = {
    getDocument: () => ({ nodes }),
    nodesAtPoint: vi.fn(() => [nodes[1], nodes[0]]),
    nodeAtPoint: vi.fn(() => nodes[1]),
    isSelected: id => selectedIds.includes(id),
    getSelected: () => nodes.find(node => selectedIds.includes(node.id)) ?? null,
    getSelectedIds: () => selectedIds,
    getSelectedNodes: () => nodes.filter(node => selectedIds.includes(node.id)),
    getSelectedGroup: () => null,
    selectExactly: vi.fn(ids => { selectedIds = [...ids]; }),
    select: vi.fn(id => { selectedIds = id ? [id] : []; }),
  };
  return { api, nodes };
}

describe("overlapping layer selection", () => {
  it.each([
    ["Meta", { metaKey: true, ctrlKey: false }],
    ["Control", { metaKey: false, ctrlKey: true }],
  ])("cycles to the next layer with Alt+%s-click", (_label, modifiers) => {
    const { api, nodes } = createStackApi();
    const setGesture = vi.fn();

    expect(startNodeMoveGesture({
      api,
      event: { ...modifiers, altKey: true, shiftKey: false },
      point: { x: 10, y: 10 },
      setGesture,
    })).toBe(true);

    expect(api.nodesAtPoint).toHaveBeenCalledWith({ x: 10, y: 10 });
    expect(api.selectExactly).toHaveBeenCalledWith(["bottom"]);
    expect(api.select).not.toHaveBeenCalled();
    expect(setGesture).toHaveBeenCalledWith(expect.objectContaining({
      id: "bottom",
      origins: [{ id: "bottom", x: 0, y: 0 }],
      beginDuplicate: null,
    }));
    expect(nodes.map(node => node.id)).toEqual(["bottom", "top"]);
  });
});
