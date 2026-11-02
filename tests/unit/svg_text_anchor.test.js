import { describe, expect, it } from "vitest";
import {
  measureSvgTextWidth,
  calculateSvgTextAnchorOffset,
} from "../../src/canvas/editor/editor_svg_text.js";
import { parseSvgStringToNodes } from "../../src/canvas/editor/editor_svg_import.js";
import { parseSvgToNodes } from "../../src/canvas/agent/svg_to_nodes.js";

describe("SVG text-anchor horizontal offset conversion and measurement", () => {
  it("calculates anchor offset correctly for middle, end, start and default", () => {
    expect(calculateSvgTextAnchorOffset("middle", 120)).toBe(-60);
    expect(calculateSvgTextAnchorOffset("Middle", 120)).toBe(-60);
    expect(calculateSvgTextAnchorOffset("end", 120)).toBe(-120);
    expect(calculateSvgTextAnchorOffset("END", 120)).toBe(-120);
    expect(calculateSvgTextAnchorOffset("start", 120)).toBe(0);
    expect(calculateSvgTextAnchorOffset(undefined, 120)).toBe(0);
    expect(calculateSvgTextAnchorOffset(null, 120)).toBe(0);
    expect(calculateSvgTextAnchorOffset("invalid", 120)).toBe(0);
  });

  it("measures SVG text width using fallback when DOM is absent", () => {
    const width = measureSvgTextWidth("Hello", 16);
    expect(width).toBeCloseTo(5 * 0.55 * 16, 1);
    expect(width).toBeGreaterThan(0);
  });

  it("converts text-anchor horizontal coordinates in editor_svg_import", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <text x="200" y="50" font-size="20" text-anchor="middle">Center Text</text>
        <text x="350" y="100" font-size="20" text-anchor="end">Right Text</text>
        <text x="50" y="150" font-size="20" text-anchor="start">Left Text</text>
      </svg>
    `;
    const { nodes, bounds } = parseSvgStringToNodes(svg);
    expect(nodes).toHaveLength(3);

    // Center Text: 11 chars * 0.55 * 20 = 121px width
    const centerNode = nodes[0];
    expect(centerNode.text).toBe("Center Text");
    expect(centerNode.align).toBe("center");
    expect(centerNode.width).toBe(121);
    expect(centerNode.height).toBe(25);
    expect(centerNode.x).toBeCloseTo(200 - 121 / 2, 1);

    // Right Text: 10 chars * 0.55 * 20 = 110px width
    const rightNode = nodes[1];
    expect(rightNode.text).toBe("Right Text");
    expect(rightNode.align).toBe("right");
    expect(rightNode.width).toBe(110);
    expect(rightNode.height).toBe(25);
    expect(rightNode.x).toBeCloseTo(350 - 110, 1);

    // Left Text: 9 chars * 0.55 * 20 = 99px width
    const leftNode = nodes[2];
    expect(leftNode.text).toBe("Left Text");
    expect(leftNode.width).toBe(99);
    expect(leftNode.height).toBe(25);
    expect(leftNode.x).toBe(50);

    // Bounds should include the text dimensions accurately
    expect(bounds.x).toBeLessThanOrEqual(50);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(350);
  });

  it("converts text-anchor horizontal coordinates in svg_to_nodes", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <text x="200" y="50" font-size="20" text-anchor="middle">Center Text</text>
        <text x="350" y="100" font-size="20" text-anchor="end">Right Text</text>
        <text x="50" y="150" font-size="20" text-anchor="start">Left Text</text>
      </svg>
    `;
    const { nodes } = parseSvgToNodes(svg);
    expect(nodes).toHaveLength(3);

    const centerNode = nodes[0];
    expect(centerNode.text).toBe("Center Text");
    expect(centerNode.align).toBe("center");
    expect(centerNode.width).toBe(121);
    expect(centerNode.height).toBe(25);
    expect(centerNode.x).toBeCloseTo(200 - 121 / 2, 1);

    const rightNode = nodes[1];
    expect(rightNode.text).toBe("Right Text");
    expect(rightNode.align).toBe("right");
    expect(rightNode.width).toBe(110);
    expect(rightNode.height).toBe(25);
    expect(rightNode.x).toBeCloseTo(350 - 110, 1);

    const leftNode = nodes[2];
    expect(leftNode.text).toBe("Left Text");
    expect(leftNode.width).toBe(99);
    expect(leftNode.height).toBe(25);
    expect(leftNode.x).toBe(50);
  });

  it("supports camelCase textAnchor in attributes and inline styles", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <text x="150" y="60" font-size="16" textAnchor="middle">Camel Middle</text>
        <text x="280" y="120" font-size="16" style="textAnchor: end;">Style Camel End</text>
      </svg>
    `;
    const { nodes: editorNodes } = parseSvgStringToNodes(svg);
    expect(editorNodes[0].align).toBe("center");
    expect(editorNodes[0].x).toBeLessThan(150);
    expect(editorNodes[1].align).toBe("right");
    expect(editorNodes[1].x).toBeLessThan(280);

    const { nodes: agentNodes } = parseSvgToNodes(svg);
    expect(agentNodes[0].align).toBe("center");
    expect(agentNodes[0].x).toBeLessThan(150);
    expect(agentNodes[1].align).toBe("right");
    expect(agentNodes[1].x).toBeLessThan(280);
  });

  it("handles positioned tspan text-anchor alignment in both importers", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
        <text font-size="16">
          <tspan x="200" y="50" text-anchor="middle">TSpan Middle</tspan>
          <tspan x="300" y="100" text-anchor="end">TSpan End</tspan>
        </text>
      </svg>
    `;
    const { nodes: editorNodes } = parseSvgStringToNodes(svg);
    expect(editorNodes).toHaveLength(2);
    expect(editorNodes[0].text).toBe("TSpan Middle");
    expect(editorNodes[0].align).toBe("center");
    expect(editorNodes[0].x).toBeLessThan(200);
    expect(editorNodes[0].width).toBeGreaterThan(0);
    expect(editorNodes[1].text).toBe("TSpan End");
    expect(editorNodes[1].align).toBe("right");
    expect(editorNodes[1].x).toBeLessThan(300);
    expect(editorNodes[1].width).toBeGreaterThan(0);

    const { nodes: agentNodes } = parseSvgToNodes(svg);
    expect(agentNodes).toHaveLength(2);
    expect(agentNodes[0].text).toBe("TSpan Middle");
    expect(agentNodes[0].align).toBe("center");
    expect(agentNodes[0].x).toBeLessThan(200);
    expect(agentNodes[0].width).toBeGreaterThan(0);
    expect(agentNodes[1].text).toBe("TSpan End");
    expect(agentNodes[1].align).toBe("right");
    expect(agentNodes[1].x).toBeLessThan(300);
    expect(agentNodes[1].width).toBeGreaterThan(0);
  });
});
