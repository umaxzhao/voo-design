import { describe, expect, it, vi } from "vitest";
import { shouldDragArtboardBody } from "../../src/canvas/components/artboard-body-gesture.js";
import { nodeAtPoint } from "../../src/canvas/editor/doc_ops_nodes.js";

function makeEngine({ zoom = 1, left = 0, top = 0, selectedIds = [], locked = false, visible = true } = {}) {
  const doc = { nodes: [{ id: "rect", kind: "rect", x: 100, y: 80,
    width: 200, height: 120, fill: "#ffffff", visible, locked }] };
  return {
    toDocPoint: (x, y) => ({ x: (x - left) / zoom, y: (y - top) / zoom }),
    nodeAtPoint: vi.fn((point, options) => nodeAtPoint(doc, point, { ...options, zoom })),
    getSelectedIds: () => selectedIds,
  };
}

describe("artboard body gesture routing", () => {
  it.each([[], [{ id: "frame", isFrame: true }]])("never drags an unbounded workspace as an artboard (%j)", nodes => {
    const engine = makeEngine();
    engine.getDocument = () => ({ isCanvasRoot: true, nodes });
    expect(shouldDragArtboardBody(engine, 500, 400)).toBe(false);
    expect(engine.nodeAtPoint).not.toHaveBeenCalled();
  });

  it.each([0.25, 0.5, 1, 2])("leaves unselected artwork to its engine at zoom %s", (zoom) => {
    const engine = makeEngine({ zoom, left: 334, top: 213 });
    expect(shouldDragArtboardBody(engine, 334 + 150 * zoom, 213 + 100 * zoom)).toBe(false);
  });

  it("uses the target frame's own document coordinates", () => {
    const first = makeEngine();
    const second = makeEngine({ left: 1200, top: 48, zoom: 0.5 });
    expect(shouldDragArtboardBody(second, 1275, 98)).toBe(false);
    expect(first.nodeAtPoint).not.toHaveBeenCalled();
  });

  it("allows dragging empty frame body", () => {
    expect(shouldDragArtboardBody(makeEngine(), 500, 400)).toBe(true);
  });

  it("allows dragging empty frame body while another object remains selected", () => {
    const engine = makeEngine({ selectedIds: ["rect"] });
    expect(shouldDragArtboardBody(engine, 500, 400)).toBe(true);
    expect(engine.nodeAtPoint).toHaveBeenCalledOnce();
  });

  it("leaves a selected object under the pointer to its transform gesture", () => {
    const engine = makeEngine({ selectedIds: ["rect"] });
    expect(shouldDragArtboardBody(engine, 150, 100)).toBe(false);
    expect(engine.nodeAtPoint).toHaveBeenCalledOnce();
  });

  it("does not turn a locked object drag into a frame drag", () => {
    expect(shouldDragArtboardBody(makeEngine({ locked: true }), 150, 100)).toBe(false);
  });

  it("ignores hidden artwork and waits for engines that are not ready", () => {
    expect(shouldDragArtboardBody(makeEngine({ visible: false }), 150, 100)).toBe(true);
    expect(shouldDragArtboardBody(null, 150, 100)).toBe(false);
  });
});
