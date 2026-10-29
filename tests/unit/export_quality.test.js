import { describe, it, expect, vi, afterEach } from "vitest";
import { selectionBounds, exportPixelSize, exportBackdropDocument } from "../../src/canvas/editor/editor_export_bounds.js";
import { documentToSvg, nodesToSvg } from "../../src/canvas/editor/editor_svg.js";
import { selectedExportNodes, renderSelectionPng } from "../../src/canvas/editor/editor_export_selection.js";
import { createExport } from "../../src/canvas/editor/editor_export_raster.js";
import { draw } from "../../src/canvas/editor/scene_renderer.js";
vi.mock("../../src/canvas/editor/scene_renderer.js", () => ({ draw: vi.fn() }));
const rect = (id, extra = {}) => ({ id, kind: "rect", x: 20.25, y: 30.5, width: 100, height: 40, fill: "#ff0000", ...extra });
const doc = { width: 500, height: 400, backgroundColor: "#123456", crop: { x: 10.5, y: 20.25, width: 200, height: 100 }, nodes: [rect("r")] };
function canvasDom(canvases = []) {
  const contexts = [];
  vi.stubGlobal("document", { createElement: () => {
    const ctx = { fillRect: vi.fn(), drawImage: vi.fn() };
    contexts.push(ctx);
    const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: (type) => `data:${type};base64,sample` };
    canvases.push(canvas);
    return canvas;
  } });
  return contexts;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("export quality", () => {
  it.each([1, 2, 3])("sizes page and selection PNG canvases at %sx", (scale) => {
    const canvases = [];
    canvasDom(canvases);
    const api = createExport({ getDoc: () => doc, cache: { get: () => null } });
    expect(api.exportImage({ type: "image/png", scale })).toMatch(/^data:image\/png;/);
    expect(canvases.at(-1)).toMatchObject({ width: 200 * scale, height: 100 * scale });
    const bounds = { x: 20.25, y: 30.5, width: 100, height: 40 };
    const result = renderSelectionPng(doc, doc.nodes, bounds, { scale }, {});
    expect(result.dataUrl).toMatch(/^data:image\/png;/);
    expect(canvases.at(-1)).toMatchObject({ width: 100 * scale, height: 40 * scale });
  });
  it("preserves linked gradient, alpha mask and editable text SVG elements", () => {
    const svg = documentToSvg({ ...doc, nodes: [
      rect("mask", { maskBase: true, opacity: 0.5 }),
      rect("art", { clipTo: "mask", fill: "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" }),
      { ...rect("text"), kind: "text", text: "Editable", fontSize: 16, fontFamily: "Arial" },
    ] });
    expect(svg).toContain("<linearGradient ");
    expect(svg).toContain("<stop ");
    expect(svg).toContain('fill="url(#');
    const maskId = /<mask id="([^"]+)"[^>]*mask-type="alpha"/.exec(svg)?.[1];
    expect(maskId).toBeTruthy();
    expect(svg).toContain(`mask="url(#${maskId})"`);
    expect(svg).toContain("<text ");
    expect(svg).toContain("Editable");
    expect(svg).not.toContain("<image");
  });
  it("uses transformed bounds and ignores malformed rectangles", () => {
    const bounds = selectionBounds([rect("r", { rotation: 90 }), rect("bad", { width: NaN })]);
    expect(bounds.y).toBeCloseTo(0.5);
    expect(bounds).toMatchObject({ x: 50.25, width: 40, height: 100 });
  });
  it("keeps fractional crop sizes consistent at every scale", () => {
    expect(exportPixelSize({ width: 0.1, height: 3.25 }, 2)).toEqual({ width: 1, height: 7, scale: 2 });
    expect(exportPixelSize(doc, NaN).scale).toBe(1);
  });
  it("overrides only the sheet for explicit transparency", () => {
    expect(exportBackdropDocument(doc, true).backgroundColor).toBe("transparent");
    expect(doc.backgroundColor).toBe("#123456");
    expect(exportBackdropDocument({ ...doc, backgroundColor: "transparent" }, false).backgroundColor).toBe("#ffffff");
  });
  it("renders a cropped transparent PNG at 2x and composites JPEG", () => {
    const contexts = canvasDom();
    const api = createExport({ getDoc: () => doc, cache: { get: () => null } });
    api.exportImage({ type: "image/png", scale: 2, transparent: true });
    const call = draw.mock.calls.at(-1)[1];
    expect(call.doc.backgroundColor).toBe("transparent");
    expect(call.pageBackground).toBe(false);
    expect(call.viewport).toEqual({ zoom: 2, panX: -21, panY: -40.5 });
    api.exportImage({ type: "image/jpeg", transparent: true });
    expect(contexts.at(-1).fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(contexts.at(-1).fillStyle).toBe("#123456");
  });
  it("includes group descendants in paint order and omits hidden descendants", () => {
    const nodes = [{ id: "g", kind: "group" }, rect("child", { parentId: "g" }), rect("hidden", { parentId: "g", visible: false })];
    expect(selectedExportNodes({ nodes }, ["g"]).map(n => n.id)).toEqual(["child"]);
    expect(selectedExportNodes({ nodes: [{ ...nodes[0], visible: false }, ...nodes.slice(1)] }, ["g"])).toEqual([]);
  });
  it("renders selection with scene masks, exact origin and nonzero scaled size", () => {
    canvasDom();
    const bounds = { x: 20.25, y: 30.5, width: 0.1, height: 3.25 };
    const result = renderSelectionPng(doc, doc.nodes, bounds, { scale: 2, transparent: true }, {});
    expect(result).toMatchObject({ width: 1, height: 7, bounds });
    expect(draw.mock.calls.at(-1)[1]).toMatchObject({ fullResolution: true, pageBackground: false, doc: { crop: bounds, backgroundColor: "transparent" }, viewport: { panX: -40.5, panY: -61 } });
  });
  it("keeps SVG shapes and editable multiline text, without a bitmap flatten", () => {
    const svg = documentToSvg({ ...doc, nodes: [rect("r"), { ...rect("t"), kind: "text", text: "Hello\nworld", fontSize: 16, fontFamily: "Arial" }] }, { transparent: true });
    expect(svg).toContain('viewBox="10.5 20.25 200 100"');
    expect(svg).toContain('<rect x="20.25"');
    expect(svg).toContain("<text ");
    expect(svg).toContain("<tspan ");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain('fill="#123456"');
  });
  it("keeps world-coordinate paths intact and sizes rotated SVG selections", () => {
    const svg = nodesToSvg([rect("r", { rotation: 90 })]);
    expect(svg).toContain('viewBox="50.25 0.5 40 100"');
    expect(svg).toContain('<rect x="20.25" y="30.5"');
    const path = nodesToSvg([{ ...rect("p"), kind: "path", points: [{ x: 20.25, y: 30.5 }, { x: 120.25, y: 70.5 }] }]);
    expect(path).toContain('viewBox="20.25 30.5 100 40"');
    expect(path).toContain("20.25");
  });
});
