import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
    const opacityField = html.match(/<div class="[^"]*layers-opacity-control[^"]*">([\s\S]*?)<\/div>/)?.[1];

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
