import assert from "node:assert/strict";
import { test } from "vitest";
import { mergeEditorDocuments } from "../../src/canvas/store/merge.js";

test("three-way editor merge preserves independent layer edits", () => {
  const base = { nodes: [{ id: "layer-a", x: 0, opacity: 1 }], pages: [], settings: {} };
  const local = { ...base, nodes: [{ id: "layer-a", x: 10, opacity: 1 }] };
  const remote = { ...base, nodes: [{ id: "layer-a", x: 0, opacity: 0.5 }] };
  assert.deepEqual(mergeEditorDocuments(base, local, remote).nodes[0], { id: "layer-a", x: 10, opacity: 0.5 });
});

test("a same-field conflict keeps the local editor value", () => {
  const base = { nodes: [{ id: "layer-a", x: 0 }], pages: [], settings: {} };
  const local = { ...base, nodes: [{ id: "layer-a", x: 10 }] };
  const remote = { ...base, nodes: [{ id: "layer-a", x: 20 }] };
  assert.equal(mergeEditorDocuments(base, local, remote).nodes[0].x, 10);
});

test.skip("workflow undo ownership scenarios need a free-canvas undo adapter", () => {
  // The source tests call createWorkflowHistoryActions and workflow gesture
  // contracts. These are store-specific APIs absent from the editor engine;
  // the editor engine history controller is not exposed as a test adapter.
});
