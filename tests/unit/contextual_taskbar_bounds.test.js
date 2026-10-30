import { describe, expect, it } from "vitest";
import { contextualBounds } from "../../src/canvas/components/editor_hooks/use_contextual_taskbar_rect.js";

const frame = {
  id: "frame",
  kind: "group",
  isFrame: true,
  x: 100,
  y: 80,
  width: 600,
  height: 400,
};
const nested = {
  id: "nested",
  parentId: "frame",
  kind: "group",
  isFrame: true,
  x: 150,
  y: 100,
  width: 200,
  height: 160,
};
const child = {
  id: "child",
  parentId: "nested",
  kind: "rect",
  x: 170,
  y: 120,
  width: 6,
  height: 36,
};
const rect = ({ x, y, width, height }) => ({ x, y, width, height });
function engineFor(nodes, ids = []) {
  return {
    getSelectedIds: () => ids,
    getNode: (id) => nodes.find((node) => node.id === id),
  };
}

describe("contextual toolbar board anchoring", () => {
  it("stays below the outer frame when selection changes between its descendants", () => {
    const other = { ...child, id: "other", x: 400, y: 350 };
    for (const ids of [
      ["child"],
      ["nested"],
      ["frame"],
      ["other"],
      ["child", "other"],
    ]) {
      expect(
        contextualBounds(engineFor([frame, nested, child, other], ids)),
      ).toEqual(rect(frame));
    }
  });
  it("follows frame geometry instead of a tiny pixel or transform selection", () => {
    const moved = { ...frame, x: 230, y: 180 };
    const engine = engineFor([moved, nested, child], ["child"]);
    engine.getSelectionTransform = () => ({ rect: rect(child) });
    engine.getPixelSelection = () => ({ contours: [[]], bounds: rect(child) });
    expect(contextualBounds(engine)).toEqual(rect(moved));
  });
  it("uses both outer frames when selected layers span boards", () => {
    const second = { ...frame, id: "second", x: 900 };
    expect(
      contextualBounds(
        engineFor([frame, nested, child, second], ["child", "second"]),
      ),
    ).toEqual({ x: 100, y: 80, width: 1400, height: 400 });
  });
  it("anchors pen editing to its frame and handles broken ancestry safely", () => {
    const engine = engineFor([frame, nested, child]);
    engine.penEdit = { nodeId: "child" };
    expect(contextualBounds(engine)).toEqual(rect(frame));
    const cycle = { ...child, parentId: "child" };
    expect(contextualBounds(engineFor([cycle], ["child"]))).toEqual(
      rect(child),
    );
  });
  it("keeps independent artwork anchored to its own bounds", () => {
    const loose = { ...child, parentId: null };
    expect(contextualBounds(engineFor([loose], ["child"]))).toEqual(
      rect(loose),
    );
    expect(contextualBounds(engineFor([]))).toBeNull();
  });
});
