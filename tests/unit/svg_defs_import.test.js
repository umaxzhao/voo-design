import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseSvgStringToNodes } from "../../src/canvas/editor/editor_svg_import.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";
import { parseSvgToNodes } from "../../src/canvas/agent/svg_to_nodes.js";

describe("SVG import with defs, gradients, clipPath, mask and text", () => {
  const graphic1Path = path.resolve(__dirname, "../fixtures/roundtrip/graphic-1.svg");
  const graphic1Svg = fs.readFileSync(graphic1Path, "utf8");

  it("imports graphic-1.svg without falling back to solid black blocks", () => {
    const { nodes } = parseSvgStringToNodes(graphic1Svg);
    expect(nodes.length).toBeGreaterThanOrEqual(4);

    // 1. Verify linear gradient rect
    const gradientRect = nodes.find(
      (n) => n.kind === "rect" && typeof n.fill === "string" && n.fill.startsWith("linear-gradient"),
    );
    expect(gradientRect).toBeDefined();
    expect(gradientRect.fill).toContain("#3478ed");
    expect(gradientRect.fill).toContain("#e59bd9");
    expect(gradientRect.fill).not.toContain("url(#");
    expect(gradientRect.fill).not.toBe("#000000");

    // 2. Verify radial gradient circle / ellipse
    const gradientEllipse = nodes.find(
      (n) =>
        (n.kind === "ellipse" || n.kind === "path") &&
        typeof n.fill === "string" &&
        n.fill.startsWith("radial-gradient"),
    );
    expect(gradientEllipse).toBeDefined();
    expect(gradientEllipse.fill).toContain("#ffffff");
    expect(gradientEllipse.fill).toContain("#2966bb");
    expect(gradientEllipse.fill).not.toContain("url(#");
    expect(gradientEllipse.fill).not.toBe("#000000");

    // 3. Verify text node
    const textNode = nodes.find((n) => n.kind === "text");
    expect(textNode).toBeDefined();
    expect(textNode.text).toBe("Design 1");
    expect(textNode.fontSize).toBe(24);

    // 4. Verify clipPath and mask bases and clipTo references
    const clipBase = nodes.find((n) => n.maskBase && n.kind === "rect");
    expect(clipBase).toBeDefined();

    const maskBase = nodes.find((n) => n.maskBase && n.maskType === "luminance");
    expect(maskBase).toBeDefined();

    // Rect is clipped to mask; ellipse and text are clipped to clipPath
    expect(gradientRect.clipTo).toBe(maskBase.id);
    expect(gradientEllipse.clipTo).toBe(clipBase.id);
    expect(textNode.clipTo).toBe(clipBase.id);
  });

  it("roundtrips graphic-1.svg back into SVG preserving gradients, masks and text", () => {
    const { nodes } = parseSvgStringToNodes(graphic1Svg);
    const doc = { width: 320, height: 200, backgroundColor: "transparent", nodes };
    const exportedSvg = documentToSvg(doc);

    expect(exportedSvg).toContain("<linearGradient");
    expect(exportedSvg).toContain("<radialGradient");
    expect(exportedSvg).toContain("<mask");
    expect(exportedSvg).toContain("Design 1");
    expect(exportedSvg).toContain("#3478ED");
    expect(exportedSvg).toContain("#2966BB");
  });

  it("parses graphic-1.svg in svg_to_nodes without black blocks or dropouts", () => {
    const result = parseSvgToNodes(graphic1Svg);
    expect(result.warnings).toEqual([]);
    expect(result.nodes.length).toBeGreaterThanOrEqual(4);

    const gradientRect = result.nodes.find(
      (n) => n.kind === "rect" && typeof n.fill === "string" && n.fill.startsWith("linear-gradient"),
    );
    expect(gradientRect).toBeDefined();
    expect(gradientRect.fill).toContain("#3478ed");
    expect(gradientRect.fill).not.toBe("#000000");

    const radialNode = result.nodes.find(
      (n) => typeof n.fill === "string" && n.fill.startsWith("radial-gradient"),
    );
    expect(radialNode).toBeDefined();
    expect(radialNode.fill).toContain("#ffffff");
    expect(radialNode.fill).not.toBe("#000000");

    const textNode = result.nodes.find((n) => n.kind === "text");
    expect(textNode).toBeDefined();
    expect(textNode.text).toBe("Design 1");
  });

  it("resolves inherited gradient stops via href/xlink:href", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <defs>
          <linearGradient id="base">
            <stop offset="0" stop-color="#ff0000"/>
            <stop offset="1" stop-color="#0000ff"/>
          </linearGradient>
          <linearGradient id="derived" href="#base" x1="0" y1="0" x2="0" y2="1"/>
        </defs>
        <rect width="100" height="100" fill="url(#derived)"/>
      </svg>
    `;
    const { nodes } = parseSvgStringToNodes(svg);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].fill).toBe("linear-gradient(180deg, #ff0000 0%, #0000ff 100%)");
  });

  it("resolves <use> elements instantiating defined shapes", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <defs>
          <rect id="shared-box" width="30" height="30" fill="#123456"/>
        </defs>
        <use href="#shared-box" x="20" y="25"/>
      </svg>
    `;
    const { nodes } = parseSvgStringToNodes(svg);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].x).toBe(20);
    expect(nodes[0].y).toBe(25);
    expect(nodes[0].width).toBe(30);
    expect(nodes[0].height).toBe(30);
    expect(nodes[0].fill).toBe("#123456");
  });

  it("parses positioned tspans into distinct text nodes with editor coordinate conversion", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
        <text font-size="20" fill="#333333">
          <tspan x="10" y="30">First</tspan>
          <tspan x="10" y="60">Second</tspan>
        </text>
      </svg>
    `;
    const { nodes } = parseSvgStringToNodes(svg);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].text).toBe("First");
    expect(nodes[0].x).toBe(10);
    expect(nodes[0].y).toBe(10); // 30 - 20
    expect(nodes[1].text).toBe("Second");
    expect(nodes[1].x).toBe(10);
    expect(nodes[1].y).toBe(40); // 60 - 20
  });
});
