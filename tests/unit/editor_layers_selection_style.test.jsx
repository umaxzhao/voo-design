import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EditorLayers from "../../src/canvas/components/editor_layers.jsx";
import { isRowSelected } from "../../src/canvas/editor/layer_selection.js";

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
  it("highlights a Frame row when the canvas selects the Frame boundary", () => {
    const frame = { id: "frame", kind: "group", isFrame: true };
    const child = { id: "child", kind: "rect", parentId: "frame" };

    expect(isRowSelected([frame, child], frame, { selectedIds: ["frame"] })).toBe(true);
    expect(isRowSelected([frame, child], child, { selectedIds: ["frame"] })).toBe(false);
  });

  it("keeps a selected rectangle visible in Layers instead of promoting it to its Frame", () => {
    const outerFrame = { id: "outer", kind: "group", isFrame: true };
    const innerFrame = { id: "inner", kind: "group", isFrame: true, parentId: "outer" };
    const child = { id: "child", kind: "rect", parentId: "inner" };
    const objects = [outerFrame, innerFrame, child];

    expect(isRowSelected(objects, outerFrame, { selectedIds: ["child"] })).toBe(false);
    expect(isRowSelected(objects, innerFrame, { selectedIds: ["child"] })).toBe(false);
    expect(isRowSelected(objects, child, { selectedIds: ["child"] })).toBe(true);
  });

  it("keeps ordinary folder selection based on its complete set of children", () => {
    const folder = { id: "folder", kind: "group" };
    const first = { id: "first", kind: "rect", parentId: "folder" };
    const second = { id: "second", kind: "rect", parentId: "folder" };
    const objects = [folder, first, second];

    expect(isRowSelected(objects, folder, { selectedIds: ["first"] })).toBe(false);
    expect(isRowSelected(objects, first, { selectedIds: ["first"] })).toBe(true);
    expect(isRowSelected(objects, folder, { selectedIds: ["first", "second"] })).toBe(true);
    expect(isRowSelected(objects, first, { selectedIds: ["first", "second"] })).toBe(false);
  });

  it("highlights only the outermost selected folder in a nested hierarchy", () => {
    const outer = { id: "outer", kind: "group" };
    const inner = { id: "inner", kind: "group", parentId: "outer" };
    const first = { id: "first", kind: "rect", parentId: "inner" };
    const second = { id: "second", kind: "rect", parentId: "outer" };
    const objects = [outer, inner, first, second];
    const selectedIds = ["first", "second"];

    expect(isRowSelected(objects, outer, { selectedIds })).toBe(true);
    expect(isRowSelected(objects, inner, { selectedIds })).toBe(false);
    expect(isRowSelected(objects, first, { selectedIds })).toBe(false);
  });

  it("still highlights a single selected child inside a nested folder", () => {
    const outer = { id: "outer", kind: "group" };
    const inner = { id: "inner", kind: "group", parentId: "outer" };
    const first = { id: "first", kind: "rect", parentId: "inner" };
    const second = { id: "second", kind: "rect", parentId: "inner" };
    const third = { id: "third", kind: "rect", parentId: "outer" };
    const objects = [outer, inner, first, second, third];

    expect(isRowSelected(objects, outer, { selectedIds: ["first"] })).toBe(false);
    expect(isRowSelected(objects, inner, { selectedIds: ["first"] })).toBe(false);
    expect(isRowSelected(objects, first, { selectedIds: ["first"] })).toBe(true);
  });

  it("shows a selected group as one row instead of selecting all nested rows", () => {
    const outer = { id: "outer", kind: "group" };
    const inner = { id: "inner", kind: "group", parentId: "outer" };
    const first = { id: "first", kind: "rect", parentId: "inner" };
    const second = { id: "second", kind: "rect", parentId: "inner" };
    const objects = [outer, inner, first, second];
    const options = {
      selectedIds: ["first", "second"],
      selectedGroupId: "outer",
    };

    expect(isRowSelected(objects, outer, options)).toBe(true);
    expect(isRowSelected(objects, inner, options)).toBe(false);
    expect(isRowSelected(objects, first, options)).toBe(false);
    expect(isRowSelected(objects, second, options)).toBe(false);
  });

  it.each([false, true])("selected row has gray fill and inset shadow (isolated=%s)", (isolated) => {
    const row = renderRow({ isolated });
    expect(row).toContain("bg-neutral-800");
    expect(row).toContain("text-neutral-100");
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
