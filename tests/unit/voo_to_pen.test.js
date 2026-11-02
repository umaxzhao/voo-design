import { describe, expect, it } from "vitest";
import {
  buildPenDocument,
  localPathGeometry,
  penSaveLosses,
  serializePenDocument,
} from "../../src/canvas/pen/voo_to_pen.js";
import {
  parsePenDocument,
  isPenDocument,
} from "../../src/canvas/pen/pen_document.js";
import { penDocumentToVooFile } from "../../src/canvas/pen/pen_to_voo.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";
import { createDocument } from "../../src/canvas/editor/scene_doc_factory.js";
import {
  createRectNode,
  createEllipseNode,
} from "../../src/canvas/editor/scene_model_node_builders.js";
import { createGroupNode } from "../../src/canvas/editor/scene_model_groups.js";
import { createTextNode } from "../../src/canvas/editor/scene_model_text_effects.js";
import { createPenNode } from "../../src/canvas/editor/scene_model_paths.js";
import { isPenFileName, saveFormatOf } from "../../src/canvas/store/save_formats.js";

describe("Pen format identification & save format", () => {
  it("identifies .pen filenames and saveFormatOf", () => {
    expect(isPenFileName("card.pen")).toBe(true);
    expect(isPenFileName("path/to/my-design.PEN")).toBe(true);
    expect(isPenFileName("design.voo")).toBe(false);
    expect(saveFormatOf("app.pen")).toBe("pen");
    expect(saveFormatOf("app.fig")).toBe("fig");
    expect(saveFormatOf("app.voo")).toBe("voo");
  });
});

describe("voo_to_pen writer", () => {
  it("builds a valid Pen 2.20 document from basic scene nodes", () => {
    const doc = createDocument(800, 600, "#FFFFFF");

    const frame = createGroupNode({
      x: 50,
      y: 50,
      width: 400,
      height: 300,
      parentId: null,
    });
    frame.isFrame = true;
    frame.name = "MainFrame";
    frame.fill = "#1E1E1E";

    const rect = createRectNode({
      x: 20,
      y: 20,
      width: 100,
      height: 60,
      fill: "#FF5500",
      stroke: "#000000",
      strokeWidth: 2,
    });
    rect.name = "Button";
    rect.parentId = frame.id;
    rect.cornerRadius = 8;

    const ellipse = createEllipseNode({
      x: 150,
      y: 20,
      width: 60,
      height: 60,
      fill: "#00AAFF",
    });
    ellipse.parentId = frame.id;

    const text = createTextNode({
      x: 20,
      y: 100,
      text: "Hello Pen",
      fill: "#FFFFFF",
      fontSize: 18,
    });
    text.fontFamily = "Inter";
    text.fontWeight = "bold";
    text.parentId = frame.id;

    doc.nodes = [frame, rect, ellipse, text];

    const penDoc = buildPenDocument(doc);
    expect(penDoc.version).toBe("2.20");
    expect(isPenDocument(penDoc)).toBe(true);
    expect(penDoc.children).toHaveLength(1);

    const outFrame = penDoc.children[0];
    expect(outFrame.type).toBe("frame");
    expect(outFrame.name).toBe("MainFrame");
    expect(outFrame.width).toBe(400);
    expect(outFrame.height).toBe(300);
    expect(outFrame.fill).toBe("#1E1E1E");
    expect(outFrame.children).toHaveLength(3);

    const [outRect, outEllipse, outText] = outFrame.children;
    expect(outRect.type).toBe("rectangle");
    expect(outRect.name).toBe("Button");
    expect(outRect.fill).toBe("#FF5500");
    expect(outRect.stroke).toBe("#000000");
    expect(outRect.strokeWidth).toBe(2);
    expect(outRect.cornerRadius).toBe(8);

    expect(outEllipse.type).toBe("ellipse");
    expect(outEllipse.width).toBe(60);
    expect(outEllipse.height).toBe(60);

    expect(outText.type).toBe("text");
    expect(outText.content).toBe("Hello Pen");
    expect(outText.fontSize).toBe(18);
    expect(outText.fontWeight).toBe("bold");
    expect(outText.fontFamily).toBe("Inter");
  });

  it("exports vector paths with valid SVG path data", () => {
    const doc = createDocument(400, 400);
    const anchors = [
      { x: 0, y: 0 },
      { x: 50, y: 0, out: [10, 0] },
      { x: 100, y: 50, in: [0, -10], close: true },
    ];
    const pathNode = createPenNode(anchors, "#333333", 1.5);
    pathNode.x = 20;
    pathNode.y = 30;
    doc.nodes = [pathNode];

    const penDoc = buildPenDocument(doc);
    expect(penDoc.children).toHaveLength(1);
    const outPath = penDoc.children[0];
    expect(outPath.type).toBe("path");
    expect(typeof outPath.geometry).toBe("string");
    expect(outPath.geometry.startsWith("M")).toBe(true);
    expect(outPath.geometry.endsWith("Z")).toBe(true);
    expect(outPath.stroke).toBe("#333333");
    expect(outPath.strokeWidth).toBe(1.5);
  });

  it("serializes to valid UTF-8 JSON bytes that parsePenDocument accepts", () => {
    const doc = createDocument(500, 500);
    const rect = createRectNode({ x: 10, y: 10, width: 200, height: 100, fill: "#112233" });
    doc.nodes = [rect];

    const bytes = serializePenDocument(doc);
    expect(bytes instanceof Uint8Array).toBe(true);
    expect(bytes.length).toBeGreaterThan(0);

    const parsed = parsePenDocument(bytes);
    expect(parsed.version).toBe("2.20");
    expect(parsed.document.children).toHaveLength(1);
    expect(parsed.document.children[0].type).toBe("rectangle");
    expect(parsed.document.children[0].fill).toBe("#112233");
  });

  it("round-trips through pen_to_voo and voo_to_pen", () => {
    const originalPenDoc = {
      version: "2.20",
      children: [
        {
          type: "frame",
          id: "card",
          name: "Card",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          fill: "#FFFFFF",
          children: [
            {
              type: "rectangle",
              id: "thumb",
              name: "Thumbnail",
              x: 16,
              y: 16,
              width: 288,
              height: 120,
              cornerRadius: 12,
              fill: "#E2E8F0",
            },
            {
              type: "text",
              id: "title",
              name: "Title",
              x: 16,
              y: 150,
              width: 288,
              height: 24,
              content: "Card Title",
              fontSize: 16,
              fontWeight: "600",
              fontFamily: "Inter",
              fill: "#0F172A",
            },
          ],
        },
      ],
    };

    // 1. Import .pen -> VOO
    const vooRes = penDocumentToVooFile(originalPenDoc);
    const sceneDoc = vooRes.vooFile.document;
    expect(sceneDoc.nodes.length).toBeGreaterThanOrEqual(3);

    // 2. Export VOO -> .pen
    const exportedPen = buildPenDocument(sceneDoc);
    expect(exportedPen.version).toBe("2.20");
    expect(exportedPen.children.length).toBeGreaterThanOrEqual(1);

    const exportedFrame = exportedPen.children.find((c) => c.name === "Card" || c.type === "frame");
    expect(exportedFrame).toBeDefined();
    expect(exportedFrame.width).toBe(320);
    expect(exportedFrame.height).toBe(240);

    // Verify descendants exist
    const hasThumb = exportedFrame.children?.some(
      (c) => c.name === "Thumbnail" && c.type === "rectangle" && c.cornerRadius === 12
    );
    expect(hasThumb).toBe(true);

    const titleChild = exportedFrame.children?.find((c) => c.content === "Card Title");
    expect(titleChild).toBeDefined();
    expect(titleChild.type).toBe("text");
    expect(titleChild.fontSize).toBe(16);
  });

  it("calculates penSaveLosses correctly for unsupported features", () => {
    const doc = createDocument(600, 400, "#FAFAFA");

    const rect = createRectNode({ x: 0, y: 0, width: 100, height: 100 });
    // Add auto layout and mesh gradient (unwritable in Pen)
    rect.autoLayout = { direction: "horizontal" };
    rect.fill = "radial-gradient(circle, #fff, #000) /* mesh */";

    const videoNode = {
      id: "vid1",
      kind: NODE_KIND.VIDEO,
      x: 10,
      y: 10,
      width: 200,
      height: 150,
      visible: true,
    };

    doc.nodes = [rect, videoNode];

    const losses = penSaveLosses(doc, { pageCount: 2 });
    expect(losses.some((l) => l.key === "save.loss.pages")).toBe(true);
    expect(losses.some((l) => l.key === "pen.save.lossBackground")).toBe(true);
    expect(losses.some((l) => l.key === "pen.save.lossKinds")).toBe(true);
    expect(losses.some((l) => l.key === "pen.save.lossStructure")).toBe(true);
  });
});
