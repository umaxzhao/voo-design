import { describe, expect, it } from "vitest";
import {
  documentToSvg,
  nodesToSvg,
  parseSvgStringToNodes,
} from "../../src/canvas/editor/editor_svg.js";
import { luminanceToAlpha } from "../../src/canvas/editor/chrome_layers.js";
import {
  deserialiseDocument,
  serialiseDocument,
} from "../../src/canvas/editor/scene_model_serialization.js";

const rect = (id, props = {}) => ({
  id,
  kind: "rect",
  visible: true,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  fill: "#ff0000",
  ...props,
});

const doc = (nodes) => ({ width: 400, height: 300, backgroundColor: "transparent", nodes });

/** The markup after </defs>: what actually paints. */
function bodyOf(svg) {
  const end = svg.indexOf("</defs>");
  return end >= 0 ? svg.slice(end) : svg;
}

function defsOf(svg) {
  const start = svg.indexOf("<defs>");
  const end = svg.indexOf("</defs>");
  return start >= 0 ? svg.slice(start, end) : "";
}

describe("SVG export of clipping masks", () => {
  it("clips a Figma mask chain with a clipPath and leaves the base unpainted", () => {
    const svg = documentToSvg(
      doc([
        rect("mask", { maskBase: true, x: 10, y: 20, width: 200, height: 80, fill: "#000000" }),
        rect("photo", { clipTo: "mask", fill: "#00ff00", width: 400, height: 300 }),
        rect("badge", { clipTo: "mask", fill: "#0000ff", x: 15, y: 25, width: 20, height: 20 }),
      ]),
    );

    expect(defsOf(svg)).toContain('<clipPath id="clip-mask" clipPathUnits="userSpaceOnUse">');
    expect(defsOf(svg)).toMatch(/<clipPath[^>]*><rect x="10" y="20" width="200" height="80"/);
    const body = bodyOf(svg);
    // Both members sit in one clipped group, in paint order.
    expect(body).toMatch(
      /<g clip-path="url\(#clip-mask\)"><rect [^>]*fill="#00ff00"[^>]*\/><rect [^>]*fill="#0000ff"[^>]*\/><\/g>/,
    );
    expect(body).not.toContain('fill="#000000"');
    expect(() => parseSvgStringToNodes(svg)).not.toThrow();
  });

  it("paints a Photoshop-style clipping base and also clips to it", () => {
    const svg = documentToSvg(
      doc([rect("base", { fill: "#123456" }), rect("art", { clipTo: "base", fill: "#abcdef" })]),
    );
    const body = bodyOf(svg);
    expect(body).toContain('fill="#123456"');
    expect(body).toMatch(/<g clip-path="url\(#clip-base\)"><rect [^>]*fill="#abcdef"/);
  });

  it("uses an alpha mask when the base's alpha is not just its outline", () => {
    const cases = [
      rect("m", { maskBase: true, opacity: 0.5 }),
      rect("m", { maskBase: true, fill: "rgba(0, 0, 0, 0.4)" }),
      rect("m", { maskBase: true, stroke: "#000000", strokeWidth: 6 }),
      rect("m", { maskBase: true, effects: { shadow: { enabled: true, blur: 4 } } }),
      { id: "m", kind: "ellipse", visible: true, x: 0, y: 0, width: 50, height: 50, fill: "none", maskBase: true },
    ];
    for (const base of cases) {
      const svg = documentToSvg(doc([base, rect("art", { clipTo: "m" })]));
      expect(defsOf(svg)).not.toContain("<clipPath");
      expect(defsOf(svg)).toContain('<mask id="clip-m"');
      expect(defsOf(svg)).toContain('mask-type="alpha"');
      expect(bodyOf(svg)).toContain('<g mask="url(#clip-m)">');
    }
  });

  it("exports a luminance mask as a luminance SVG mask", () => {
    const svg = documentToSvg(
      doc([
        rect("lum", { maskBase: true, maskType: "luminance", fill: "#ffffff" }),
        rect("art", { clipTo: "lum" }),
      ]),
    );
    expect(defsOf(svg)).toContain('mask-type="luminance" style="mask-type:luminance"');
    expect(bodyOf(svg)).toContain('<g mask="url(#clip-lum)">');
  });

  it("carries an even-odd fill rule over to the clip rule", () => {
    const base = {
      id: "ring",
      kind: "path",
      visible: true,
      maskBase: true,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: "#000000",
      fillRule: "evenodd",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100, close: true },
      ],
    };
    const svg = documentToSvg(doc([base, rect("art", { clipTo: "ring" })]));
    expect(defsOf(svg)).toMatch(/<clipPath[^>]*><path [^>]*fill-rule="evenodd" clip-rule="evenodd"/);
  });

  it("drops the chain when its base is hidden, as the stage does", () => {
    const svg = documentToSvg(
      doc([rect("mask", { visible: false }), rect("art", { clipTo: "mask", fill: "#abcdef" })]),
    );
    expect(svg).not.toContain("#abcdef");
  });

  it("keeps separate chains on separate bases apart", () => {
    const svg = documentToSvg(
      doc([
        rect("a", { maskBase: true }),
        rect("a1", { clipTo: "a", fill: "#111111" }),
        rect("b", { maskBase: true, x: 200 }),
        rect("b1", { clipTo: "b", fill: "#222222" }),
        rect("free", { fill: "#333333" }),
      ]),
    );
    const body = bodyOf(svg);
    expect(body).toMatch(/<g clip-path="url\(#clip-a\)"><rect [^>]*#111111[^>]*\/><\/g>/);
    expect(body).toMatch(/<g clip-path="url\(#clip-b\)"><rect [^>]*#222222[^>]*\/><\/g>/);
    expect(body).toMatch(/<\/g>\n<rect [^>]*#333333/);
  });
});

describe("nodesToSvg with a mask base", () => {
  it("keeps the base for clipping but sizes the export from painted nodes", () => {
    const svg = nodesToSvg([
      rect("mask", { maskBase: true, x: -500, y: -500, width: 2000, height: 2000 }),
      rect("art", { clipTo: "mask", x: 10, y: 10, width: 40, height: 30 }),
    ]);
    expect(svg).toContain('width="40" height="30"');
    expect(svg).toContain('clip-path="url(#clip-mask)"');
  });

  it("exports nothing when only mask bases are selected", () => {
    expect(nodesToSvg([rect("mask", { maskBase: true })])).toBe("");
  });
});

describe("luminanceToAlpha", () => {
  it("maps white to opaque, black and transparent to hidden, scaled by alpha", () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 255, 255, 0,
      255, 255, 255, 128,
      0, 255, 0, 255,
    ]);
    luminanceToAlpha(data);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(0);
    expect(data[11]).toBe(0);
    expect(data[15]).toBe(128);
    expect(data[19]).toBe(Math.round(0.7154 * 255));
    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0]);
  });
});

describe("maskType persistence", () => {
  it("survives a save and load", () => {
    const saved = serialiseDocument(
      doc([
        rect("lum", { maskBase: true, maskType: "luminance" }),
        rect("art", { clipTo: "lum" }),
      ]),
    );
    const loaded = deserialiseDocument(JSON.parse(JSON.stringify(saved)));
    const base = loaded.nodes.find((node) => node.id === "lum");
    expect(base.maskBase).toBe(true);
    expect(base.maskType).toBe("luminance");
    expect(loaded.nodes.find((node) => node.id === "art").clipTo).toBe("lum");
  });
});
