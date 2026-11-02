import { expect, it } from "vitest";
import { selectedExportBounds, selectedExportNodes } from "../../src/canvas/editor/editor_export_selection.js";

const frame = { id: "frame", kind: "group", isFrame: true, x: -160, y: 30, width: 160, height: 140 };
const rect = { id: "rect", kind: "rect", parentId: "frame", x: -140, y: 50, width: 80, height: 80 };
const tone = { id: "tone", kind: "adjustment", parentId: "frame", x: 0, y: 0, width: 600, height: 400,
  adjustments: { brightness: { enabled: true, value: 60 } } };

it("retains a selected Frame's adjustment pass without treating its metadata as painted bounds", () => {
  const doc = { nodes: [frame, rect, tone] };
  const nodes = selectedExportNodes(doc, [frame.id]);
  expect(nodes.map(node => node.id)).toEqual(["frame", "rect", "tone"]);
  expect(selectedExportBounds(nodes)).toEqual({ x: -160, y: 30, width: 160, height: 140 });
});

it("does not import unrelated global adjustments into the selected Frame", () => {
  const global = { ...tone, id: "outside", parentId: null };
  expect(selectedExportNodes({ nodes: [frame, rect, global] }, [frame.id]).map(node => node.id))
    .toEqual(["frame", "rect"]);
});

it("does not produce a standalone painted export for an adjustment-only selection", () => {
  const nodes = selectedExportNodes({ nodes: [tone] }, [tone.id]);
  expect(nodes).toEqual([tone]);
  expect(selectedExportBounds(nodes)).toBeNull();
});

it("keeps hidden adjustment passes out of the selected subtree export", () => {
  const hidden = { ...tone, visible: false };
  expect(selectedExportNodes({ nodes: [frame, rect, hidden] }, [frame.id]).map(node => node.id))
    .toEqual(["frame", "rect"]);
});
