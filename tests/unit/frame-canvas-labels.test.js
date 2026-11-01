import { describe, expect, it } from "vitest";
import { visibleCanvasFrameLabels } from "../../src/canvas/editor/frame-canvas-labels.js";

describe("visible canvas frame labels", () => {
  it("shows outer frames and hides frames nested through groups", () => {
    const doc = {
      isCanvasRoot: true,
      nodes: [
        { id: "outer", isFrame: true },
        { id: "group", parentId: "outer" },
        { id: "inner", isFrame: true, parentId: "group" },
        { id: "group-frame", isFrame: true, parentId: "group" },
        { id: "separate", isFrame: true },
      ],
    };

    expect(visibleCanvasFrameLabels(doc).map((node) => node.id)).toEqual([
      "outer",
      "separate",
    ]);
  });

  it("does not add frame labels to ordinary page documents", () => {
    expect(
      visibleCanvasFrameLabels({
        isCanvasRoot: false,
        nodes: [{ id: "frame", isFrame: true }],
      }),
    ).toEqual([]);
  });

  it("reuses unchanged ancestry across zoom frames and invalidates structural edits", () => {
    const nodes = [{ id: "outer", isFrame: true }, { id: "inner", isFrame: true, parentId: "outer" }];
    const labels = visibleCanvasFrameLabels({ isCanvasRoot: true, nodes });
    expect(visibleCanvasFrameLabels({ isCanvasRoot: true, nodes })).toBe(labels);
    expect(visibleCanvasFrameLabels({ isCanvasRoot: true, nodes: [nodes[0], { ...nodes[1], parentId: null }] }))
      .toEqual([nodes[0], { ...nodes[1], parentId: null }]);
  });
});
