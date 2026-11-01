import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawPenNode } from "../../src/canvas/editor/render_pen_node.js";
import { drawPathNode } from "../../src/canvas/editor/render_path_node.js";
import { drawRectNode, drawEllipseNode } from "../../src/canvas/editor/render_basic_shapes.js";
import { drawBooleanNode } from "../../src/canvas/editor/render_boolean_node.js";
import { resolvePaintStyle } from "../../src/canvas/editor/render-paint-style.js";
import { fillsOf, strokeOf } from "../../src/canvas/editor/skia_adapter_paint.js";
import { elementFor } from "../../src/canvas/editor/skia_adapter_elements.js";
import { parseSvgStringToNodes } from "../../src/canvas/editor/editor_svg_import.js";
import { parseSvgToNodes } from "../../src/canvas/agent/svg_to_nodes.js";
import { parseSvgPath } from "../../src/canvas/editor/editor_svg_parse.js";
import { createPenNode } from "../../src/canvas/editor/scene_model_paths.js";
import { ICONS } from "../../src/canvas/agent/html_pipeline/lucide.js";

class MockPath2D {
  constructor() {
    this.ops = [];
  }
  moveTo(...args) {
    this.ops.push(["moveTo", ...args]);
  }
  lineTo(...args) {
    this.ops.push(["lineTo", ...args]);
  }
  bezierCurveTo(...args) {
    this.ops.push(["bezierCurveTo", ...args]);
  }
  closePath() {
    this.ops.push(["closePath"]);
  }
  rect(...args) {
    this.ops.push(["rect", ...args]);
  }
  roundRect(...args) {
    this.ops.push(["roundRect", ...args]);
  }
  arc(...args) {
    this.ops.push(["arc", ...args]);
  }
  ellipse(...args) {
    this.ops.push(["ellipse", ...args]);
  }
}

beforeEach(() => {
  vi.stubGlobal("Path2D", MockPath2D);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createMockCtx() {
  const paintedFills = [];
  const paintedStrokes = [];
  return {
    ctx: {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      miterLimit: 10,
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      bezierCurveTo() {},
      arc() {},
      ellipse() {},
      rect() {},
      roundRect() {},
      clip() {},
      fillRect(x, y, w, h) {
        paintedFills.push({ fillStyle: this.fillStyle, x, y, w, h });
      },
      strokeRect(x, y, w, h) {
        paintedStrokes.push({ strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, x, y, w, h });
      },
      fill(path, rule) {
        paintedFills.push({ fillStyle: this.fillStyle, rule });
      },
      stroke() {
        paintedStrokes.push({ strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
      },
      setLineDash() {},
      translate() {},
      scale() {},
      rotate() {},
    },
    paintedFills,
    paintedStrokes,
  };
}

describe("fill='none' rendering and Skia adapter fidelity", () => {
  it("resolves style='none' to transparent in resolvePaintStyle", () => {
    const { ctx } = createMockCtx();
    expect(resolvePaintStyle(ctx, "none", 0, 0, 100, 100)).toBe("transparent");
    expect(resolvePaintStyle(ctx, "transparent", 0, 0, 100, 100)).toBe("transparent");
    expect(resolvePaintStyle(ctx, null, 0, 0, 100, 100)).toBe("transparent");
    expect(resolvePaintStyle(ctx, "#ff0000", 0, 0, 100, 100)).toBe("#ff0000");
  });

  it("returns undefined for fillsOf and strokeOf when value is 'none'", () => {
    expect(fillsOf({ fill: "none" })).toBeUndefined();
    expect(fillsOf({ fill: "transparent" })).toBeUndefined();
    expect(fillsOf({ fill: "#123456" })).toEqual([{ color: "#123456", opacity: 1 }]);

    expect(strokeOf({ stroke: "none", strokeWidth: 2 })).toBeUndefined();
    expect(strokeOf({ stroke: "transparent", strokeWidth: 2 })).toBeUndefined();
    expect(strokeOf({ stroke: "#123456", strokeWidth: 2 })).toMatchObject({ color: "#123456", width: 2 });
  });

  it("omits fills in elementFor when pen node has fill='none'", () => {
    const node = {
      kind: "path",
      pen: true,
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      baseWidth: 24,
      baseHeight: 24,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10, close: true },
      ],
      fill: "none",
      stroke: "#ffffff",
      strokeWidth: 2,
    };
    const el = elementFor(node, 0, 0, 0, () => null, {});
    expect(el.fills).toBeUndefined();
    expect(el.stroke).toBeDefined();
    expect(el.stroke.color).toBe("#ffffff");
  });

  it("does not call ctx.fill in drawPenNode when fill is 'none' (Lucide user-plus)", () => {
    const { ctx, paintedFills, paintedStrokes } = createMockCtx();
    const userPlusD = "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M22 11h-6";
    const anchors = parseSvgPath(userPlusD);
    const node = {
      ...createPenNode(anchors, "#334155", 2),
      icon: "user-plus",
      fill: "none",
    };

    drawPenNode(ctx, node);

    // No fill must be painted into the head or body
    expect(paintedFills).toEqual([]);
    // The stroke must be painted
    expect(paintedStrokes.length).toBeGreaterThanOrEqual(1);
    expect(paintedStrokes[0].strokeStyle).toBe("#334155");
  });

  it("does not call ctx.fill in drawPathNode, drawRectNode, drawEllipseNode, drawBooleanNode when fill is 'none'", () => {
    const { ctx, paintedFills } = createMockCtx();

    drawPathNode(ctx, {
      kind: "path",
      poly: true,
      points: [[0, 0], [10, 0], [10, 10]],
      fill: "none",
      stroke: "#000000",
      strokeWidth: 1,
    });
    expect(paintedFills).toEqual([]);

    drawRectNode(ctx, {
      kind: "rect",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      fill: "none",
      stroke: "#000000",
      strokeWidth: 1,
    });
    expect(paintedFills).toEqual([]);

    drawEllipseNode(ctx, {
      kind: "ellipse",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      fill: "none",
      stroke: "#000000",
      strokeWidth: 1,
    });
    expect(paintedFills).toEqual([]);

    drawBooleanNode(ctx, {
      kind: "boolean",
      op: "union",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      children: [{ kind: "rect", x: 0, y: 0, width: 25, height: 25 }],
      fill: "none",
      stroke: "#000000",
      strokeWidth: 1,
    });
    expect(paintedFills).toEqual([]);
  });
});

describe("SVG import fidelity: radialGradient, clipPath, text and multi-subpath", () => {
  it("preserves off-center cx/cy coordinates in radialGradient for both importers", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <defs>
          <radialGradient id="rg" cx="30%" cy="20%" r="50%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#000000"/>
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#rg)"/>
      </svg>
    `;

    // 1. editor_svg_import
    const { nodes: editorNodes } = parseSvgStringToNodes(svg);
    expect(editorNodes).toHaveLength(1);
    expect(editorNodes[0].fill).toContain("radial-gradient(circle at 30% 20%");

    // 2. svg_to_nodes
    const { nodes: agentNodes } = parseSvgToNodes(svg);
    expect(agentNodes).toHaveLength(1);
    expect(agentNodes[0].fill).toContain("radial-gradient(circle at 30% 20%");
  });

  it("handles compound multi-shape clipPath via union boolean node in editor_svg_import", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <defs>
          <clipPath id="multiClip">
            <rect x="0" y="0" width="100" height="100"/>
            <circle cx="150" cy="150" r="40"/>
          </clipPath>
        </defs>
        <rect width="200" height="200" fill="#3b82f6" clip-path="url(#multiClip)"/>
      </svg>
    `;

    const { nodes } = parseSvgStringToNodes(svg);
    // Should have compound boolean clip base and clipped rect
    const clipBase = nodes.find((n) => n.maskBase);
    expect(clipBase).toBeDefined();
    expect(clipBase.kind).toBe("boolean");
    expect(clipBase.op).toBe("union");
    expect(clipBase.fill).toBe("#ffffff");

    const targetRect = nodes.find((n) => !n.maskBase);
    expect(targetRect.clipTo).toBe(clipBase.id);
  });

  it("handles compound multi-shape clipPath via union boolean node in svg_to_nodes", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <defs>
          <clipPath id="multiClip">
            <rect x="0" y="0" width="100" height="100"/>
            <circle cx="150" cy="150" r="40"/>
          </clipPath>
        </defs>
        <rect width="200" height="200" fill="#3b82f6" clip-path="url(#multiClip)"/>
      </svg>
    `;

    const { nodes } = parseSvgToNodes(svg);
    const clipBase = nodes.find((n) => n.maskBase);
    expect(clipBase).toBeDefined();
    expect(clipBase.kind).toBe("boolean");
    expect(clipBase.op).toBe("union");
    expect(clipBase.fill).toBe("#ffffff");

    const targetRect = nodes.find((n) => !n.maskBase);
    expect(targetRect.clipTo).toBe(clipBase.name);
  });

  it("parses and preserves text styling (fontFamily, fontWeight, fontStyle, text-anchor)", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <text x="100" y="50" font-family="Inter, sans-serif" font-weight="bold" font-style="italic" text-anchor="middle" font-size="18">
          Centered Title
        </text>
        <text x="250" y="120" style="font-family: Roboto; font-weight: 600; text-anchor: end; font-size: 14px;">
          Right Note
        </text>
      </svg>
    `;

    // 1. editor_svg_import
    const { nodes: editorNodes } = parseSvgStringToNodes(svg);
    expect(editorNodes).toHaveLength(2);

    expect(editorNodes[0].text).toBe("Centered Title");
    expect(editorNodes[0].fontFamily).toBe("Inter, sans-serif");
    expect(editorNodes[0].fontWeight).toBe(700);
    expect(editorNodes[0].italic).toBe(true);
    expect(editorNodes[0].align).toBe("center");

    expect(editorNodes[1].text).toBe("Right Note");
    expect(editorNodes[1].fontFamily).toBe("Roboto");
    expect(editorNodes[1].fontWeight).toBe(600);
    expect(editorNodes[1].align).toBe("right");

    // 2. svg_to_nodes
    const { nodes: agentNodes } = parseSvgToNodes(svg);
    expect(agentNodes).toHaveLength(2);

    expect(agentNodes[0].text).toBe("Centered Title");
    expect(agentNodes[0].fontFamily).toBe("Inter, sans-serif");
    expect(agentNodes[0].fontWeight).toBe(700);
    expect(agentNodes[0].italic).toBe(true);
    expect(agentNodes[0].align).toBe("center");

    expect(agentNodes[1].text).toBe("Right Note");
    expect(agentNodes[1].fontFamily).toBe("Roboto");
    expect(agentNodes[1].fontWeight).toBe(600);
    expect(agentNodes[1].align).toBe("right");
  });

  it("preserves moveTo in multi-subpath paths imported via editor_svg_import", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <path d="M 0 0 L 10 10 M 20 20 L 30 30" stroke="#000000" stroke-width="2" fill="none"/>
      </svg>
    `;
    const { nodes } = parseSvgStringToNodes(svg);
    expect(nodes).toHaveLength(1);
    const penNode = nodes[0];
    expect(penNode.kind).toBe("path");
    expect(penNode.pen).toBe(true);

    const moveTos = penNode.points.filter((p) => p.moveTo === true);
    expect(moveTos).toHaveLength(1);
    expect(moveTos[0]).toMatchObject({ moveTo: true });
  });
});
