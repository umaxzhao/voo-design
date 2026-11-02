import { describe, it, expect } from "vitest";
import { buildFigContainer, figSaveLosses, parseHexColor } from "../../src/canvas/figma/voo-to-fig.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";
import { createFigmaExportTemplate } from "../../src/canvas/figma/figma-schema.js";
import { serializeFigFile, serializeFigArchive, parseFigFile } from "../../src/canvas/figma/fig-file.js";
import { decodeVectorPath } from "../../src/canvas/figma/figma-path-nodes.js";

/** Stands in for a parsed source file: the writer only reuses its schema, version and envelope. */
const TEMPLATE = {
  version: 106,
  schema: { definitions: [] },
  message: {
    type: "NODE_CHANGES",
    sessionID: 7,
    ackID: 3,
    originFileKey: "abc",
    nodeChangeOrder: [],
    nodeChanges: [{ guid: { sessionID: 9, localID: 9 } }],
    blobs: [{ bytes: new Uint8Array([1]) }],
  },
};

const SCENE = {
  width: 400,
  height: 300,
  backgroundColor: "#101010",
  nodes: [
    { id: "g1", kind: NODE_KIND.GROUP, isFrame: true, name: "Card", x: 50, y: 40, width: 200, height: 120, visible: true, opacity: 0.5, clipContent: true, autoLayout: { direction: "horizontal", gap: 12, crossGap: 6, padding: { top: 8, right: 16, bottom: 8, left: 16 }, justifyContent: "space-between", alignItems: "center", wrap: true } },
    { id: "r1", kind: NODE_KIND.RECT, name: "Panel", parentId: "g1", x: 60, y: 50, width: 80, height: 40, fill: "#ff8000", stroke: "#000000", strokeWidth: 2, cornerRadius: 8, visible: true },
    { id: "e1", kind: NODE_KIND.ELLIPSE, name: "Dot", parentId: "g1", x: 160, y: 60, width: 30, height: 30, fill: "#00ff0080", stroke: "transparent", strokeWidth: 0, visible: false },
    { id: "t1", kind: NODE_KIND.TEXT, name: "Title", x: 10, y: 10, width: 100, height: 20, text: "Hello Figma", fontSize: 24, fontFamily: "Inter", fontWeight: "700", italic: true, align: "center", underline: true, lineHeight: 1.4, letterSpacing: 0.5, visible: true },
  ],
};

describe("VOO to Figma writer", () => {
  it("creates a native Figma file from a VOO document without an imported Figma source", async () => {
    const template = await createFigmaExportTemplate();
    const container = buildFigContainer(SCENE, template, { pageName: "Cover" });
    const bytes = await serializeFigFile(container);
    const parsed = await parseFigFile(bytes);
    expect(parsed.message.nodeChanges.find((node) => node.type === "CANVAS").name).toBe("Cover");
    expect(parsed.message.nodeChanges.some((node) => node.name === "Panel")).toBe(true);
    expect(parsed.version).toBe(106);
    expect(parsed.message.type).toBe("NODE_CHANGES");
    expect(parsed.message.nodeChangeOrder).toBe("GUID");
  });

  it("embeds image bytes under the referenced Figma image hash", async () => {
    const image = { hash: new Uint8Array(20).fill(7), hashHex: "07".repeat(20), bytes: new Uint8Array([1, 2, 3]), name: "cover" };
    const scene = {
      nodes: [{ id: "image", kind: NODE_KIND.IMAGE, imageId: "cover", name: "Cover", x: 0, y: 0, width: 80, height: 60, visible: true }],
    };
    const container = buildFigContainer(scene, await createFigmaExportTemplate(), {
      imageAssets: new Map([["cover", image]]),
    });
    expect(container.message.nodeChanges.at(-1).fillPaints[0].image.hash).toEqual(image.hash);
    const archive = await serializeFigArchive(container, { name: "Cover", images: new Map([["cover", image]]) });
    const parsed = await parseFigFile(archive);
    expect(parsed.images.get(image.hashHex)).toEqual(image.bytes);
  });

  it("writes editable vector geometry and a matching vector network blob", async () => {
    const scene = {
      nodes: [{
        id: "path", kind: NODE_KIND.PATH, name: "Curve", x: 20, y: 30, width: 100, height: 80,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0, out: [0, 50] }, { x: 100, y: 80, in: [0, -30], close: true }],
        fill: "#ff0000", stroke: "#000000", strokeWidth: 2, fillRule: "evenodd", visible: true,
      }],
    };
    const container = buildFigContainer(scene, await createFigmaExportTemplate());
    const path = container.message.nodeChanges.at(-1);
    expect(path.type).toBe("VECTOR");
    expect(path.fillGeometry[0].windingRule).toBe("ODD");
    expect(decodeVectorPath(path, container.message.blobs)).toContain("M0 0");
    expect(decodeVectorPath(path, container.message.blobs)).toContain("Z");
    expect(path.vectorData.vectorNetworkBlob).not.toBe(path.fillGeometry[0].commandsBlob);
  });

  it("parses hex colours with and without alpha, and rejects other forms", () => {
    expect(parseHexColor("#ff0000")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseHexColor("#00000080").a).toBeCloseTo(128 / 255);
    expect(parseHexColor("transparent")).toBeNull();
    expect(parseHexColor(undefined)).toBeNull();
  });

  it("writes groups as frames and children relative to the frame", () => {
    const { message } = buildFigContainer(SCENE, TEMPLATE, { pageName: "Cover" });
    const layers = message.nodeChanges.slice(2);
    const frame = layers.find((node) => node.name === "Card");
    const rect = layers.find((node) => node.name === "Panel");
    expect(frame.type).toBe("FRAME");
    expect(frame.transform.m02).toBe(50);
    expect(rect.parentIndex.guid).toEqual(frame.guid);
    expect(rect.transform.m02).toBe(10);
    expect(rect.transform.m12).toBe(10);
    expect(frame.frameMaskDisabled).toBe(false);
    expect(frame.stackMode).toBe("HORIZONTAL");
    expect(frame.stackSpacing).toBe(12);
    expect(frame.stackPrimaryAlignItems).toBe("SPACE_BETWEEN");
    expect(frame.stackCounterAlignItems).toBe("CENTER");
  });

  it("keeps fills, strokes, radius and hidden state of rectangles and ellipses", () => {
    const { message } = buildFigContainer(SCENE, TEMPLATE);
    const layers = message.nodeChanges.slice(2);
    const rect = layers.find((node) => node.name === "Panel");
    expect(rect.type).toBe("ROUNDED_RECTANGLE");
    expect(rect.cornerRadius).toBe(8);
    expect(rect.fillPaints[0].color).toEqual({ r: 1, g: 128 / 255, b: 0, a: 1 });
    expect(rect.strokePaints[0].color.r).toBe(0);
    expect(rect.strokeWeight).toBe(2);
    const dot = layers.find((node) => node.name === "Dot");
    expect(dot.type).toBe("ELLIPSE");
    expect(dot.visible).toBe(false);
    expect(dot.fillPaints[0].opacity).toBeCloseTo(128 / 255);
    expect(dot.strokePaints).toEqual([]);
  });

  it("preserves editable text fields and writes a native node change envelope", () => {
    const { message } = buildFigContainer(SCENE, TEMPLATE);
    const title = message.nodeChanges.find((node) => node.name === "Title");
    expect(title.type).toBe("TEXT");
    expect(title.textData.characters).toBe("Hello Figma");
    expect(title.fontName).toEqual({ family: "Inter", style: "Bold Italic", postscript: "" });
    expect(title.textAlignHorizontal).toBe("CENTER");
    expect(title.textDecoration).toBe("UNDERLINE");
    expect(title.lineHeight).toEqual({ value: 140, units: "PERCENT" });
    expect(title.textUserLayoutVersion).toBe(5);
    expect(message.blobs).toEqual([]);
    expect(message.ackID).toBe(0);
    expect(message.originFileKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(message.sessionID).toBe(0);
    expect(message.type).toBe("NODE_CHANGES");
    expect(message.nodeChangeOrder).toBe("GUID");
  });

  it("names the page and sets the canvas background from the document", () => {
    const { message } = buildFigContainer(SCENE, TEMPLATE, { pageName: "Cover" });
    const canvas = message.nodeChanges.find((node) => node.type === "CANVAS");
    expect(canvas.name).toBe("Cover");
    expect(canvas.backgroundColor.r).toBeCloseTo(16 / 255);
  });

  it("reports text, lost fills and extra pages before a save", () => {
    const losses = figSaveLosses(SCENE, { pageCount: 2 });
    expect(losses.map((loss) => loss.key)).toEqual(["save.loss.pages"]);
    expect(losses).toEqual([{ key: "save.loss.pages" }]);
    const gradient = figSaveLosses({
      nodes: [{ id: "x", kind: NODE_KIND.RECT, fill: "linear-gradient(red, blue)", visible: true }],
    });
    expect(gradient).toEqual([]);
  });
});
