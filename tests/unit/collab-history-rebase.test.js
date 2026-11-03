import { expect, it } from "vitest";
import { createHistory } from "../../src/canvas/editor/editor_history.js";
import { mergeEditorDocuments } from "../../src/canvas/store/merge.js";

it("rebases remote additions across undo and redo without adding an entry", () => {
  const history = createHistory();
  const original = { nodes: [] }, local = { nodes: [{ id: "local" }] };
  const merged = { nodes: [{ id: "local" }, { id: "remote" }] };
  history.reset({ doc: original, selectedIds: [] });
  history.push({ doc: local, selectedIds: ["local"] });
  history.rebaseDocuments(snapshot => mergeEditorDocuments(local, snapshot, merged));
  expect(history.getCurrentIndex()).toBe(1);
  expect(history.undo().doc.nodes.map(node => node.id)).toEqual(["remote"]);
  expect(history.redo().doc.nodes.map(node => node.id)).toEqual(["local", "remote"]);
  expect(original.nodes).toEqual([]);
  expect(local.nodes.map(node => node.id)).toEqual(["local"]);
});

it("rebases legacy string snapshots while preserving selection metadata", () => {
  const history = createHistory();
  const initial = { nodes: [] }, remote = { nodes: [{ id: "remote" }] };
  history.reset(JSON.stringify({ doc: initial, selectedIds: ["old"] }));
  history.push(JSON.stringify({ doc: { nodes: [{ id: "local" }] }, selectedIds: ["local"] }));
  history.rebaseDocuments(snapshot => mergeEditorDocuments(initial, snapshot, remote));
  const current = JSON.parse(history.redo() ?? history.getSnapshots()[1]);
  expect(current.selectedIds).toEqual(["local"]);
  expect(current.doc.nodes.map(node => node.id)).toEqual(["local", "remote"]);
  expect(JSON.parse(history.undo()).doc.nodes.map(node => node.id)).toEqual(["remote"]);
});
