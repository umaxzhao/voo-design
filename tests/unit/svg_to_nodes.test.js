import { describe, expect, it } from "vitest";

import { parseSvgToNodes } from "../../src/canvas/agent/svg_to_nodes.js";

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg"';

function firstNode(result) {
  expect(result.nodes.length).toBeGreaterThan(0);
  return result.nodes[0];
}

function pathNumbers(data) {
  return (data.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
}

describe("parseSvgToNodes: basic shapes", () => {
  it("parses a rect with the SVG default fill and no stroke", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100"><rect x="10" y="20" width="30" height="40"/></svg>`,
    );
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.viewBox).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.nodes).toEqual([
      {
        kind: "rect",
        name: "rect-1",
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        rx: 0,
        fill: "#000000",
        stroke: null,
        strokeWidth: null,
        opacity: 1,
      },
    ]);
  });

  it("keeps a rect's corner radius and uses the id as the node name", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100"><rect id="bar" x="0" y="0" width="40" height="20" rx="6"/></svg>`,
    );
    const node = firstNode(result);
    expect(node.kind).toBe("rect");
    expect(node.name).toBe("bar");
    expect(node.rx).toBe(6);
  });

  it("converts a circle to a closed cubic-bezier path", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100"><circle cx="50" cy="50" r="10"/></svg>`,
    );
    const node = firstNode(result);
    expect(node.kind).toBe("path");
    expect(node.d.startsWith("M 60 50 C ")).toBe(true);
    expect(node.d.endsWith(" Z")).toBe(true);
    expect(node.fill).toBe("#000000");
    expect(node.stroke).toBeNull();
    // 4 cubic segments + close.
    expect(pathNumbers(node.d).length).toBe(26);
  });

  it("converts ellipse, line, polyline and polygon to paths", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<ellipse cx="20" cy="20" rx="10" ry="5"/>' +
        '<line x1="0" y1="0" x2="30" y2="40"/>' +
        '<polyline points="0,0 10,0 10,10"/>' +
        '<polygon points="0,0 10,0 10,10"/>' +
        "</svg>",
    );
    expect(result.nodes).toHaveLength(4);
    const [ellipse, line, polyline, polygon] = result.nodes;
    expect(ellipse.kind).toBe("path");
    expect(ellipse.d.startsWith("M 30 20 C ")).toBe(true);
    expect(line.d).toBe("M 0 0 L 30 40");
    expect(polyline.d).toBe("M 0 0 L 10 0 L 10 10");
    expect(polygon.d).toBe("M 0 0 L 10 0 L 10 10 Z");
  });

  it("preserves a path's d verbatim when no transform is involved", () => {
    const d = "M 4 4 L 20 4 L 20 20 Z";
    const result = parseSvgToNodes(`${SVG_OPEN} width="100" height="100"><path d="${d}"/></svg>`);
    expect(firstNode(result).d).toBe(d);
    expect(firstNode(result).kind).toBe("path");
  });

  it("preserves fill=\"none\" and defaults a visible stroke width to 1", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100"><path d="M0 0L10 10" fill="none" stroke="#000000"/></svg>`,
    );
    const node = firstNode(result);
    expect(node.fill).toBe("none");
    expect(node.stroke).toBe("#000000");
    expect(node.strokeWidth).toBe(1);
  });

  it("skips shapes with unusable geometry instead of throwing", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100"><rect width="0" height="10"/><circle r="0"/></svg>`,
    );
    expect(result.nodes).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("parseSvgToNodes: viewBox mapping", () => {
  it("scales and centers a 100x100 viewBox into a 200x200 target", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<rect x="10" y="10" width="20" height="20"/></svg>',
      { targetWidth: 200, targetHeight: 200 },
    );
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    expect(result.viewBox).toEqual([0, 0, 100, 100]);
    const node = firstNode(result);
    expect(node.x).toBe(20);
    expect(node.y).toBe(20);
    expect(node.width).toBe(40);
    expect(node.height).toBe(40);
  });

  it("maps a 1440x900 viewBox into a 720x450 target (scale 0.5)", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">' +
        '<rect x="100" y="200" width="400" height="100"/></svg>',
      { targetWidth: 720, targetHeight: 450 },
    );
    const node = firstNode(result);
    expect(node.x).toBeCloseTo(50, 5);
    expect(node.y).toBeCloseTo(100, 5);
    expect(node.width).toBeCloseTo(200, 5);
    expect(node.height).toBeCloseTo(50, 5);
  });

  it("letterboxes a non-matching aspect ratio and honors a viewBox origin", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 100 50">' +
        '<rect x="10" y="10" width="10" height="10"/></svg>',
      { targetWidth: 200, targetHeight: 200 },
    );
    // scale = min(2, 4) = 2, rendered 200x100 → 50px letterbox top/bottom.
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    const node = firstNode(result);
    expect(node.x).toBeCloseTo(0, 5);
    expect(node.y).toBeCloseTo(50, 5);
    expect(node.width).toBeCloseTo(20, 5);
    expect(node.height).toBeCloseTo(20, 5);
  });

  it("derives the missing target dimension from the source aspect ratio", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>',
      { targetWidth: 400 },
    );
    expect(result.width).toBe(400);
    expect(result.height).toBe(200);
    expect(firstNode(result).width).toBeCloseTo(40, 5);
  });

  it("maps circle geometry through the viewBox matrix", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="10"/></svg>',
      { targetWidth: 200, targetHeight: 200 },
    );
    const node = firstNode(result);
    expect(node.d.startsWith("M 120 100 C ")).toBe(true);
  });

  it("falls back to the svg width/height when there is no viewBox", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="10" height="10"/></svg>',
      { targetWidth: 100, targetHeight: 100 },
    );
    expect(firstNode(result).width).toBeCloseTo(20, 5);
  });

  it("defaults the destination to the declared svg viewport when no target is given", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">' +
        '<rect x="10" y="10" width="10" height="10"/></svg>',
    );
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    expect(firstNode(result).x).toBe(20);
    expect(firstNode(result).width).toBe(20);
  });
});

describe("parseSvgToNodes: transforms", () => {
  it("applies translate + scale in SVG order (leftmost outermost)", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<g transform="translate(10,20) scale(2)"><rect x="1" y="1" width="2" height="2"/></g>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.x).toBe(12);
    expect(node.y).toBe(22);
    expect(node.width).toBe(4);
    expect(node.height).toBe(4);
  });

  it("applies a matrix(a b c d e f) transform", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<rect x="1" y="1" width="2" height="2" transform="matrix(2 0 0 3 5 7)"/>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.x).toBe(7);
    expect(node.y).toBe(10);
    expect(node.width).toBe(4);
    expect(node.height).toBe(6);
  });

  it("composes nested group transforms", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<g transform="translate(5,5)"><g transform="scale(2)"><rect x="1" y="1" width="1" height="1"/></g></g>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.x).toBe(7);
    expect(node.y).toBe(7);
    expect(node.width).toBe(2);
  });

  it("rewrites path coordinates through the transform", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<g transform="translate(10,20)"><path d="M 0 0 L 10 0 L 10 10 Z"/></g>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.kind).toBe("path");
    expect(node.d).toBe("M 10 20 L 20 20 L 20 30 Z");
  });

  it("rewrites relative path commands after resolving them", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<path d="m 10 10 l 5 0 l 0 5 z"/></svg>',
      { targetWidth: 200, targetHeight: 200 },
    );
    expect(firstNode(result).d).toBe("M 20 20 L 30 20 L 30 30 Z");
  });

  it("applies rotation to paths", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<line x1="0" y1="0" x2="10" y2="0" transform="rotate(90)"/>' +
        "</svg>",
    );
    const numbers = pathNumbers(firstNode(result).d);
    expect(numbers[0]).toBeCloseTo(0, 5);
    expect(numbers[1]).toBeCloseTo(0, 5);
    expect(numbers[2]).toBeCloseTo(0, 5);
    expect(numbers[3]).toBeCloseTo(10, 5);
  });

  it("degrades a rotated rect to a path with a warning", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<rect x="0" y="0" width="10" height="10" transform="rotate(45)"/>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.kind).toBe("path");
    expect(node.d.endsWith("Z")).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("rotated/skewed <rect>"))).toBe(true);
  });

  it("scales and rotates arc commands through the viewBox matrix", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<path d="M 0 0 A 5 5 0 0 1 10 10"/></svg>',
      { targetWidth: 200, targetHeight: 200 },
    );
    const node = firstNode(result);
    expect(node.d).toBe("M 0 0 A 10 10 0 0 1 20 20");
  });

  it("tolerates compact arc flags (no separators)", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<path d="M 0 0 A 5 5 0 0110 10"/></svg>',
      { targetWidth: 200, targetHeight: 200 },
    );
    expect(firstNode(result).d).toBe("M 0 0 A 10 10 0 0 1 20 20");
  });
});

describe("parseSvgToNodes: paint and style", () => {
  it("inherits fill/stroke/stroke-width from a group", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<g fill="#123456" stroke="#abcdef" stroke-width="3"><rect width="10" height="10"/></g>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.fill).toBe("#123456");
    expect(node.stroke).toBe("#abcdef");
    expect(node.strokeWidth).toBe(3);
  });

  it("lets an inline style override presentation attributes", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<rect width="10" height="10" fill="#000000" stroke="none" style="fill:#ff0000; stroke:#00ff00; stroke-width:2"/>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.fill).toBe("#ff0000");
    expect(node.stroke).toBe("#00ff00");
    expect(node.strokeWidth).toBe(2);
  });

  it("multiplies group and element opacity", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<g opacity="0.5"><rect width="10" height="10" opacity="0.5"/></g>' +
        "</svg>",
    );
    expect(firstNode(result).opacity).toBe(0.25);
  });

  it("folds fill-opacity and stroke-opacity into rgba colors", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">` +
        '<rect width="10" height="10" fill="#ff0000" fill-opacity="0.5" stroke="#0000ff" stroke-opacity="0.25"/>' +
        "</svg>",
    );
    const node = firstNode(result);
    expect(node.fill).toBe("rgba(255,0,0,0.5)");
    expect(node.stroke).toBe("rgba(0,0,255,0.25)");
  });

  it("inherits paint from the <svg> root", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="#00ff00"><rect width="1" height="1"/></svg>',
    );
    expect(firstNode(result).fill).toBe("#00ff00");
  });

  it("scales stroke-width together with the viewBox mapping", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="#000000" stroke-width="2">' +
        '<path d="M 0 0 L 12 0"/></svg>',
      { targetWidth: 240, targetHeight: 240 },
    );
    expect(firstNode(result).strokeWidth).toBeCloseTo(20, 5);
  });

  it("degrades gradient paint servers to the fallback color with a warning", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#ffffff"/></linearGradient></defs>' +
        '<rect width="10" height="10" fill="url(#g)"/></svg>',
    );
    const node = firstNode(result);
    expect(node.fill).toBe("#000000");
    expect(result.warnings.some((warning) => warning.includes("paint server"))).toBe(true);
  });

  it("skips display:none elements with a warning", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="10" height="10">` +
        '<rect width="10" height="10" display="none"/>' +
        '<rect x="1" width="5" height="5"/>' +
        "</svg>",
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes("display:none"))).toBe(true);
  });
});

describe("parseSvgToNodes: dirty / unsupported input", () => {
  it("ignores defs, gradients, text, script and style content with warnings", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
        "<defs><linearGradient id=\"g\"><stop offset=\"0\"/></linearGradient><clipPath id=\"c\"><rect width=\"1\" height=\"1\"/></clipPath></defs>" +
        "<text x=\"0\" y=\"0\">hello</text>" +
        "<script>if (1 < 2) { document.title = \"x\"; }</script>" +
        "<style><![CDATA[ .a { fill: red; } ]]></style>" +
        '<rect x="5" y="5" width="10" height="10"/>' +
        "</svg>",
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].x).toBe(5);
    const joined = result.warnings.join("\n");
    expect(joined).toContain("<defs>");
    expect(joined).toContain("<text>");
    expect(joined).toContain("<script>");
    expect(joined).toContain("<style>");
  });

  it("warns once per unsupported element even when repeated", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="10" height="10">` +
        '<use href="#a"/><use href="#b"/><rect width="1" height="1"/></svg>',
    );
    const useWarnings = result.warnings.filter((warning) => warning.includes("<use>"));
    expect(useWarnings).toHaveLength(1);
  });

  it("skips invalid path data with a warning instead of throwing", () => {
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="10" height="10">` +
        '<path d="M 0 0 L"/><path d=""/><path d="M 0 0 L 5 5"/></svg>',
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes("invalid path data"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("without a non-empty d"))).toBe(true);
  });

  it("returns empty nodes + warnings for empty, non-string and rootless input", () => {
    for (const input of ["", "   ", null, 42, { svg: true }]) {
      const result = parseSvgToNodes(input);
      expect(result.nodes).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
    const rootless = parseSvgToNodes("<div><p>not svg</p></div>");
    expect(rootless.nodes).toEqual([]);
    expect(rootless.warnings.join("\n")).toContain("no <svg> root element found");
  });

  it("survives truncated markup without throwing", () => {
    for (const input of ["<svg", "<svg><path d=\"M 0 0 L", "<svg><g><rect width=\"1\" height=\"1\">"]) {
      expect(() => parseSvgToNodes(input)).not.toThrow();
    }
  });

  it("ignores an invalid viewBox with a warning and falls back to 100x100", () => {
    const result = parseSvgToNodes(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 -5 10"><rect width="10" height="10"/></svg>',
    );
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.viewBox).toBeNull();
    expect(result.warnings.some((warning) => warning.includes("invalid viewBox"))).toBe(true);
  });

  it("truncates at maxNodes with a warning", () => {
    const rects = Array.from(
      { length: 6 },
      (_, index) => `<rect x="${index * 2}" y="0" width="1" height="1"/>`,
    ).join("");
    const result = parseSvgToNodes(
      `${SVG_OPEN} width="100" height="100">${rects}</svg>`,
      { maxNodes: 3 },
    );
    expect(result.nodes).toHaveLength(3);
    expect(result.warnings.some((warning) => warning.includes("maxNodes=3"))).toBe(true);
  });
});
