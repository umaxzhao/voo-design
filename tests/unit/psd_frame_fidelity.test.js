import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeCanvas } from "ag-psd";
import { buildPsd, encodePsd } from "../../src/canvas/editor/psd_export.js";
import { psdBytesToVooFile } from "../../src/canvas/store/psd_to_voo.js";

function installCanvasStubs() {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  const makeImageData = (width, height) =>
    new ImageData(new Uint8ClampedArray(width * height * 4), width, height);
  initializeCanvas(
    (width, height) => ({
      width,
      height,
      getContext: () => ({
        putImageData() {},
        createImageData: makeImageData,
      }),
    }),
    makeImageData,
  );
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ putImageData() {} }),
      toDataURL: () => "data:image/png;base64,AAAA",
    }),
  };
}

describe("UF26: PSD Frame fill and empty Frame layer fidelity", () => {
  beforeAll(installCanvasStubs);
  afterAll(() => {
    delete globalThis.document;
    delete globalThis.ImageData;
  });

  const sampleDoc = {
    width: 500,
    height: 400,
    backgroundColor: "transparent",
    nodes: [
      {
        id: "frame-white",
        kind: "group",
        isFrame: true,
        frame: true,
        name: "White Frame",
        x: 10,
        y: 10,
        width: 200,
        height: 150,
        fill: "#ffffff",
        fillOpacity: 1,
      },
      {
        id: "child-rect",
        kind: "rect",
        parentId: "frame-white",
        name: "Inner Graphic",
        x: 30,
        y: 30,
        width: 60,
        height: 40,
        fill: "#ff0000",
      },
      {
        id: "frame-empty-black",
        kind: "group",
        isFrame: true,
        frame: true,
        name: "Empty Black Frame",
        x: 230,
        y: 10,
        width: 180,
        height: 150,
        fill: "#000000",
        fillOpacity: 1,
      },
      {
        id: "frame-empty-transparent",
        kind: "group",
        isFrame: true,
        frame: true,
        name: "Empty Clear Frame",
        x: 10,
        y: 200,
        width: 120,
        height: 100,
        fill: "transparent",
      },
    ],
  };

  const renderNodeMock = (node) => {
    const width = Math.max(1, Math.round(node.width || 10));
    const height = Math.max(1, Math.round(node.height || 10));
    const data = new Uint8ClampedArray(width * height * 4);
    if (node.name === "White Frame Background" || node.fill === "#ffffff") {
      data.fill(255);
    } else if (node.name === "Empty Black Frame Background" || node.fill === "#000000") {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    return { imageData: { width, height, data } };
  };

  it("exports Frame fill as a bottom layer within the Frame group", () => {
    const psd = buildPsd({
      doc: sampleDoc,
      renderNode: renderNodeMock,
    });

    const whiteFrame = psd.children.find((c) => c.name === "White Frame");
    expect(whiteFrame).toBeDefined();

    // The Frame group should contain the inner graphic AND the frame fill layer
    expect(whiteFrame.children.length).toBeGreaterThanOrEqual(2);

    const fillLayer = whiteFrame.children.find((c) =>
      c.name.includes("Background") || c.name.includes("Fill") || c.name === "White Frame Background",
    );
    expect(fillLayer).toBeDefined();
    expect(fillLayer.top).toBe(10);
    expect(fillLayer.left).toBe(10);
    expect(fillLayer.bottom).toBe(160);
    expect(fillLayer.right).toBe(210);
    expect(fillLayer.imageData).toBeDefined();
    expect(fillLayer.imageData.width).toBe(200);
    expect(fillLayer.imageData.height).toBe(150);

    // Verify white fill pixels (RGBA = 255, 255, 255, 255)
    expect(fillLayer.imageData.data[0]).toBe(255);
    expect(fillLayer.imageData.data[1]).toBe(255);
    expect(fillLayer.imageData.data[2]).toBe(255);
    expect(fillLayer.imageData.data[3]).toBe(255);
  });

  it("preserves empty Frames (both filled and transparent) in PSD layer tree", () => {
    const psd = buildPsd({
      doc: sampleDoc,
      renderNode: renderNodeMock,
    });

    const emptyBlack = psd.children.find((c) => c.name === "Empty Black Frame");
    expect(emptyBlack).toBeDefined();
    expect(emptyBlack.left).toBe(230);
    expect(emptyBlack.top).toBe(10);

    // Empty black frame has fill, so it should have its fill layer
    const blackFill = emptyBlack.children?.find((c) =>
      c.name.includes("Background") || c.name.includes("Fill"),
    );
    expect(blackFill).toBeDefined();
    expect(blackFill.imageData.data[0]).toBe(0);
    expect(blackFill.imageData.data[1]).toBe(0);
    expect(blackFill.imageData.data[2]).toBe(0);
    expect(blackFill.imageData.data[3]).toBe(255);

    const emptyClear = psd.children.find((c) => c.name === "Empty Clear Frame");
    expect(emptyClear).toBeDefined();
    expect(emptyClear.left).toBe(10);
    expect(emptyClear.top).toBe(200);
  });

  it("preserves Frame hierarchy and fills upon roundtrip re-import", () => {
    const psd = buildPsd({
      doc: sampleDoc,
      renderNode: renderNodeMock,
    });

    const bytes = encodePsd(psd);
    const reimported = psdBytesToVooFile(bytes);

    const nodeNames = reimported.document.nodes.map((n) => n.name);
    expect(nodeNames).toContain("White Frame");
    expect(nodeNames).toContain("Empty Black Frame");
    expect(nodeNames).toContain("Empty Clear Frame");
  });

  it("preserves #RRGGBBAA and rgba() alpha channels without clipping to opaque", () => {
    const docWithTranslucentFrames = {
      width: 400,
      height: 300,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "frame-hex8",
          kind: "group",
          isFrame: true,
          name: "Hex8 Translucent Frame",
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          fill: "#ff000080", // 50% red: alpha = 128
        },
        {
          id: "frame-rgba",
          kind: "group",
          isFrame: true,
          name: "RGBA Translucent Frame",
          x: 120,
          y: 10,
          width: 100,
          height: 80,
          fill: "rgba(0, 255, 0, 0.4)", // 40% green: alpha ~ 102
        },
      ],
    };

    const psd = buildPsd({
      doc: docWithTranslucentFrames,
      renderNode: () => null, // Test pure color parser fallback
    });

    const hex8Group = psd.children.find((c) => c.name === "Hex8 Translucent Frame");
    expect(hex8Group).toBeDefined();
    const hex8Bg = hex8Group.children.find((c) => c.name.includes("Background"));
    expect(hex8Bg).toBeDefined();
    expect(hex8Bg.imageData.data[0]).toBe(255); // R
    expect(hex8Bg.imageData.data[1]).toBe(0);   // G
    expect(hex8Bg.imageData.data[2]).toBe(0);   // B
    expect(hex8Bg.imageData.data[3]).toBe(128); // Alpha preserved!

    const rgbaGroup = psd.children.find((c) => c.name === "RGBA Translucent Frame");
    expect(rgbaGroup).toBeDefined();
    const rgbaBg = rgbaGroup.children.find((c) => c.name.includes("Background"));
    expect(rgbaBg).toBeDefined();
    expect(rgbaBg.imageData.data[0]).toBe(0);   // R
    expect(rgbaBg.imageData.data[1]).toBe(255); // G
    expect(rgbaBg.imageData.data[2]).toBe(0);   // B
    expect(rgbaBg.imageData.data[3]).toBe(102); // Alpha 40% of 255
  });

  it("exports gradient & multi-fill Frame background via drawing contract without silent black fallback", () => {
    const docWithGradientFrame = {
      width: 400,
      height: 300,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "frame-gradient",
          kind: "group",
          isFrame: true,
          name: "Gradient Frame",
          x: 10,
          y: 10,
          width: 150,
          height: 100,
          fill: "linear-gradient(90deg, #3b82f6, #10b981)",
          fills: [
            {
              type: "gradient",
              gradient: {
                type: "linear",
                stops: [
                  { color: "#3b82f6", offset: 0 },
                  { color: "#10b981", offset: 1 },
                ],
              },
            },
          ],
        },
        {
          id: "child-in-gradient",
          kind: "rect",
          parentId: "frame-gradient",
          name: "Floating Badge",
          x: 30,
          y: 30,
          width: 40,
          height: 20,
          fill: "#ffffff",
        },
      ],
    };

    // Simulated renderer implementing real drawing contract:
    // When called with frameBgNode, it renders the gradient pixels (blue-to-green).
    // It should NEVER duplicate child-in-gradient!
    const renderNodeWithContract = (node) => {
      const width = Math.max(1, Math.round(node.width || 10));
      const height = Math.max(1, Math.round(node.height || 10));
      const data = new Uint8ClampedArray(width * height * 4);

      if (node.name === "Gradient Frame Background") {
        // Render a distinct gradient sample: top-left blue (59, 130, 246)
        data[0] = 59;
        data[1] = 130;
        data[2] = 246;
        data[3] = 255;
        // and last pixel green (16, 185, 129)
        const last = (width * height - 1) * 4;
        data[last] = 16;
        data[last + 1] = 185;
        data[last + 2] = 129;
        data[last + 3] = 255;
      }
      return { imageData: { width, height, data } };
    };

    const psd = buildPsd({
      doc: docWithGradientFrame,
      renderNode: renderNodeWithContract,
    });

    const gradGroup = psd.children.find((c) => c.name === "Gradient Frame");
    expect(gradGroup).toBeDefined();

    // Group contains exactly the child node AND the background fill layer (no duplication)
    expect(gradGroup.children.length).toBe(2);
    const bgLayer = gradGroup.children.find((c) => c.name === "Gradient Frame Background");
    expect(bgLayer).toBeDefined();

    // Must have the gradient pixels and must NOT be silent black {0, 0, 0}
    expect(bgLayer.imageData.data[0]).toBe(59);
    expect(bgLayer.imageData.data[1]).toBe(130);
    expect(bgLayer.imageData.data[2]).toBe(246);

    // Furthermore, if renderNode returns null on an unparseable paint string,
    // verify it NEVER falls back to solid black {0, 0, 0}
    const psdNoRenderer = buildPsd({
      doc: docWithGradientFrame,
      renderNode: () => null,
    });
    const gradGroupNoRenderer = psdNoRenderer.children.find((c) => c.name === "Gradient Frame");
    expect(gradGroupNoRenderer).toBeDefined();
    // Unrendered complex gradient should be omitted from solid fallback rather than rendered as pure black
    const blackFallback = gradGroupNoRenderer.children.find((c) => c.name.includes("Background"));
    expect(blackFallback).toBeUndefined();
  });

  it("enforces single-application opacity contract for Frame fill and group opacity across layerstack & composite", () => {
    // Helper to evaluate effective alpha of a layer within a PSD group
    const computeEffectiveLayerAlpha = (group, layerName) => {
      const layer = group.children.find((c) => c.name.includes(layerName));
      expect(layer).toBeDefined();
      const pixelAlpha = layer.imageData.data[3] / 255;
      const layerOpacity = typeof layer.opacity === "number" ? layer.opacity : 1;
      const groupOpacity = typeof group.opacity === "number" ? group.opacity : 1;
      return {
        pixelAlpha: layer.imageData.data[3],
        layerOpacity,
        groupOpacity,
        effectiveAlpha: pixelAlpha * layerOpacity * groupOpacity,
      };
    };

    // Case 1: nodeOpacity = 1, fillOpacity = 0.5
    const docCase1 = {
      width: 200,
      height: 200,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "frame-case1",
          kind: "group",
          isFrame: true,
          name: "Frame Case 1",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: "#ff0000",
          fillOpacity: 0.5,
          opacity: 1,
        },
      ],
    };
    const psd1 = buildPsd({ doc: docCase1, renderNode: () => null });
    const group1 = psd1.children.find((c) => c.name === "Frame Case 1");
    const m1 = computeEffectiveLayerAlpha(group1, "Background");
    expect(m1.pixelAlpha).toBe(128); // 0.5 * 255
    expect(m1.layerOpacity).toBe(1);  // fillOpacity NOT duplicated in layer opacity
    expect(m1.groupOpacity).toBe(1);
    expect(m1.effectiveAlpha).toBeCloseTo(0.50196, 3); // ~0.5, not 0.25

    // Case 2: nodeOpacity = 0.5, fillOpacity = 1
    const docCase2 = {
      width: 200,
      height: 200,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "frame-case2",
          kind: "group",
          isFrame: true,
          name: "Frame Case 2",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: "#ff0000",
          fillOpacity: 1,
          opacity: 0.5,
        },
      ],
    };
    const psd2 = buildPsd({ doc: docCase2, renderNode: () => null });
    const group2 = psd2.children.find((c) => c.name === "Frame Case 2");
    const m2 = computeEffectiveLayerAlpha(group2, "Background");
    expect(m2.pixelAlpha).toBe(255);
    expect(m2.layerOpacity).toBe(1);  // layer opacity is 1 so group opacity applies only once
    expect(m2.groupOpacity).toBe(0.5);
    expect(m2.effectiveAlpha).toBeCloseTo(0.5, 3); // 0.5, NOT 0.25!

    // Case 3: nodeOpacity = 0.5, fillOpacity = 0.5
    const docCase3 = {
      width: 200,
      height: 200,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "frame-case3",
          kind: "group",
          isFrame: true,
          name: "Frame Case 3",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: "#ff0000",
          fillOpacity: 0.5,
          opacity: 0.5,
        },
      ],
    };
    const psd3 = buildPsd({ doc: docCase3, renderNode: () => null });
    const group3 = psd3.children.find((c) => c.name === "Frame Case 3");
    const m3 = computeEffectiveLayerAlpha(group3, "Background");
    expect(m3.pixelAlpha).toBe(128); // 0.5 * 255
    expect(m3.layerOpacity).toBe(1);
    expect(m3.groupOpacity).toBe(0.5);
    expect(m3.effectiveAlpha).toBeCloseTo(0.25098, 3); // 0.5 * 0.5 = 0.25

    // Child-layer overlap case with composite verification:
    // Frame: 100x100, red background (#ff0000), opacity = 0.5, fillOpacity = 1
    // Child: 40x40 at (20, 20), green (#00ff00), opacity = 1
    const docWithOverlap = {
      width: 100,
      height: 100,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "frame-overlap",
          kind: "group",
          isFrame: true,
          name: "Overlap Frame",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: "#ff0000",
          fillOpacity: 1,
          opacity: 0.5,
        },
        {
          id: "child-rect-overlap",
          kind: "rect",
          parentId: "frame-overlap",
          name: "Child Rect",
          x: 20,
          y: 20,
          width: 40,
          height: 40,
          fill: "#00ff00",
          opacity: 1,
        },
      ],
    };

    const renderOverlapNode = (node) => {
      const width = Math.max(1, Math.round(node.width || 10));
      const height = Math.max(1, Math.round(node.height || 10));
      const data = new Uint8ClampedArray(width * height * 4);
      if (node.name === "Overlap Frame Background") {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255; // Red
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      } else if (node.name === "Child Rect") {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 0;
          data[i + 1] = 255; // Green
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      }
      return { imageData: { width, height, data } };
    };

    const psdOverlap = buildPsd({
      doc: docWithOverlap,
      renderNode: renderOverlapNode,
    });

    const overlapGroup = psdOverlap.children.find((c) => c.name === "Overlap Frame");
    expect(overlapGroup).toBeDefined();
    expect(overlapGroup.opacity).toBe(0.5);

    // Group children: Child Rect (top), Frame Background (bottom)
    expect(overlapGroup.children.length).toBe(2);
    const bgChild = overlapGroup.children.find((c) => c.name === "Overlap Frame Background");
    const rectChild = overlapGroup.children.find((c) => c.name === "Child Rect");
    expect(bgChild).toBeDefined();
    expect(rectChild).toBeDefined();
    expect(bgChild.opacity).toBe(1);
    expect(rectChild.opacity).toBe(1);

    // Simulate PSD group compositing over a transparent canvas:
    // Inside group: at overlap (20 <= x < 60 && 20 <= y < 60), Child Rect (opaque green)
    // covers Background (red).
    // Outside overlap (e.g. at (5, 5)), only Background (red) is visible.
    // Then group opacity 0.5 is applied uniformly to the group's composite output.
    const compositePixelAt = (x, y) => {
      const inChild = x >= 20 && x < 60 && y >= 20 && y < 60;
      const inBg = x >= 0 && x < 100 && y >= 0 && y < 100;
      if (inChild) {
        // Green layer covers Red layer: [0, 255, 0] with group alpha = 255 * 0.5 = 128
        return { r: 0, g: 255, b: 0, a: Math.round(255 * 0.5) };
      }
      if (inBg) {
        // Red layer only: [255, 0, 0] with group alpha = 255 * 0.5 = 128
        return { r: 255, g: 0, b: 0, a: Math.round(255 * 0.5) };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    };

    // Non-overlap pixel (5, 5): Red, alpha ~ 128
    const nonOverlapPixel = compositePixelAt(5, 5);
    expect(nonOverlapPixel.r).toBe(255);
    expect(nonOverlapPixel.g).toBe(0);
    expect(nonOverlapPixel.b).toBe(0);
    expect(nonOverlapPixel.a).toBe(128);

    // Overlap pixel (30, 30): Green, alpha ~ 128 (NOT 0.25 alpha or mixed red bleed-through!)
    const overlapPixel = compositePixelAt(30, 30);
    expect(overlapPixel.r).toBe(0);
    expect(overlapPixel.g).toBe(255);
    expect(overlapPixel.b).toBe(0);
    expect(overlapPixel.a).toBe(128);
  });

  it("semi-transparent Frame alpha regression comparing layerstack and composite pixels", () => {
    // Semi-transparent Frame with child rect
    // Frame: 120x100, red (#ff0000), fillOpacity 0.5, node.opacity 0.8
    // Child: 40x40 at (20, 20), blue (#0000ff), opacity 1
    const doc = {
      width: 120,
      height: 100,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "frame-semi",
          kind: "group",
          isFrame: true,
          name: "Semi Frame",
          x: 0,
          y: 0,
          width: 120,
          height: 100,
          fill: "#ff0000",
          fillOpacity: 0.5,
          opacity: 0.8,
        },
        {
          id: "child-blue",
          kind: "rect",
          parentId: "frame-semi",
          name: "Blue Child",
          x: 20,
          y: 20,
          width: 40,
          height: 40,
          fill: "#0000ff",
          opacity: 1,
        },
      ],
    };

    const renderNode = (node) => {
      const width = Math.max(1, Math.round(node.width || 10));
      const height = Math.max(1, Math.round(node.height || 10));
      const data = new Uint8ClampedArray(width * height * 4);
      if (node.name === "Semi Frame Background") {
        const alpha = Math.round(255 * (node.fillOpacity ?? 0.5));
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = alpha;
        }
      } else if (node.name === "Blue Child") {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 255;
          data[i + 3] = 255;
        }
      }
      return { imageData: { width, height, data } };
    };

    // Composite renderer modeling the flattened canvas output
    const renderComposite = () => {
      const width = 120;
      const height = 100;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const isChild = x >= 20 && x < 60 && y >= 20 && y < 60;
          if (isChild) {
            // Blue child opaque inside group, then scaled by group opacity 0.8
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 255;
            data[idx + 3] = Math.round(255 * 0.8);
          } else {
            // Red background with fillOpacity 0.5 inside group, then scaled by group opacity 0.8
            // Effective alpha = 0.5 * 0.8 = 0.4 -> Math.round(255 * 0.4) = 102
            data[idx] = 255;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = Math.round(255 * 0.5 * 0.8);
          }
        }
      }
      return { width, height, data };
    };

    const psd = buildPsd({ doc, renderNode, renderComposite });
    const group = psd.children.find((c) => c.name === "Semi Frame");
    expect(group).toBeDefined();
    expect(group.opacity).toBe(0.8);

    const bgLayer = group.children.find((c) => c.name === "Semi Frame Background");
    const childLayer = group.children.find((c) => c.name === "Blue Child");
    expect(bgLayer).toBeDefined();
    expect(childLayer).toBeDefined();

    // Verify layerstack opacities: both layers have opacity = 1 inside the group
    expect(bgLayer.opacity).toBe(1);
    expect(childLayer.opacity).toBe(1);

    // Verify background layer pixel alpha is baked fillOpacity (0.5 * 255 = 128)
    expect(bgLayer.imageData.data[3]).toBe(128);

    // Compute effective alpha from layerstack:
    // Non-overlap (background): (bgLayer.pixelAlpha / 255) * bgLayer.opacity * group.opacity
    const bgEffectiveAlpha = (bgLayer.imageData.data[3] / 255) * bgLayer.opacity * group.opacity;
    // Overlap (child): (childLayer.pixelAlpha / 255) * childLayer.opacity * group.opacity
    const childEffectiveAlpha = (childLayer.imageData.data[3] / 255) * childLayer.opacity * group.opacity;

    // Compare with composite image pixels at non-overlap (5, 5) and overlap (30, 30)
    const compositeData = psd.imageData.data;
    const nonOverlapIdx = (5 * 120 + 5) * 4;
    const overlapIdx = (30 * 120 + 30) * 4;

    const compositeBgAlpha = compositeData[nonOverlapIdx + 3] / 255;
    const compositeChildAlpha = compositeData[overlapIdx + 3] / 255;

    expect(bgEffectiveAlpha).toBeCloseTo(compositeBgAlpha, 2);
    expect(childEffectiveAlpha).toBeCloseTo(compositeChildAlpha, 2);
  });
});
