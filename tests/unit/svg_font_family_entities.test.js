import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureSvgTextWidth } from "../../src/canvas/editor/editor_svg_text.js";
import { decodeXmlEntities, escapeXml } from "../../src/canvas/editor/editor_svg_xml.js";
import { nodesToSvg } from "../../src/canvas/editor/editor_svg.js";
import { parseSvgStringToNodes } from "../../src/canvas/editor/editor_svg_import.js";

// UF27: the exporter escapes apostrophes in font-family as &#39;. The importer must
// decode XML entities before the family reaches the canvas font string. A browser
// canvas silently ignores an invalid `ctx.font` assignment and keeps the previous
// font, so an undecoded family measures text with the default 10px font.

const FAMILY_ATTR = "system-ui,-apple-system,&#39;Segoe UI&#39;,sans-serif";
const SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
    <text x="20" y="80" font-size="32" font-family="${FAMILY_ATTR}">Typography</text>
  </svg>
`;

/** Canvas double that rejects invalid font strings like a browser does and records every assignment. */
function makeMeasureDocument() {
  const fontAssignments = [];
  let font = "10px sans-serif";
  const ctx = {
    save() {},
    restore() {},
    measureText(text) {
      const size = Number.parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "10");
      return { width: text.length * size * 0.5 };
    },
    get font() {
      return font;
    },
    set font(value) {
      fontAssignments.push(value);
      // Browsers ignore a font value that is not a valid CSS font shorthand.
      if (!String(value).includes("&")) font = value;
    },
  };
  return {
    fontAssignments,
    createElement: () => ({ getContext: () => ctx }),
  };
}

describe("UF27 XML entity decoding", () => {
  it("round-trips the exporter's escaping and decodes each reference once", () => {
    expect(decodeXmlEntities(escapeXml("Segoe UI's & <x>"))).toBe("Segoe UI's & <x>");
    expect(decodeXmlEntities("&amp;#39;")).toBe("&#39;");
    expect(decodeXmlEntities("&#x41;&#66;&unknown;")).toBe("AB&unknown;");
  });
});

describe("UF27 SVG font-family XML entities", () => {
  let savedDocument;

  beforeEach(() => {
    savedDocument = globalThis.document;
  });

  afterEach(() => {
    globalThis.document = savedDocument;
  });

  it("imports the font-family with XML entities decoded", () => {
    const { nodes } = parseSvgStringToNodes(SVG);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].fontFamily).not.toContain("&#");
    expect(nodes[0].fontFamily).toBe("system-ui,-apple-system,Segoe UI,sans-serif");
    expect(nodes[0].fontSize).toBe(32);
  });

  it("measures with a valid CSS font string, so the 32px size is not lost", () => {
    const doc = makeMeasureDocument();
    globalThis.document = doc;
    const width = measureSvgTextWidth("Typography", 32, "system-ui,-apple-system,Segoe UI,sans-serif", "normal", 0);
    expect(doc.fontAssignments.every((value) => !value.includes("&"))).toBe(true);
    expect(width).toBeCloseTo("Typography".length * 32 * 0.5, 1);
  });

  it("the imported text width reflects 32px when a canvas is available", async () => {
    // The measurement context is cached per module; reload so this test gets a fresh canvas.
    vi.resetModules();
    globalThis.document = makeMeasureDocument();
    const { parseSvgStringToNodes: parseFresh } = await import("../../src/canvas/editor/editor_svg_import.js");
    const { nodes } = parseFresh(SVG);
    expect(nodes[0].width).toBeGreaterThan(10 * "Typography".length);
  });
});

describe("UF27 export then re-import", () => {
  it("keeps an apostrophe font family and its size through the real SVG writer", () => {
    const node = {
      id: "t1",
      kind: "text",
      x: 20,
      y: 80,
      width: 300,
      height: 40,
      text: "Typography",
      fill: "#000000",
      fontSize: 32,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      visible: true,
    };
    const svg = nodesToSvg([node], { width: 600, height: 200 });
    expect(svg).toContain("&#39;Segoe UI&#39;");
    const { nodes } = parseSvgStringToNodes(svg);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].fontFamily).not.toContain("&#");
    expect(nodes[0].fontFamily).toContain("Segoe UI");
    expect(nodes[0].fontSize).toBe(32);
  });
});
