import { describe, expect, it } from "vitest";
import { textStyleOf, weightOfStyle } from "../../../src/canvas/figma/figma-text.js";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";
import { BUNDLED_FONTS } from "../../../src/canvas/editor/font_loader.js";

const guid = (localID) => ({ sessionID: 0, localID });

function textMessage(props) {
  return {
    nodeChanges: [
      { guid: guid(0), type: "DOCUMENT", name: "Doc" },
      {
        guid: guid(1),
        parentIndex: { guid: guid(0), position: "!" },
        type: "TEXT",
        name: "Label",
        transform: { m02: 0, m12: 0 },
        size: { x: 200, y: 40 },
        textData: { characters: "Hello" },
        fillPaints: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
        ...props,
      },
    ],
  };
}

describe("weightOfStyle", () => {
  it.each([
    ["Regular", "normal"],
    ["Bold", "700"],
    ["Semibold", "600"],
    ["Light", "300"],
    ["Medium", "500"],
    ["Black", "900"],
    ["Bold Italic", "700"],
    ["Unknown Face", "normal"],
  ])("maps %s to %s", (style, weight) => {
    expect(weightOfStyle(style)).toBe(weight);
  });
});

describe("textStyleOf", () => {
  it("keeps a font that is not bundled under its own name, with a fallback stack", () => {
    const style = textStyleOf({ fontName: { family: "Microsoft YaHei", style: "Bold" } }, 16);

    expect(style.fontFamily).toBe("'Microsoft YaHei', sans-serif");
    expect(style.fontWeight).toBe("700");
    expect(style.figmaFont).toEqual({ family: "Microsoft YaHei", style: "Bold" });
  });

  it("uses the bundled font's own stack for a font the editor ships", () => {
    const inter = BUNDLED_FONTS.find((font) => font.family === "Inter");
    const style = textStyleOf({ fontName: { family: "Inter", style: "Regular" } }, 16);

    expect(style.fontFamily).toBe(inter.stack);
  });

  it("converts pixel and percent line height and letter spacing to editor ratios", () => {
    const pixels = textStyleOf(
      { fontName: { family: "Inter", style: "Regular" }, lineHeight: { value: 24, units: "PIXELS" }, letterSpacing: { value: 1, units: "PIXELS" } },
      16,
    );
    const percent = textStyleOf(
      { fontName: { family: "Inter", style: "Regular" }, lineHeight: { value: 150, units: "PERCENT" }, letterSpacing: { value: 10, units: "PERCENT" } },
      20,
    );

    expect(pixels.lineHeight).toBeCloseTo(1.5, 6);
    expect(pixels.letterSpacing).toBe(1);
    expect(percent.lineHeight).toBeCloseTo(1.5, 6);
    expect(percent.letterSpacing).toBe(2);
  });

  it("aligns text as designed and wraps fixed-width text at its frame", () => {
    const fixed = textStyleOf(
      { fontName: { family: "Inter", style: "Regular" }, textAlignHorizontal: "CENTER", textAutoResize: "HEIGHT", size: { x: 180, y: 40 } },
      16,
    );
    const auto = textStyleOf({ fontName: { family: "Inter", style: "Regular" }, textAutoResize: "WIDTH_AND_HEIGHT" }, 16);

    expect(fixed.align).toBe("center");
    expect(fixed.boxWidth).toBe(180);
    expect(auto.boxWidth).toBe(0);
  });
});

describe("text in the mapper", () => {
  it("reports every font the file uses, flagging the ones the editor does not ship", () => {
    const message = textMessage({ fontName: { family: "Microsoft YaHei", style: "Regular" }, fontSize: 16 });
    const result = figmaMessageToPages(message);
    const [node] = result.pages[0].nodes;

    expect(node.fontFamily).toBe("'Microsoft YaHei', sans-serif");
    expect(node.figmaFont).toEqual({ family: "Microsoft YaHei", style: "Regular" });
    expect(result.fonts).toEqual([
      { family: "Microsoft YaHei", styles: ["Regular"], count: 1, available: false },
    ]);
  });
});
