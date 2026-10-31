import { describe, it, expect, vi } from "vitest";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model_core.js";

describe("Text on Path engine operations", () => {
  it("creates a Text on Path node along selected path via typeOnSelectedPath", () => {
    let doc = {
      nodes: [
        {
          id: "path-1",
          kind: NODE_KIND.PATH,
          x: 10,
          y: 20,
          width: 200,
          height: 50,
          points: [
            { x: 0, y: 0, close: false },
            { x: 200, y: 50, close: false },
          ],
        },
      ],
    };

    let selectedIds = ["path-1"];
    const selection = {
      getIds: () => selectedIds,
      setIds: (ids) => {
        selectedIds = ids;
      },
    };

    const getDoc = () => doc;
    const setDoc = (next) => {
      doc = next;
    };
    const requestRender = vi.fn();
    const notify = vi.fn();

    const ops = createEngineNodeOps({
      getDoc,
      setDoc,
      selection,
      requestRender,
      notify,
    });

    const success = ops.typeOnSelectedPath();
    expect(success).toBe(true);
    expect(doc.nodes.length).toBe(2);

    const textNode = doc.nodes.find((n) => n.kind === NODE_KIND.TEXT);
    expect(textNode).toBeDefined();
    expect(textNode.textPath).toBeDefined();
    expect(textNode.textPath.points.length).toBe(2);
    // Verified doc-coordinates conversion: (path.x + pt.x, path.y + pt.y)
    expect(textNode.textPath.points[0].x).toBe(10);
    expect(textNode.textPath.points[0].y).toBe(20);
    expect(textNode.textPath.points[1].x).toBe(210);
    expect(textNode.textPath.points[1].y).toBe(70);

    // Selected node updated to new text node
    expect(selectedIds).toEqual([textNode.id]);
    expect(requestRender).toHaveBeenCalled();
  });

  it("attaches existing text to a path via attachTextToPath", () => {
    let doc = {
      nodes: [
        {
          id: "text-1",
          kind: NODE_KIND.TEXT,
          text: "Headline Along Curve",
          x: 0,
          y: 0,
          width: 100,
          height: 30,
        },
        {
          id: "path-1",
          kind: NODE_KIND.PATH,
          x: 50,
          y: 50,
          width: 300,
          height: 100,
          points: [
            { x: 0, y: 0 },
            { x: 300, y: 100 },
          ],
        },
      ],
    };

    let selectedIds = ["text-1", "path-1"];
    const selection = {
      getIds: () => selectedIds,
      setIds: (ids) => {
        selectedIds = ids;
      },
    };

    const ops = createEngineNodeOps({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      selection,
      requestRender: vi.fn(),
      notify: vi.fn(),
    });

    const success = ops.attachTextToPath();
    expect(success).toBe(true);

    const updatedText = doc.nodes.find((n) => n.id === "text-1");
    expect(updatedText.textPath).toBeDefined();
    expect(updatedText.textPath.points[0].x).toBe(50);
    expect(updatedText.textPath.points[1].x).toBe(350);
  });

  it("detaches text from path via detachTextFromPath", () => {
    let doc = {
      nodes: [
        {
          id: "text-1",
          kind: NODE_KIND.TEXT,
          text: "Freed Text",
          x: 50,
          y: 50,
          width: 120,
          height: 30,
          textPath: {
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
        },
      ],
    };

    let selectedIds = ["text-1"];
    const selection = {
      getIds: () => selectedIds,
      setIds: (ids) => {
        selectedIds = ids;
      },
    };

    const ops = createEngineNodeOps({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      selection,
      requestRender: vi.fn(),
      notify: vi.fn(),
    });

    const success = ops.detachTextFromPath();
    expect(success).toBe(true);

    const textNode = doc.nodes.find((n) => n.id === "text-1");
    expect(textNode.textPath).toBeUndefined();
    expect(textNode.text).toBe("Freed Text");
  });

  it("applies node rotation to anchors and handles when creating text on path", () => {
    let doc = {
      nodes: [
        {
          id: "path-rot",
          kind: NODE_KIND.PATH,
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          rotation: 90,
          points: [
            { x: 0, y: 100, out: [50, 0] },
            { x: 200, y: 100, in: [-50, 0] },
          ],
        },
      ],
    };

    let selectedIds = ["path-rot"];
    const selection = {
      getIds: () => selectedIds,
      setIds: (ids) => {
        selectedIds = ids;
      },
    };

    const ops = createEngineNodeOps({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      selection,
      requestRender: vi.fn(),
      notify: vi.fn(),
    });

    const success = ops.typeOnSelectedPath();
    expect(success).toBe(true);
    const textNode = doc.nodes.find((n) => n.kind === NODE_KIND.TEXT);
    expect(textNode).toBeDefined();
    expect(textNode.textPath).toBeDefined();

    // Center is (200, 200). Local (0, 100) -> (-100, 0) rotated 90° -> (0, -100) + center = (200, 100)
    expect(Math.round(textNode.textPath.points[0].x)).toBe(200);
    expect(Math.round(textNode.textPath.points[0].y)).toBe(100);

    // Local (200, 100) -> (100, 0) rotated 90° -> (0, 100) + center = (200, 300)
    expect(Math.round(textNode.textPath.points[1].x)).toBe(200);
    expect(Math.round(textNode.textPath.points[1].y)).toBe(300);

    // Handle out: [50, 0] rotated 90° becomes [0, 50]
    expect(Math.round(textNode.textPath.points[0].out[0])).toBe(0);
    expect(Math.round(textNode.textPath.points[0].out[1])).toBe(50);
  });
});
