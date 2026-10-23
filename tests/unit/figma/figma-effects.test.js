import { describe, expect, it } from "vitest";
import { blendModeOf, effectsOf, paintBlendOf } from "../../../src/canvas/figma/figma-effects.js";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";

const guid = (localID) => ({ sessionID: 0, localID });

function rectMessage(props) {
  return {
    nodeChanges: [
      { guid: guid(0), type: "DOCUMENT", name: "Doc" },
      {
        guid: guid(1),
        parentIndex: { guid: guid(0), position: "!" },
        type: "RECTANGLE",
        name: "Card",
        transform: { m02: 0, m12: 0 },
        size: { x: 100, y: 60 },
        fillPaints: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
        ...props,
      },
    ],
  };
}

describe("blendModeOf", () => {
  it.each([
    ["NORMAL", "source-over"],
    ["SOFT_LIGHT", "soft-light"],
    ["LINEAR_DODGE", "linear-dodge"],
    ["DIFFERENCE", "difference"],
    ["LUMINOSITY", "luminosity"],
  ])("maps Figma %s to %s", (figma, editor) => {
    expect(blendModeOf({ blendMode: figma })).toBe(editor);
  });

  it("falls back to normal for a missing or unknown mode", () => {
    expect(blendModeOf({})).toBe("source-over");
    expect(blendModeOf({ blendMode: "NOT_A_MODE" })).toBe("source-over");
  });
});

describe("effectsOf", () => {
  it("maps a drop shadow, with its colour alpha as opacity", () => {
    const { effects } = effectsOf({
      effects: [{ type: "DROP_SHADOW", visible: true, radius: 10, offset: { x: 4, y: 6 }, color: { r: 0, g: 0, b: 0, a: 0.5 } }],
    });

    expect(effects.shadow).toMatchObject({ enabled: true, blur: 10, offsetX: 4, offsetY: 6, opacity: 50, color: "#000000" });
  });

  it("maps an inner shadow separately from the drop shadow", () => {
    const { effects } = effectsOf({
      effects: [{ type: "INNER_SHADOW", visible: true, radius: 3, offset: { x: 0, y: 1 }, color: { r: 1, g: 0, b: 0, a: 1 } }],
    });

    expect(effects.innerShadow).toMatchObject({ blur: 3, offsetY: 1, opacity: 100, color: "#ff0000" });
    expect(effects.shadow).toBeUndefined();
  });

  it("maps layer blur, background blur and noise onto the node", () => {
    const result = effectsOf({
      effects: [
        { type: "FOREGROUND_BLUR", visible: true, radius: 8 },
        { type: "BACKGROUND_BLUR", visible: true, radius: 12 },
        { type: "NOISE", visible: true, opacity: 0.3, noiseSize: 2, density: 0.6, seed: 7, color: { r: 0, g: 0, b: 0, a: 1 } },
      ],
    });

    expect(result.layerBlur).toBe(8);
    expect(result.backgroundBlur).toBe(12);
    expect(result.noise).toMatchObject({ opacity: 0.3, size: 2, density: 0.6, seed: 7, color: "#000000" });
  });

  it("skips hidden effects", () => {
    const result = effectsOf({
      effects: [{ type: "DROP_SHADOW", visible: false, radius: 5, offset: { x: 0, y: 0 }, color: { r: 0, g: 0, b: 0, a: 1 } }],
    });

    expect(result.effects).toBeNull();
    expect(result.layerBlur).toBeUndefined();
  });
});

describe("spread, multitone grain and paint blend", () => {
  it("keeps a drop shadow's spread", () => {
    const { effects } = effectsOf({
      effects: [{ type: "DROP_SHADOW", visible: true, radius: 4, spread: 3, offset: { x: 0, y: 0 }, color: { r: 0, g: 0, b: 0, a: 1 } }],
    });

    expect(effects.shadow.spread).toBe(3);
  });

  it("keeps the second tone of a multitone grain", () => {
    const { noise } = effectsOf({
      effects: [
        { type: "NOISE", visible: true, noiseType: "MULTITONE", opacity: 1, color: { r: 1, g: 0, b: 0, a: 1 }, secondaryColor: { r: 0, g: 0, b: 1, a: 1 } },
      ],
    });

    expect(noise.color).toBe("#ff0000");
    expect(noise.secondaryColor).toBe("#0000ff");
  });

  it("takes the blend of a fill paint when the layer has none", () => {
    expect(paintBlendOf({ fillPaints: [{ type: "SOLID", blendMode: "MULTIPLY", visible: true }] })).toBe("multiply");
    expect(paintBlendOf({ fillPaints: [{ type: "SOLID", blendMode: "NORMAL", visible: true }] })).toBeNull();
  });

  it("keeps each solid paint on its owner with its blend mode", () => {
    const message = rectMessage({
      fillPaints: [
        { type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true, blendMode: "NORMAL", opacity: 1 },
        { type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 }, visible: true, blendMode: "MULTIPLY", opacity: 0.5 },
      ],
    });
    const nodes = figmaMessageToPages(message).pages[0].nodes;

    expect(nodes).toHaveLength(1);
    expect(nodes[0].fill).toBe("#ff0000");
    expect(nodes[0].fills[1]).toMatchObject({ fill: "#0000ff", blendMode: "multiply", opacity: 0.5 });
  });
});

describe("blend and effects in the mapper", () => {
  it("applies the blend mode and shadow to the imported layer", () => {
    const message = rectMessage({
      blendMode: "MULTIPLY",
      effects: [{ type: "DROP_SHADOW", visible: true, radius: 6, offset: { x: 0, y: 2 }, color: { r: 0, g: 0, b: 0, a: 0.25 } }],
    });
    const [node] = figmaMessageToPages(message).pages[0].nodes;

    expect(node.blendMode).toBe("multiply");
    expect(node.effects.shadow).toMatchObject({ blur: 6, offsetY: 2, opacity: 25 });
  });

  it("puts a layer blur and grain onto the imported layer", () => {
    const message = rectMessage({
      effects: [
        { type: "FOREGROUND_BLUR", visible: true, radius: 4 },
        { type: "NOISE", visible: true, opacity: 0.5, noiseSize: 1, density: 0.5, seed: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
      ],
    });
    const [node] = figmaMessageToPages(message).pages[0].nodes;

    expect(node.layerBlur).toBe(4);
    expect(node.noise).toMatchObject({ opacity: 0.5, color: "#ffffff" });
  });
});
