import { describe, it, expect } from "vitest";
import {
  formatSaveLosses,
  replaceDocumentExtension,
  saveFormatOf,
} from "../../src/canvas/store/save_formats.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";

describe("save formats", () => {
  it("picks the save format from the document file name", () => {
    expect(saveFormatOf("logo.svg")).toBe("svg");
    expect(saveFormatOf("poster.PSD")).toBe("psd");
    expect(saveFormatOf("Untitled.voo")).toBe("voo");
    expect(saveFormatOf("design.fig")).toBe("fig");
    expect(saveFormatOf(undefined)).toBe("voo");
  });

  it("replaces only the document extension", () => {
    expect(replaceDocumentExtension("poster.psd", ".psd")).toBe("poster.psd");
    expect(replaceDocumentExtension("poster.svg", ".psd")).toBe("poster.psd");
    expect(replaceDocumentExtension("Untitled", ".voo")).toBe("Untitled.voo");
    expect(replaceDocumentExtension("a.json", ".voo")).toBe("a.json.voo");
  });

  it("never reports losses for the native format", () => {
    const losses = formatSaveLosses("voo", {
      pageCount: 3,
      sceneDoc: { nodes: [{ kind: NODE_KIND.TEXT, visible: true }] },
    });
    expect(losses).toEqual([]);
  });

  it("counts visible text and shape layers that PSD saves as pixels", () => {
    const losses = formatSaveLosses("psd", {
      pageCount: 1,
      sceneDoc: {
        nodes: [
          { kind: NODE_KIND.TEXT, visible: true },
          { kind: NODE_KIND.RECT, visible: true },
          { kind: NODE_KIND.TEXT, visible: false },
        ],
      },
    });
    expect(losses).toEqual([{ key: "psd.save.lossRasterized", params: { count: 2 } }]);
  });

  it("reports multi-page documents for PSD as well", () => {
    const losses = formatSaveLosses("psd", {
      pageCount: 2,
      sceneDoc: { nodes: [] },
    });
    expect(losses.map((loss) => loss.key)).toEqual(["save.loss.pages"]);
  });
});
