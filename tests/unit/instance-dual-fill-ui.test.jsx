import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CanvasInstanceContent from "../../src/canvas/components/editor_canvas_instance_content.jsx";

const gradient = "linear-gradient(90deg, #ff0000 0%, #0000ff 100%) /* voo-gradient-line: 20% 20% 90% 22.5% */";
const sourceDoc = { width: 220, height: 160, backgroundColor: "transparent", nodes: [{
  id: "painted", kind: "rect", x: 0, y: 0, width: 220, height: 160, fill: gradient,
  fills: [{ fill: gradient, opacity: 1, visible: true }, { fill: "#00ff00", opacity: 0.35, visible: true }],
}] };

function svgOf(instance) {
  const html = renderToStaticMarkup(<CanvasInstanceContent sourceDoc={sourceDoc} instance={instance}
    width={220} height={160} resolveCanvas={() => null} visited={new Set()} depth={0} />);
  const uri = /src="(data:image\/svg\+xml;charset=utf-8,[^"]+)"/.exec(html)?.[1];
  expect(uri, "Live instance must use the common vector painter").toBeDefined();
  return decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
}

describe("live instance paint stack", () => {
  it("paints the secondary layer above a blue override without changing the master", () => {
    const svg = svgOf({ overrides: { nodes: { painted: { fill: "#0066ff" } } } });
    expect(svg).toContain('fill="#0066ff"');
    expect(svg).toContain('fill="#00ff00" fill-opacity="0.35"');
    expect(svg).not.toContain("linearGradient");
    expect(sourceDoc.nodes[0].fills[0].fill).toBe(gradient);
    expect(sourceDoc.nodes[0].fills[1].opacity).toBe(0.35);
  });

  it("retains the direction line and second paint before overrides", () => {
    const svg = svgOf({});
    expect(svg).toContain('x1="0.2" y1="0.2" x2="0.9" y2="0.23"');
    expect(svg).toContain('fill="#00ff00" fill-opacity="0.35"');
  });
});
