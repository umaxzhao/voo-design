import { expect, it, vi } from "vitest";
import { attachArtboardArtwork, requiresWorkspaceCanvas2d, workspaceSkiaDocument } from "../../src/canvas/editor/workspace-artwork-routing.js";
import { documentsToScene } from "../../src/canvas/editor/skia_scene_adapter.js";

const frame = nodes => ({ id: "frame", width: 1200, height: 800, backgroundColor: "#171717", nodes });

it.each([
  { id: "image", kind: "image", imageId: "persisted-image" },
  { id: "text", kind: "text", text: "Canvas QA", fontFamily: "Inter" },
  { id: "paint", kind: "rect", fills: [{ fill: "#ff0000" }] },
  { id: "mask", kind: "rect", maskBase: "base" },
  { id: "video", kind: "video" },
])("keeps the frame visible while routing $kind artwork to its decoded compositor", node => {
  const original = frame([node]);
  expect(requiresWorkspaceCanvas2d(original)).toBe(true);
  const routed = workspaceSkiaDocument(original);
  expect(routed.nodes).toEqual([]);
  const resolveImageUrl = vi.fn();
  const scene = documentsToScene([routed], { layouts: new Map([["frame", { x: 100, y: 50 }]]), resolveImageUrl });
  expect(resolveImageUrl).not.toHaveBeenCalled();
  expect(scene).toHaveLength(1);
  expect(scene[0].bounds).toMatchObject({ x: 100, y: 50 });
  expect(scene[0].fills).toEqual([{ color: "#171717", opacity: 1 }]);
  expect(original.nodes).toEqual([node]);
});

it("keeps supported vector artwork on the existing Skia path", () => {
  const doc = frame([{ id: "rect", kind: "rect", fill: "#fff" }]);
  expect(workspaceSkiaDocument(doc)).toBe(doc);
});

it("repaints decoded images, moves, and undo from live engine events without waiting for React", () => {
  let doc = frame([{ id: "image", kind: "image", x: 10 }]);
  const listeners = new Set();
  const canvas = {};
  const engine = {
    getDocument: () => doc,
    renderLayerPass: vi.fn((target, ids) => ({ target, ids, x: doc.nodes[0]?.x })),
    subscribeRender: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  };
  const connection = attachArtboardArtwork({ canvas, engine });
  expect(engine.renderLayerPass).toHaveBeenLastCalledWith(canvas, ["image"]);
  doc = frame([{ id: "image", kind: "image", x: 80 }]);
  listeners.forEach(callback => callback());
  expect(engine.renderLayerPass.mock.results.at(-1).value.x).toBe(80);
  doc = frame([]);
  listeners.forEach(callback => callback());
  expect(engine.renderLayerPass).toHaveBeenLastCalledWith(canvas, []);
  connection.dispose();
  expect(listeners.size).toBe(0);
});
