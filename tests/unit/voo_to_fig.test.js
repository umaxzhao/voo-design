import { describe, it, expect } from "vitest";
import { buildFigContainer, figSaveLosses, parseHexColor } from "../../src/canvas/figma/voo-to-fig.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";

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
    { id: "g1", kind: NODE_KIND.GROUP, name: "Card", x: 50, y: 40, width: 200, height: 120, visible: true, opacity: 0.5 },
    { id: "r1", kind: NODE_KIND.RECT, name: "Panel", parentId: "g1", x: 60, y: 50, width: 80, height: 40, fill: "#ff8000", stroke: "#000000", strokeWidth: 2, cornerRadius: 8, visible: true },
    { id: "e1", kind: NODE_KIND.ELLIPSE, name: "Dot", parentId: "g1", x: 160, y: 60, width: 30, height: 30, fill: "#00ff0080", stroke: "transparent", strokeWidth: 0, visible: false },
    { id: "t1", kind: NODE_KIND.TEXT, name: "Title", x: 10, y: 10, width: 100, height: 20, visible: true },
  ],
};

describe("VOO to Figma writer", () => {
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

  it("drops text and keeps only what the source envelope needs", () => {
    const { message } = buildFigContainer(SCENE, TEMPLATE);
    expect(message.nodeChanges.some((node) => node.name === "Title")).toBe(false);
    expect(message.blobs).toEqual([]);
    expect(message.ackID).toBeUndefined();
    expect(message.originFileKey).toBeUndefined();
    expect(message.nodeChangeOrder).toBeUndefined();
    expect(message.sessionID).toBe(7);
  });

  it("names the page and sets the canvas background from the document", () => {
    const { message } = buildFigContainer(SCENE, TEMPLATE, { pageName: "Cover" });
    const canvas = message.nodeChanges.find((node) => node.type === "CANVAS");
    expect(canvas.name).toBe("Cover");
    expect(canvas.backgroundColor.r).toBeCloseTo(16 / 255);
  });

  it("reports text, lost fills and extra pages before a save", () => {
    const losses = figSaveLosses(SCENE, { pageCount: 2 });
    expect(losses.map((loss) => loss.key)).toEqual(["save.loss.pages", "fig.save.lossKinds"]);
    expect(losses[1].params.kinds).toBe("text");
    const gradient = figSaveLosses({
      nodes: [{ id: "x", kind: NODE_KIND.RECT, fill: "linear-gradient(red, blue)", visible: true }],
    });
    expect(gradient).toEqual([{ key: "fig.save.lossFills", params: { count: 1 } }]);
  });
});
