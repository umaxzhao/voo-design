import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EditorLayers from "../../src/canvas/components/editor_layers.jsx";

const drag = vi.hoisted(() => ({ overId: null }));
vi.mock("../../src/canvas/components/use_layer_drag.js", () => ({
  default: () => ({ ...drag, dragId: null, slot: null, beginRowDrag: vi.fn() }),
}));

function renderRow({ overId = null, isolated = false, selected = true } = {}) {
  drag.overId = overId;
  const object = { id: "layer", kind: isolated ? "group" : "rect", name: "Layer" };
  const html = renderToStaticMarkup(createElement(EditorLayers, {
    objects: [object],
    selectedIds: selected && !isolated ? [object.id] : [],
    isolationGroupId: isolated ? object.id : null,
    onSelect: vi.fn(),
    onToggleSelect: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
  }));
  // The styled row is the first div inside the accessible layer option.
  return html.match(/id="layer-row-layer"[^>]*><div[^>]*>/)?.[0];
}

describe("layer row selection styling", () => {
  it.each([false, true])("selected row has gray fill and inset shadow (isolated=%s)", (isolated) => {
    const row = renderRow({ isolated });
    expect(row).toContain("bg-neutral-800");
    expect(row).toContain(isolated ? "text-[#eed0ff]" : "text-[#a7ffd4]");
    expect(row).toContain("box-shadow:inset 0 0 0 1px #a7ffd4");
  });

  it("selected drag-over row uses the drag ring without a selection shadow", () => {
    const row = renderRow({ overId: "layer" });
    expect(row).toContain('aria-selected="true"');
    expect(row).toContain("ring-1 ring-inset");
    expect(row).not.toContain("box-shadow:");
  });

  it("unselected row has no selection shadow", () => {
    const row = renderRow({ selected: false });
    expect(row).toContain('aria-selected="false"');
    expect(row).not.toContain("box-shadow:");
  });
});
