import { expect, it } from "vitest";
import { workspaceRenderDocument } from "../../src/canvas/components/image_editor_helpers.js";
import { documentsToScene } from "../../src/canvas/editor/skia_scene_adapter.js";

it("moves painted frames with editor page layouts despite persisted canvas IDs", () => {
  const saved = { id: "saved-id", canvasId: "canvas-id", width: 1200, height: 871,
    backgroundColor: "#171717", nodes: [] };
  const doc = workspaceRenderDocument(saved, "editor-page");
  const layouts = new Map([["editor-page", { x: 48, y: 48 }]]);
  const before = documentsToScene([doc], { layouts });
  expect(before[0].bounds).toMatchObject({ x: 48, y: 48 });
  layouts.set("editor-page", { x: 408, y: 198 });
  const after = documentsToScene([doc], { layouts });
  expect(after[0].bounds).toMatchObject({ x: 408, y: 198 });
  expect(after[0].fills).toEqual(before[0].fills);
  expect(saved.id).toBe("saved-id");
  expect(doc.canvasId).toBe("canvas-id");
});

it("keeps placement unchanged when another frame is added", () => {
  const doc = { width: 1200, height: 800, nodes: [] };
  const first = workspaceRenderDocument(doc, "first");
  const second = workspaceRenderDocument(doc, "second");
  const layouts = new Map([["first", { x: 48, y: 48 }], ["second", { x: 1400, y: 48 }]]);
  const single = documentsToScene([first], { layouts });
  const multiple = documentsToScene([first, second], { layouts });
  expect(multiple[0]).toEqual(single[0]);
  expect(multiple[1].bounds.x).toBe(1400);
});
