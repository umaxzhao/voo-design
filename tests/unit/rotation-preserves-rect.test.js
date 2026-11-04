import { describe, expect, it, vi } from "vitest";
import { createTransformApi } from "../../src/canvas/editor/editor_transform_api.js";

/** Rotation is a transform patch: it must never rewrite a rect into a path. */
function editorWith(nodes) {
  let doc = {
    width: 600,
    height: 400,
    nodes: nodes.map((node) => ({ ...node })),
  };
  const setDoc = vi.fn((next) => {
    doc = next;
  });
  const api = createTransformApi({
    getDoc: () => doc,
    setDoc,
    getSelectedIds: () => ["rect"],
    getSelectedId: () => "rect",
  });
  return { api, getDoc: () => doc };
}

describe("rectangle rotation preserves its node identity", () => {
  it("keeps kind, name and corner radius when rotating 90° from the inspector", async () => {
    const { api, getDoc } = editorWith([{
      id: "rect",
      kind: "rect",
      name: "Card",
      x: 100,
      y: 80,
      width: 120,
      height: 60,
      cornerRadius: 12,
      fill: "#ff0000",
      rotation: 0,
    }]);
    const changed = await api.rotateClockwise();
    expect(changed).toBe(true);
    expect(getDoc().nodes[0]).toMatchObject({
      kind: "rect",
      name: "Card",
      cornerRadius: 12,
      width: 120,
      height: 60,
      rotation: 90,
    });
    expect(getDoc().nodes[0].pen).toBeUndefined();
    expect(getDoc().nodes[0].points).toBeUndefined();
  });

  it("keeps an already rotated rect a rect on a second rotation", async () => {
    const { api, getDoc } = editorWith([{
      id: "rect",
      kind: "rect",
      name: "Rotated card",
      x: 100,
      y: 80,
      width: 120,
      height: 60,
      cornerRadius: 8,
      rotation: 45,
    }]);
    await api.rotateClockwise();
    expect(getDoc().nodes[0]).toMatchObject({
      kind: "rect",
      name: "Rotated card",
      cornerRadius: 8,
      rotation: 135,
    });
  });
});
