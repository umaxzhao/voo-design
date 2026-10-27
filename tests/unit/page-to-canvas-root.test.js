import { describe, expect, it } from "vitest";
import { promoteFixedPageToFrame } from "../../src/canvas/editor/page_to_canvas_root.js";

import { documentToScene } from "../../src/canvas/editor/skia_scene_adapter.js";

describe("fixed page migration", () => {
  it("preserves painted page properties and nested relationships without mutating input", () => {
    const doc = {
      width: 640, height: 480, backgroundColor: "#123456", fillOpacity: 0.75,
      fills: [{ fill: "#123456", opacity: 0.75, visible: true }],
      cornerRadius: 12, clipContent: true,
      nodes: [{ id: "group", x: 20, y: 30 }, { id: "child", parentId: "group", x: 40, y: 50 }],
    };
    const before = structuredClone(doc);
    const migrated = promoteFixedPageToFrame(doc, "Poster");
    const [frame, group, child] = migrated.nodes;
    expect(migrated).toMatchObject({ isCanvasRoot: true, backgroundColor: "transparent" });
    expect(frame).toMatchObject({ name: "Poster", x: 0, y: 0, width: 640, height: 480,
      fill: "#123456", fillOpacity: 0.75, fills: doc.fills, cornerRadius: 12, clipContent: true });
    expect(group).toEqual({ ...doc.nodes[0], parentId: frame.id });
    expect(child).toBe(doc.nodes[1]);
    expect(doc).toEqual(before);
    expect(promoteFixedPageToFrame(migrated)).toBe(migrated);
    const paintedFrame = documentToScene({ ...migrated, nodes: migrated.nodes.map(({ fills, ...node }) => node) }, {}).find(element => element.id === frame.id);
    expect(paintedFrame).toMatchObject({ shape: "rect", fills: [{ color: "#123456", opacity: 0.75 }] });
  });

  it("does not wrap an existing free canvas or invent an absent document", () => {
    const doc = { isCanvasRoot: true, nodes: [] };
    expect(promoteFixedPageToFrame(doc)).toBe(doc);
    expect(promoteFixedPageToFrame(null)).toBeNull();
  });
});
