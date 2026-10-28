import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportEditorImage } from "../../src/canvas/components/editor_hooks/export_editor_image.js";
import { jpegPageToPdf } from "../../src/canvas/components/editor_hooks/export_editor_pdf.js";
import { saveMediaExport } from "../../src/canvas/media_export.js";

vi.mock("../../src/canvas/components/editor_hooks/export_editor_pdf.js", () => ({ jpegPageToPdf: vi.fn() }));
vi.mock("../../src/canvas/media_export.js", () => ({ saveMediaExport: vi.fn() }));

const png = "data:image/png;base64,cGl4ZWxz";
const pdf = "data:application/pdf;base64,JVBERi0xLjQ=";
function makeEngine() {
  return {
    getDocument: () => ({ width: 600, height: 400, nodes: [] }),
    flushMasks: vi.fn(),
    exportImage: vi.fn().mockResolvedValue(png),
    exportSelectionPng: vi.fn().mockResolvedValue({ dataUrl: png, bounds: { width: 80, height: 40 } }),
  };
}
const exportImage = (engine, extra = {}) => exportEditorImage({ engine, format: "pdf", name: "Audit", scale: 1, ...extra });
beforeEach(() => {
  vi.clearAllMocks();
  jpegPageToPdf.mockResolvedValue(pdf);
  saveMediaExport.mockResolvedValue({ name: "Audit.pdf" });
});

describe("deferred editor PDF dispatch", () => {
  it("passes the actual page dimensions and raster to the deferred builder", async () => {
    const engine = makeEngine();
    expect(await exportImage(engine)).toEqual({ name: "Audit.pdf" });
    expect(engine.exportImage).toHaveBeenCalledWith(expect.objectContaining({ type: "image/png", scale: 1 }));
    expect(jpegPageToPdf).toHaveBeenCalledWith({ dataUrl: png, width: 600, height: 400 });
    expect(saveMediaExport).toHaveBeenCalledWith(expect.objectContaining({ dataUrl: pdf, format: "pdf", name: "Audit.pdf" }));
  });

  it("uses selection bounds rather than document dimensions", async () => {
    await exportImage(makeEngine(), { range: "selection", selectedIds: ["rectangle"] });
    expect(jpegPageToPdf).toHaveBeenCalledWith({ dataUrl: png, width: 80, height: 40 });
  });

  it("rejects an empty selection before invoking the builder or saving", async () => {
    const engine = makeEngine(); engine.exportSelectionPng.mockResolvedValue(null);
    await expect(exportImage(engine, { range: "selection", selectedIds: ["missing"] })).rejects.toThrow("EXPORT_SELECTION_EMPTY");
    expect(jpegPageToPdf).not.toHaveBeenCalled(); expect(saveMediaExport).not.toHaveBeenCalled();
  });

  it("preserves builder failures and never saves an invalid receipt", async () => {
    const error = new Error("EXPORT_DATA_INVALID"); jpegPageToPdf.mockRejectedValue(error);
    await expect(exportImage(makeEngine())).rejects.toBe(error);
    expect(saveMediaExport).not.toHaveBeenCalled();
  });

  it("preserves cancellation before rendering or loading a builder", async () => {
    const engine = makeEngine(), controller = new AbortController(); controller.abort();
    await expect(exportImage(engine, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(engine.exportImage).not.toHaveBeenCalled(); expect(jpegPageToPdf).not.toHaveBeenCalled();
  });

  it("leaves ordinary PNG export independent of the PDF builder", async () => {
    await exportImage(makeEngine(), { format: "png" });
    expect(jpegPageToPdf).not.toHaveBeenCalled();
    expect(saveMediaExport).toHaveBeenCalledWith(expect.objectContaining({ dataUrl: png, format: "png" }));
  });
});
