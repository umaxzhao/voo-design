import { describe, expect, it } from "vitest";
import { parseFigmaPathContours } from "../../../src/canvas/figma/figma-path-nodes.js";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";

const guid = (localID) => ({ sessionID: 0, localID });

/** Little-endian path blob in the layout decodeFigmaPathBlob reads. */
function pathBlob(commands) {
  const bytes = [];
  const view = new DataView(new ArrayBuffer(4));
  for (const [command, ...values] of commands) {
    bytes.push(command);
    for (const value of values) {
      view.setFloat32(0, value, true);
      bytes.push(...new Uint8Array(view.buffer));
    }
  }
  return Uint8Array.from(bytes);
}

function squareCommands(origin, size) {
  const [x, y] = origin;
  return [
    [1, x, y],
    [2, x + size, y],
    [2, x + size, y + size],
    [2, x, y + size],
    [0],
  ];
}

/** A one-vector message whose geometry is `blobs[0]`, placed at (100, 100). */
function vectorMessage({ commands, windingRule = "NONZERO", strokeOnly = false }) {
  const geometry = { windingRule, commandsBlob: 0 };
  return {
    blobs: [pathBlob(commands)],
    nodeChanges: [
      { guid: guid(0), type: "DOCUMENT", name: "Doc" },
      {
        guid: guid(1),
        parentIndex: { guid: guid(0), position: "!" },
        type: "VECTOR",
        name: "Icon",
        transform: { m02: 100, m12: 100 },
        size: { x: 10, y: 10 },
        ...(strokeOnly
          ? { strokeGeometry: [geometry] }
          : { fillGeometry: [geometry] }),
        fillPaints: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 }, visible: true }],
      },
    ],
  };
}

describe("parseFigmaPathContours", () => {
  it("keeps straight and curved segments as anchors with relative handles", () => {
    const [contour] = parseFigmaPathContours("M0 0 L10 0 C10 5 5 10 0 10 Z");

    expect(contour.closed).toBe(true);
    expect(contour.anchors.map((anchor) => [anchor.x, anchor.y])).toEqual([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    expect(contour.anchors[1].out).toEqual([0, 5]);
    expect(contour.anchors[2].in).toEqual([5, 0]);
  });

  it("raises quadratic segments to cubic handles", () => {
    const [contour] = parseFigmaPathContours("M0 0 Q5 10 10 0");
    const [start, end] = contour.anchors;

    expect(start.out[0]).toBeCloseTo(10 / 3, 6);
    expect(start.out[1]).toBeCloseTo(20 / 3, 6);
    expect(end.in[0]).toBeCloseTo(-10 / 3, 6);
    expect(end.in[1]).toBeCloseTo(20 / 3, 6);
  });

  it("returns one contour per sub-path", () => {
    const contours = parseFigmaPathContours("M0 0 L10 0 L10 10 Z M20 20 L30 20 L30 30 Z");

    expect(contours).toHaveLength(2);
    expect(contours.every((contour) => contour.closed)).toBe(true);
  });
});

describe("Figma vector to pen path", () => {
  it("maps a filled vector to an editable pen path, positioned on the page", () => {
    const { pages } = figmaMessageToPages(vectorMessage({ commands: squareCommands([0, 0], 10) }));
    const [node] = pages[0].nodes;

    expect(node.kind).toBe("path");
    expect(node.pen).toBe(true);
    expect(node.fill).toBe("#0000ff");
    expect(node.fillRule).toBe("nonzero");
    expect(node.points.map((point) => [point.x, point.y])).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(node.points.at(-1).close).toBe(true);
  });

  it("keeps every sub-path of a hole as a separate closed contour", () => {
    const commands = [...squareCommands([0, 0], 10), ...squareCommands([3, 3], 4)];
    const { pages } = figmaMessageToPages(vectorMessage({ commands, windingRule: "ODD" }));
    const [node] = pages[0].nodes;
    const closeIndexes = node.points.flatMap((point, index) => (point.close ? [index] : []));

    expect(node.points).toHaveLength(8);
    expect(closeIndexes).toEqual([3, 7]);
    expect(node.fillRule).toBe("evenodd");
  });

  it("paints outline-only geometry as a region in the stroke colour", () => {
    const message = vectorMessage({ commands: squareCommands([0, 0], 10), strokeOnly: true });
    message.nodeChanges[1].strokePaints = [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }];
    const { pages } = figmaMessageToPages(message);
    const [node] = pages[0].nodes;

    expect(node.kind).toBe("path");
    expect(node.fill).toBe("#ff0000");
    expect(node.strokeWidth).toBe(0);
  });
});
