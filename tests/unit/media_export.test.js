import { afterEach, describe, expect, it, vi } from "vitest";
import { saveMediaExport } from "../../src/canvas/media_export.js";
import { mediaExportFilename } from "../../src/shared/media-export.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubSaveDocument() {
  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  const append = vi.fn();
  vi.stubGlobal("document", {
    createElement: vi.fn(() => anchor),
    body: { append },
  });
  vi.stubGlobal("CustomEvent", class {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  });
  return { anchor, append };
}

describe("media export filename", () => {
  it("never treats a data URL as a filename", () => {
    expect(mediaExportFilename("data:image/png;base64,AAAA", "png")).toBe("export.png");
    expect(mediaExportFilename("Design 1.voo", "png")).toBe("Design 1.png");
  });
});

describe("media export save dialog", () => {
  it("uses a Blob URL and the chosen name so the dialog title cannot show base64", async () => {
    vi.useFakeTimers();
    const { anchor, append } = stubSaveDocument();
    const objectUrl = "blob:voo-export";
    const createObjectURL = vi.fn(() => objectUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    const receipt = await saveMediaExport({
      dataUrl: "data:image/png;base64,AAAA",
      name: "data:image/png;base64,AAAA",
      format: "png",
      title: "Export",
    });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0].type).toBe("image/png");
    expect(anchor.href).toBe(objectUrl);
    expect(anchor.download).toBe("export.png");
    expect(append).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(receipt).toEqual({ path: null, name: "export.png" });
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "voo:export-complete" }));

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("passes the sanitized name to the native save bridge", async () => {
    stubSaveDocument();
    const chooseExportPath = vi.fn(async () => "/exports/export.png");
    const writeImageFile = vi.fn(async () => {});
    vi.stubGlobal("window", {
      vooElectron: { chooseExportPath, writeImageFile },
      dispatchEvent: vi.fn(),
    });

    await saveMediaExport({
      dataUrl: "data:image/png;base64,AAAA",
      name: "data:image/png;base64,AAAA",
      format: "png",
      title: "Export",
    });

    expect(chooseExportPath).toHaveBeenCalledWith({
      name: "export.png",
      format: "png",
      title: "Export",
    });
    expect(writeImageFile).toHaveBeenCalledWith("/exports/export.png", "data:image/png;base64,AAAA");
  });

  it("falls back to electronAPI bridge when vooElectron is absent", async () => {
    stubSaveDocument();
    const chooseExportPath = vi.fn(async () => "/tmp/fallback.png");
    const writeImageFile = vi.fn(async () => {});
    vi.stubGlobal("window", {
      electronAPI: { chooseExportPath, writeImageFile },
      dispatchEvent: vi.fn(),
    });

    const receipt = await saveMediaExport({
      dataUrl: "data:image/png;base64,AAAA",
      name: "Design 1",
      format: "png",
      title: "Export",
    });

    expect(chooseExportPath).toHaveBeenCalledWith({
      name: "Design 1.png",
      format: "png",
      title: "Export",
    });
    expect(writeImageFile).toHaveBeenCalledWith("/tmp/fallback.png", "data:image/png;base64,AAAA");
    expect(receipt).toEqual({ path: "/tmp/fallback.png", name: "fallback.png" });
  });
});
