import { describe, it, expect } from "vitest";
import { applyInstanceOverrides, setNodeOverride } from "../../src/canvas/editor/instance-overrides.js";
import { detachInstance } from "../../src/canvas/editor/component_extract.js";
import { updateNode } from "../../src/canvas/editor/doc_ops_nodes.js";
import { buildFigContainer } from "../../src/canvas/figma/voo-to-fig.js";
import { exportSvgNodes } from "../../src/canvas/editor/editor-svg-resources.js";

const TEMPLATE = {
  version: 106,
  schema: { definitions: [] },
  message: {
    type: "NODE_CHANGES",
    sessionID: 1,
    ackID: 1,
    originFileKey: "test",
    nodeChangeOrder: [],
    nodeChanges: [],
    blobs: [],
  },
};

describe("UF23: Dual fill synchronization, component detach, and FIG/SVG export consistency", () => {
  it("executes real component blue override -> detach -> FIG/SVG export pipeline without fallback to master fill", () => {
    const masterRect = {
      id: "rect_master",
      kind: "rect",
      name: "Master Rectangle",
      x: 10,
      y: 10,
      width: 100,
      height: 80,
      fill: "#ff6600",
      fills: [{ fill: "#ff6600", opacity: 1, visible: true }],
    };

    const componentDoc = {
      canvasId: "comp_1",
      id: "comp_1",
      width: 200,
      height: 200,
      nodes: [masterRect],
    };

    let instance = { overrides: {} };
    instance = setNodeOverride(instance, "rect_master", { fill: "#0066ff" });

    // 1. Model check: applyInstanceOverrides synchronizes both fill and fills[0]
    const overriddenDoc = applyInstanceOverrides(componentDoc, instance);
    const overriddenRect = overriddenDoc.nodes.find((n) => n.id === "rect_master");
    expect(overriddenRect.fill).toBe("#0066ff");
    expect(overriddenRect.fills).toBeDefined();
    expect(overriddenRect.fills[0].fill).toBe("#0066ff");

    // 2. Detach pipeline: detachInstance on real host doc containing the instance
    const hostDoc = {
      id: "host_doc",
      width: 600,
      height: 600,
      nodes: [
        {
          id: "inst_1",
          kind: "canvasInstance",
          sourceCanvasId: "comp_1",
          x: 40,
          y: 40,
          width: 100,
          height: 80,
          instance,
        },
      ],
    };

    const detached = detachInstance(hostDoc, "inst_1", componentDoc);
    const detachedRect = detached.doc.nodes.find((n) => n.name === "Master Rectangle");
    expect(detachedRect).toBeDefined();
    expect(detachedRect.fill).toBe("#0066ff");
    expect(detachedRect.fills).toBeDefined();
    expect(detachedRect.fills[0].fill).toBe("#0066ff");

    // 3. FIG export of the real detached document
    const fig = buildFigContainer(detached.doc, TEMPLATE);
    const figNode = fig.message.nodeChanges.find((n) => n.name === "Master Rectangle");
    expect(figNode).toBeDefined();
    expect(figNode.fillPaints).toBeDefined();
    expect(figNode.fillPaints.length).toBeGreaterThan(0);
    const paintColor = figNode.fillPaints[0].color;
    expect(paintColor.b).toBeGreaterThan(0.9);
    expect(paintColor.r).toBeLessThan(0.1);

    // 4. SVG export of the real detached document nodes
    const svg = exportSvgNodes(detached.doc.nodes);
    expect(svg).toContain('fill="#0066ff"');
    expect(svg).not.toContain('fill="#ff6600"');
  });

  it("synchronizes real gradient fill with endpoint metadata and compares parsed direction/endpoints in FIG and SVG", () => {
    // Initial 135deg diagonal gradient
    const initialDiagonal = "linear-gradient(135deg, #ff0000 0%, #0000ff 100%) /* voo-gradient-line: 14.6% 14.6% 85.4% 85.4% */";
    const doc = {
      width: 400,
      height: 400,
      nodes: [
        {
          id: "ellipse_1",
          kind: "ellipse",
          name: "Gradient Dot",
          x: 20,
          y: 20,
          width: 80,
          height: 80,
          fill: initialDiagonal,
          fills: [{ fill: initialDiagonal, opacity: 1, visible: true }],
        },
      ],
    };

    // User drags handle near-horizontal: (0, 0) -> (100, 1.43%)
    const nearHorizontalGradient = "linear-gradient(90deg, #ff0000 0%, #0000ff 100%) /* voo-gradient-line: 0% 0% 100% 1.43% */";
    const updatedDoc = updateNode(doc, "ellipse_1", { fill: nearHorizontalGradient });
    const updatedEllipse = updatedDoc.nodes.find((n) => n.id === "ellipse_1");

    // 1. Model level dual-field synchronization
    expect(updatedEllipse.fill).toBe(nearHorizontalGradient);
    expect(updatedEllipse.fills).toBeDefined();
    expect(updatedEllipse.fills[0].fill).toBe(nearHorizontalGradient);

    // 2. FIG export: parse affine transform matrix (m00=dx, m10=dy)
    const fig = buildFigContainer(updatedDoc, TEMPLATE);
    const figNode = fig.message.nodeChanges.find((n) => n.name === "Gradient Dot");
    expect(figNode).toBeDefined();
    expect(figNode.fillPaints[0].type).toBe("GRADIENT_LINEAR");
    const transform = figNode.fillPaints[0].transform;
    expect(transform.m00).toBeCloseTo(1.0, 2);
    expect(transform.m10).toBeCloseTo(0.0143, 2);
    // Verifies it is near horizontal and NOT diagonal 135deg (which would have m10 ≈ 0.707)
    expect(transform.m10).toBeLessThan(0.1);

    // 3. SVG export: parse <linearGradient> endpoints (x1, y1, x2, y2)
    const svg = exportSvgNodes(updatedDoc.nodes);
    const match = svg.match(/<linearGradient[^>]*x1="([^"]+)"[^>]*y1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y2="([^"]+)"/);
    expect(match).not.toBeNull();
    const [, x1, y1, x2, y2] = match;
    expect(Number(x1)).toBeCloseTo(0, 2);
    expect(Number(y1)).toBeCloseTo(0, 2);
    expect(Number(x2)).toBeCloseTo(1.0, 2);
    expect(Number(y2)).toBeCloseTo(0.014, 2);
    // Verifies it is near horizontal and NOT diagonal 135deg (which would have y2 ≈ 0.854)
    expect(Number(y2)).toBeLessThan(0.1);
  });

  it("preserves valid multi-fills and opacities when updating single fill or opacity", () => {
    const multiFillNode = {
      id: "multi_rect",
      kind: "rect",
      name: "Stacked Card",
      x: 0,
      y: 0,
      width: 120,
      height: 90,
      fill: "#ff0000",
      fillOpacity: 0.8,
      fills: [
        { fill: "#ff0000", opacity: 0.8, visible: true },
        { fill: "#00ff00", opacity: 0.5, visible: true, blendMode: "multiply" },
      ],
    };

    const doc = { width: 500, height: 500, nodes: [multiFillNode] };

    // 1. Updating single fill updates fills[0] but preserves secondary fills
    const updatedFillDoc = updateNode(doc, "multi_rect", { fill: "#0000ff" });
    const rectAfterFill = updatedFillDoc.nodes.find((n) => n.id === "multi_rect");
    expect(rectAfterFill.fill).toBe("#0000ff");
    expect(rectAfterFill.fills.length).toBe(2);
    expect(rectAfterFill.fills[0].fill).toBe("#0000ff");
    expect(rectAfterFill.fills[0].opacity).toBe(0.8);
    expect(rectAfterFill.fills[1].fill).toBe("#00ff00");
    expect(rectAfterFill.fills[1].opacity).toBe(0.5);
    expect(rectAfterFill.fills[1].blendMode).toBe("multiply");

    // 2. Updating fillOpacity updates fills[0].opacity without wiping secondary fills
    const updatedOpacityDoc = updateNode(updatedFillDoc, "multi_rect", { fillOpacity: 0.95 });
    const rectAfterOpacity = updatedOpacityDoc.nodes.find((n) => n.id === "multi_rect");
    expect(rectAfterOpacity.fillOpacity).toBe(0.95);
    expect(rectAfterOpacity.fills[0].opacity).toBe(0.95);
    expect(rectAfterOpacity.fills[1].opacity).toBe(0.5);

    // 3. FIG export contains both paint layers
    const fig = buildFigContainer(updatedOpacityDoc, TEMPLATE);
    const figNode = fig.message.nodeChanges.find((n) => n.name === "Stacked Card");
    expect(figNode.fillPaints.length).toBe(2);
    expect(figNode.fillPaints[0].color.b).toBeGreaterThan(0.9);
    expect(figNode.fillPaints[0].opacity).toBe(0.95);
    expect(figNode.fillPaints[1].color.g).toBeGreaterThan(0.9);
    expect(figNode.fillPaints[1].opacity).toBe(0.5);
    expect(figNode.fillPaints[1].blendMode).toBe("MULTIPLY");

    // 4. SVG export renders both layers
    const svg = exportSvgNodes(updatedOpacityDoc.nodes);
    expect(svg).toContain('fill="#0000ff"');
    expect(svg).toContain('fill="#00ff00"');
  });

  it("synchronizes fills array updates back to scalar fill properties in doc_ops_nodes", () => {
    const node = {
      id: "sync_node",
      kind: "rect",
      name: "Sync Shape",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: "#111111",
      fillOpacity: 1,
      fills: [{ fill: "#111111", opacity: 1, visible: true }],
    };

    const doc = { width: 300, height: 300, nodes: [node] };
    const updated = updateNode(doc, "sync_node", {
      fills: [{ fill: "#44bb55", opacity: 0.65, visible: true, blendMode: "screen" }],
    });
    const updatedNode = updated.nodes.find((n) => n.id === "sync_node");

    expect(updatedNode.fill).toBe("#44bb55");
    expect(updatedNode.fillOpacity).toBe(0.65);
    expect(updatedNode.fillBlendMode).toBe("screen");
    expect(updatedNode.fills[0].fill).toBe("#44bb55");
  });

  it("supports gradient overrides on component instances through detach and export", () => {
    const master = {
      id: "card_bg",
      kind: "rect",
      name: "Card Background",
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      fill: "#222222",
      fills: [{ fill: "#222222", opacity: 1, visible: true }],
    };

    const compDoc = { canvasId: "c_grad", id: "c_grad", width: 200, height: 150, nodes: [master] };
    const gradient = "linear-gradient(90deg, #112233 0%, #445566 100%) /* voo-gradient-line: 0% 0% 100% 0% */";

    let inst = { overrides: {} };
    inst = setNodeOverride(inst, "card_bg", { fill: gradient });

    const hostDoc = {
      id: "h_doc",
      width: 800,
      height: 600,
      nodes: [
        { id: "inst_grad", kind: "canvasInstance", sourceCanvasId: "c_grad", x: 50, y: 50, width: 200, height: 150, instance: inst },
      ],
    };

    const detached = detachInstance(hostDoc, "inst_grad", compDoc);
    const detachedBg = detached.doc.nodes.find((n) => n.name === "Card Background");
    expect(detachedBg.fill).toBe(gradient);
    expect(detachedBg.fills[0].fill).toBe(gradient);

    // Export to FIG
    const fig = buildFigContainer(detached.doc, TEMPLATE);
    const figNode = fig.message.nodeChanges.find((n) => n.name === "Card Background");
    expect(figNode.fillPaints[0].type).toBe("GRADIENT_LINEAR");
    expect(figNode.fillPaints[0].transform.m00).toBeCloseTo(1.0, 2);
    expect(figNode.fillPaints[0].transform.m10).toBeCloseTo(0, 2);

    // Export to SVG
    const svg = exportSvgNodes(detached.doc.nodes);
    const match = svg.match(/<linearGradient[^>]*x1="([^"]+)"[^>]*y1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y2="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeCloseTo(0, 2);
    expect(Number(match[3])).toBeCloseTo(1, 2);
  });
});
