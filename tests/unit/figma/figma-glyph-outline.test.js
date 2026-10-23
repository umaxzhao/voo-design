import { describe, expect, it } from "vitest";
import { exactGlyphPath, textOutlinePath } from "../../../src/canvas/figma/figma-glyph-outline.js";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";

/** Glyph blob: command bytes followed by little-endian float32 coordinates. */
function glyphBlob(commands) {
  const bytes = [];
  const view = new DataView(new ArrayBuffer(4));
  for (const [command, ...values] of commands) {
    bytes.push(command);
    for (const value of values) {
      view.setFloat32(0, value, true);
      bytes.push(...new Uint8Array(view.buffer));
    }
  }
  return Uint8Array.from(bytes);
}

const triangle = glyphBlob([[1, 0.5, 0], [2, 0.5, 0.5], [2, 0, 0], [0]]);

describe("exactGlyphPath", () => {
  it("applies the mapping to every coordinate pair in command order", () => {
    const text = exactGlyphPath(triangle, (x, y) => [x * 2, y * 2]);

    expect(text).toBe("M1 0 L1 1 L0 0 Z");
  });

  it("keeps full float precision instead of rounding to two decimals", () => {
    const precise = glyphBlob([[1, 0.123456789, 0]]);
    const text = exactGlyphPath(precise, (x, y) => [x, y]);

    expect(Number(text.slice(1).split(" ")[0])).toBeCloseTo(0.123456789, 6);
  });
});

describe("textOutlinePath", () => {
  it("scales each glyph by its font size and flips y to the text box's downward axis", () => {
    const raw = {
      derivedTextData: {
        glyphs: [{ commandsBlob: 0, fontSize: 20, position: { x: 10, y: 100 } }],
      },
    };
    const text = textOutlinePath(raw, [triangle]);

    expect(text).toBe("M20 100 L20 90 L10 100 Z");
  });

  it("returns nothing for a text without glyph layout", () => {
    expect(textOutlinePath({}, [])).toBe("");
  });
});

describe("editable text with glyph data in the mapper", () => {
  it.each([ ["Unavailable Test Face", true], ["Inter", false] ])("keeps %s editable (missing: %s)", (family, missing) => {
    const message = {
      blobs: [triangle],
      nodeChanges: [
        { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Doc" },
        {
          guid: { sessionID: 0, localID: 1 },
          parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "!" },
          type: "TEXT",
          name: "Title",
          transform: { m02: 0, m12: 0 },
          size: { x: 100, y: 40 },
          textData: { characters: "A" },
          fontName: { family, style: "Bold" },
          fontSize: 20,
          fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
          derivedTextData: { glyphs: [{ commandsBlob: 0, fontSize: 20, position: { x: 0, y: 20 } }] },
        },
      ],
    };
    const [node] = figmaMessageToPages(message).pages[0].nodes;

    expect(node.kind).toBe("text");
    expect(node.pen).toBeUndefined();
    expect(node.fontFamily).toContain(family);
    expect(node.figmaFont).toEqual({ family, style: "Bold" });
    expect(node.fontMissing).toBe(missing);
    expect(node.fill).toBe("#ff0000");
    expect(node.text).toBe("A");
  });
});
