import { describe, expect, it, vi } from "vitest";
import { downloadSelectionPng } from "../../src/canvas/components/editor_properties/type_specific_sections.jsx";

describe("TypeSpecificSections PNG export", () => {
  it("downloads the dataUrl returned by exportSelectionPng", () => {
    const anchor = { click: vi.fn(), download: "", href: "" };
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
    const engine = {
      exportSelectionPng: vi.fn(() => ({ dataUrl: "data:image/png;base64,abc", width: 1, height: 1, bounds: {} })),
    };

    downloadSelectionPng(engine, { id: "node-1", name: "Artwork", kind: "rect" });

    expect(engine.exportSelectionPng).toHaveBeenCalledWith(["node-1"]);
    expect(anchor.href).toBe("data:image/png;base64,abc");
    expect(anchor.download).toBe("Artwork.png");
    expect(anchor.click).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("returns without creating a download when dataUrl is missing", () => {
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });

    downloadSelectionPng({ exportSelectionPng: () => ({ width: 1 }) }, { id: "node-1", kind: "rect" });

    expect(createElement).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
