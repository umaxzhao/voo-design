import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignStore as store } from "../../src/store/design_store.js";
import { finishPageRename, movePageToEdge } from "../../src/canvas/components/page_switcher_interactions.js";

describe("page switcher interactions", () => {
  beforeEach(() => store.setState({ nodes: [], editingNodeId: null, editingNodeIds: [], isDirty: false }));
  it.each(["Enter", "blur"])("commits a trimmed rename once on %s", () => {
    const id = store.getState().addEditorPage({ label: "Original" });
    const edit = { current: id };
    finishPageRename(edit, store.getState(), "  Cover  ");
    finishPageRename(edit, store.getState(), "Late blur");
    expect(store.getState().nodes[0].data.label).toBe("Cover");
  });
  it.each([true, false])("reverts an empty name or cancelled edit (%s)", cancel => {
    const renameEditorPage = vi.fn();
    const edit = { current: "a" };
    finishPageRename(edit, { renameEditorPage }, cancel ? "Changed" : "   ", cancel);
    finishPageRename(edit, { renameEditorPage }, "late blur");
    expect(renameEditorPage).not.toHaveBeenCalled();
  });
  it.each([
    ["a", "c", "after", ["b", "c", "a", "d"]],
    ["d", "b", "before", ["a", "d", "b", "c"]],
    ["a", "c", "before", ["b", "a", "c", "d"]],
    ["d", "b", "after", ["a", "b", "d", "c"]],
  ])("moves %s %s %s through the store", (source, target, edge, expected) => {
    const ids = Object.fromEntries(["a", "b", "c", "d"].map(label => [label, store.getState().addEditorPage({ label })]));
    const focus = store.getState().editingNodeId;
    store.setState({ isDirty: false });
    movePageToEdge(store.getState(), store.getState().nodes, ids[source], ids[target], edge);
    expect(store.getState().nodes.map(node => node.data.label)).toEqual(expected);
    expect(store.getState().editingNodeId).toBe(focus);
    expect(store.getState().isDirty).toBe(true);
  });
  it("ignores self, adjacent no-op and stale targets", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const reorderEditorPage = vi.fn();
    for (const [source, target, edge] of [["a", "a", "after"], ["a", "b", "before"], ["missing", "b", "after"]]) {
      movePageToEdge({ reorderEditorPage }, nodes, source, target, edge);
    }
    expect(reorderEditorPage).not.toHaveBeenCalled();
  });
});
