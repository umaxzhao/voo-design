import { describe, expect, it } from "vitest";
import { parseSvgStringToNodes } from "../../src/canvas/editor/editor_svg_import.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";

const svg = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="paint" x1=".2" y1=".2" x2=".9" y2=".225">
<stop offset="0%" stop-color="#ff0000"/><stop offset="100%" stop-color="#0000ff"/>
</linearGradient></defs>
<rect x="180" y="120" width="220" height="160" fill="url(#paint)"/>
<rect x="180" y="120" width="220" height="160" fill="#00ff00" fill-opacity=".35"/>
</svg>`;

describe("SVG imported paint fidelity", () => {
  it("keeps independently editable paint alpha and endpoint positions through export", () => {
    const parsed = parseSvgStringToNodes(svg);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0].fill).toContain("voo-gradient-line: 20% 20% 90% 22.5%");
    expect(parsed.nodes[1].fillOpacity).toBe(0.35);
    expect(parsed.nodes[1].opacity).toBe(1);
    const exported = documentToSvg({ width: 600, height: 400, backgroundColor: "transparent", nodes: parsed.nodes });
    expect(exported).toContain('fill="#00ff00" fill-opacity="0.35"');
    expect(exported).toContain('x1="0.2" y1="0.2" x2="0.9" y2="0.23"');
  });

  it("inherits paint alpha, honors inline overrides, and keeps layer alpha independent", () => {
    const parsed = parseSvgStringToNodes(`<svg width="100" height="100"><g fill-opacity=".35" stroke-opacity=".4">
      <rect width="20" height="20" opacity=".5" fill="#00ff00"/>
      <ellipse cx="40" cy="40" rx="10" ry="10" fill-opacity=".1" style="fill-opacity:60%;stroke-opacity:.7"/>
    </g></svg>`);
    expect(parsed.nodes[0]).toMatchObject({ fillOpacity: 0.35, strokeOpacity: 0.4, opacity: 0.5 });
    expect(parsed.nodes[1]).toMatchObject({ fillOpacity: 0.6, strokeOpacity: 0.7, opacity: 1 });
  });
});
