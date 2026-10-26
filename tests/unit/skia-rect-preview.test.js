import { expect, it, vi } from "vitest";
import { createSkiaRectPreview } from "../../src/canvas/editor/skia-rect-preview.js";

it("replays unchanged painter runs and invalidates insertions and multi-object changes", () => {
  const pictures = [];
  const canvas = { clear() {}, save() {}, restore() {}, scale() {}, translate() {}, clipRect() {}, drawPicture: vi.fn() };
  const instance = {
    canvasKit: { parseColorString: value => value, ClipOp: { Intersect: 0 }, PictureRecorder: class {
      beginRecording() { return {}; }
      finishRecordingAsPicture() { const picture = { delete: vi.fn() }; pictures.push(picture); return picture; }
      delete() {}
    } },
    painter: { drawElement: vi.fn() },
    acquireSurface: () => ({ getCanvas: () => canvas, flush() {} }),
  };
  const nodes = [0, 1, 2].map(index => ({ id: String(index), kind: "rect", x: index * 30, y: 20,
    width: 20, height: 20, fill: "#112233" }));
  const frame = { docs: [{ id: "page", width: 500, height: 400, nodes }], snapshot: { backgroundColor: "#525252" },
    viewport: { x: 10, y: 20, zoom: 0.75, devicePixelRatio: 1 }, layouts: { page: { x: 48, y: 48 } } };
  const preview = createSkiaRectPreview({ minimumNodes: 1 });
  expect(preview.draw(instance, frame)).toBe(false);
  const moved = [nodes[0], { ...nodes[1], x: 100 }, nodes[2]];
  expect(preview.draw(instance, { ...frame, docs: [{ ...frame.docs[0], nodes: moved }] })).toBe(true);
  expect(pictures).toHaveLength(2);
  expect(canvas.drawPicture).toHaveBeenCalledTimes(2);
  expect(instance.painter.drawElement.mock.lastCall[1].bounds.x).toBe(148);
  expect(preview.draw(instance, { ...frame, docs: [{ ...frame.docs[0], nodes: [nodes[0], { ...nodes[1], x: 150 }, nodes[2]] }] })).toBe(true);
  expect(pictures).toHaveLength(2);
  const calls = instance.painter.drawElement.mock.calls.length;
  expect(preview.draw(instance, { ...frame, docs: [{ ...frame.docs[0], nodes: [nodes[0], { ...nodes[1], visible: false }, nodes[2]] }] })).toBe(true);
  expect(instance.painter.drawElement.mock.calls.length - calls).toBe(1);
  expect(preview.draw(instance, { ...frame, docs: [{ ...frame.docs[0], nodes: [...nodes, { ...nodes[0], id: "new" }] }] })).toBe(false);
  expect(pictures.every(picture => picture.delete.mock.calls.length === 1)).toBe(true);
  preview.dispose();
});
