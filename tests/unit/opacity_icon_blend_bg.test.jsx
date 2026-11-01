import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StrokeSection } from "../../src/canvas/components/editor_properties/colour_stroke_section.jsx";
import { SwatchGrid } from "../../src/canvas/color_picker/SwatchGrid.jsx";
import { DocumentColourRow } from "../../src/canvas/color_picker/DocumentColourRow.jsx";
import { DocumentColoursContext } from "../../src/canvas/color_picker/document_colours_context.js";
import EditorLayers from "../../src/canvas/components/editor_layers.jsx";

vi.mock("../../src/canvas/components/use_layer_drag.js", () => ({
  default: () => ({ overId: null, dragId: null, slot: null, beginRowDrag: vi.fn() }),
}));

function renderLayers() {
  return renderToStaticMarkup(createElement(EditorLayers, {
    objects: [{ id: "layer", kind: "rect", name: "Layer", opacity: 1 }],
    selectedIds: ["layer"],
    onSelect: vi.fn(),
    onToggleSelect: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onEdit: vi.fn(),
    onEditAndCommit: vi.fn(),
  }));
}

describe("opacity icon and blend mode surface", () => {
  it("renders the layers opacity value without an icon", () => {
    const html = renderLayers();
    const opacityField = html.match(/<div[^>]*class="[^"]*layers-opacity-control[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];

    expect(opacityField).toContain("100");
    expect(opacityField).toContain("%");
    expect(opacityField).not.toContain("<svg");
  });

  it("gives the blend select a translucent background class", () => {
    const html = renderLayers();
    const blendSelect = html.match(/<button[^>]*aria-label="[^"]*blend[^"]*"[^>]*class="([^"]*)"/i)?.[1];

    expect(blendSelect).toMatch(/(?:^|\s)!?bg-[^\s]*\/[^\s]*/);
  });
});


describe("stroke paint row", () => {
  it.each(["#FFFFFF", "linear-gradient(90deg, #FFFFFF 0%, #000000 100%)"])(
    "uses the swatch as the only paint editor for %s",
    (stroke) => {
      const html = renderToStaticMarkup(createElement(StrokeSection, {
        object: { kind: "rect", stroke, strokeWidth: 2 },
        edit: vi.fn(),
        editAndCommit: vi.fn(),
      }));
      expect(html).not.toContain('aria-haspopup="menu"');
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).toContain(stroke);
    },
  );
});


describe("picker color chips", () => {
  it("uses circles for both presets and user document colors", () => {
    const presets = renderToStaticMarkup(createElement(SwatchGrid, { onSelectColor: vi.fn() }));
    const documentColors = renderToStaticMarkup(createElement(DocumentColoursContext.Provider, {
      value: [{ id: "brand", name: "Brand", value: "#3366FF" }],
    }, createElement(DocumentColourRow, { onSelectColor: vi.fn() })));
    for (const html of [presets, documentColors]) {
      const buttons = [...html.matchAll(/<button[^>]*class="([^"]+)"/g)];
      expect(buttons.length).toBeGreaterThan(0);
      for (const [, classes] of buttons) expect(classes.split(" ")).toContain("rounded-full");
    }
    expect(documentColors).toContain("#3366FF");
  });
});
