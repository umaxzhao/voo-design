import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EditorLayerThumb from "../../src/canvas/components/editor_layer_thumb.jsx";
import { DEFAULT_MARK_COLOR } from "../../src/canvas/editor/editor_constants.js";
import { EDITOR_MEDIA_ACCEPT, isEditorImageFile, importPickedEditorFile } from "../../src/canvas/components/editor_import_files.js";

describe("QA visual defaults and imports", () => {
  it("gives new marks strong contrast on the dark artboard", () => {
    const linear = hex => {
      const c = parseInt(hex.slice(1, 3), 16) / 255;
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    };
    expect((linear(DEFAULT_MARK_COLOR) + .05) / (linear("#1e1e1e") + .05)).toBeGreaterThan(7);
  });
  it.each(["rect", "ellipse"])("outlines intentional black %s thumbs without changing their fill", kind => {
    const html = renderToStaticMarkup(<EditorLayerThumb object={{ id: "black", kind, fill: "#000000" }} />);
    expect(html).toContain("background-color:#000000");
    expect(html).toContain("box-shadow:inset 0 0 0 1px");
  });
  it.each(["png", "jpg", "jpeg", "webp", "svg", "gif", "bmp", "avif", "ico"])("shares extension-only %s support with drop and picker", ext => {
    expect(isEditorImageFile({ name: `IMAGE.${ext.toUpperCase()}`, type: "" })).toBe(true);
    expect(EDITOR_MEDIA_ACCEPT.split(",")).toContain(`.${ext}`);
  });
  it("routes raster, SVG, PSD and existing media to their supported importers", async () => {
    const engine = { insertImage: vi.fn(), insertSvg: vi.fn() };
    const options = { point: { x: 12, y: 34 }, openDocument: vi.fn(), importMedia: vi.fn() };
    const png = { name: "test.png" };
    await importPickedEditorFile(engine, png, options);
    expect(engine.insertImage).toHaveBeenCalledWith(png, options.point);
    await importPickedEditorFile(engine, { name: "test.svg", text: async () => "<svg/>" }, options);
    expect(engine.insertSvg).toHaveBeenCalledWith("<svg/>", options.point);
    const psd = { name: "test.psd" };
    await importPickedEditorFile(engine, psd, options);
    expect(options.openDocument).toHaveBeenCalledWith(psd);
    for (const name of ["test.mp3", "test.mp4", "test.glb", "test.obj"]) {
      const file = { name };
      await importPickedEditorFile(engine, file, options);
      expect(options.importMedia).toHaveBeenLastCalledWith(file);
    }
  });
});
