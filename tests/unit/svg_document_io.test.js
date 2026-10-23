import { describe, it, expect } from "vitest";
import { svgBytesToVooFile, svgSaveLosses, isSvgFileName } from "../../src/canvas/store/svg_document_io.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <rect x="10" y="10" width="80" height="40" fill="#ff0000"/>
  <circle cx="150" cy="60" r="30" fill="#0000ff"/>
</svg>`;

describe("svg document io", () => {
  it("recognises .svg file names case-insensitively", () => {
    expect(isSvgFileName("logo.svg")).toBe(true);
    expect(isSvgFileName("LOGO.SVG")).toBe(true);
    expect(isSvgFileName("logo.voo")).toBe(false);
  });

  it("opens an SVG as one design document sized to its viewBox", () => {
    const vooFile = svgBytesToVooFile(new TextEncoder().encode(SAMPLE));
    expect(vooFile.document.width).toBe(200);
    expect(vooFile.document.height).toBe(120);
    expect(vooFile.document.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it("round-trips the opened shapes back into SVG", () => {
    const vooFile = svgBytesToVooFile(new TextEncoder().encode(SAMPLE));
    const svg = documentToSvg(vooFile.document, {});
    expect(svg).toContain("<svg");
    expect(svg).toContain("#ff0000");
    expect(svg).toContain("#0000ff");
  });

  it("rejects bytes that are not SVG instead of opening an empty canvas", () => {
    expect(() => svgBytesToVooFile(new TextEncoder().encode("not an svg"))).toThrow("invalid-svg-file");
  });

  it("reports no losses for shapes the SVG writer represents", () => {
    const losses = svgSaveLosses({
      pageCount: 1,
      sceneDoc: { nodes: [{ kind: NODE_KIND.RECT, visible: true }] },
    });
    expect(losses).toEqual([]);
  });

  it("reports multiple pages and unsupported visible layers as losses", () => {
    const losses = svgSaveLosses({
      pageCount: 2,
      sceneDoc: {
        nodes: [
          { kind: NODE_KIND.RECT, visible: true },
          { kind: "unknown-kind", visible: true },
          { kind: "unknown-kind", visible: false },
        ],
      },
    });
    expect(losses.map((loss) => loss.key)).toEqual(["save.loss.pages", "svg.save.lossKinds"]);
    expect(losses[1].params.kinds).toBe("unknown-kind");
  });
});

describe('SVG text save/reopen coordinates', () => {
  it('converts a translated SVG baseline to editor top coordinates and keeps it stable', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><g transform="translate(10 20)"><text x="12" y="50" font-size="24" fill="#112233">Hello</text></g></svg>';
    const first = svgBytesToVooFile(new TextEncoder().encode(source)).document;
    const text = first.nodes.find(n => n.kind === 'text');
    expect(text).toMatchObject({x:22,y:46,fontSize:24,text:'Hello'});
    const reopened = svgBytesToVooFile(new TextEncoder().encode(documentToSvg(first))).document;
    expect(reopened.nodes.find(n => n.kind === 'text')).toMatchObject({x:text.x,y:text.y,fontSize:text.fontSize,text:text.text,fill:text.fill});
  });
});
