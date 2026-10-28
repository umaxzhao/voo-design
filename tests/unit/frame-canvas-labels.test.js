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
});
