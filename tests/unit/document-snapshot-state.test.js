import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentSnapshotState } from "../../src/canvas/editor/document-snapshot-state.js";
import { serialiseDocument, createDefaultAdjustments } from "../../src/canvas/editor/scene_model.js";
import { createHistoryApi } from "../../src/canvas/editor/editor_history_api.js";

afterEach(() => vi.restoreAllMocks());
const rect = (id, x = 0) => ({ id, kind: "rect", x, y: 0, width: 20, height: 20, fill: "#ff5500" });
const scene = nodes => ({ version: 2, width: 600, height: 400, backgroundColor: "transparent", nodes });
function setup(doc = scene([rect("first"), rect("second", 50)])) {
  const state = { doc };
  const snapshots = createDocumentSnapshotState(() => state.doc);
  snapshots.setApplied(snapshots.serialize());
  return { state, snapshots };
}
const historyApi = snapshots => createHistoryApi({
  history: {}, maskTools: { hasDirtyMasks: () => false }, paintTools: { hasDirtyPaints: () => false },
  snapshotDoc: snapshots.serialize, isDocumentDirty: snapshots.isDirty,
  getAppliedSnapshot: snapshots.getApplied, setAppliedSnapshot: snapshots.setApplied,
  getSelectionTransform: () => null, transformsInFlight: new Set(),
});

describe("document checkpoint equality without full edit serialization", () => {
  it("does not serialize unchanged page records for a one-node history dirty check", () => {
    const { state, snapshots } = setup(scene(Array.from({ length: 1000 }, (_, i) => rect(`node-${i}`, i))));
    const saved = snapshots.getApplied();
    const stringify = vi.spyOn(JSON, "stringify");
    state.doc = { ...state.doc, nodes: state.doc.nodes.map((n, i) => i === 999 ? { ...n, x: 1234 } : n) };
    expect(historyApi(snapshots).isDirty()).toBe(true);
    expect(snapshots.getApplied()).toBe(saved);
    expect(stringify.mock.calls.some(([value]) => value?.nodes?.length === 1000)).toBe(false);
    expect(stringify.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("cleans on undo by reference and on manually restoring the canonical values", () => {
    const { state, snapshots } = setup(); const saved = state.doc;
    state.doc = { ...saved, nodes: [{ ...saved.nodes[0], x: 1 }, saved.nodes[1]] };
    expect(snapshots.isDirty()).toBe(true);
    state.doc = saved;
    expect(snapshots.isDirty()).toBe(false);
    state.doc = { ...saved, nodes: [{ ...saved.nodes[0] }, saved.nodes[1]] };
    expect(snapshots.isDirty()).toBe(false);
    state.doc = { ...state.doc, nodes: [...state.doc.nodes].reverse() };
    expect(snapshots.isDirty()).toBe(true);
    state.doc = { ...saved, nodes: saved.nodes.slice(0, 1) };
    expect(snapshots.isDirty()).toBe(true);
  });

  it("checks persisted page metadata and canonical transient node fields", () => {
    const { state, snapshots } = setup(); const saved = state.doc;
    for (const patch of [{ width: 700 }, { backgroundColor: "#ffffff" },
      { guides: [{ id: "guide", axis: "x", position: 15 }] }, { crop: { x: 1, y: 1, width: 100, height: 100 } }]) {
      state.doc = { ...saved, ...patch };
      expect(snapshots.isDirty()).toBe(JSON.stringify(serialiseDocument(state.doc)) !== snapshots.getApplied());
      expect(snapshots.isDirty()).toBe(true);
    }
    state.doc = { ...saved, nodes: [{ ...saved.nodes[0], src: "blob:transient" }, saved.nodes[1]] };
    expect(snapshots.isDirty()).toBe(false);
    state.doc = { ...saved, nodes: [{ ...saved.nodes[0], adjustments: createDefaultAdjustments() }, saved.nodes[1]] };
    expect(snapshots.isDirty()).toBe(false);
    state.doc = { ...state.doc, nodes: [{ ...state.doc.nodes[0], adjustments: { brightness: { enabled: true, value: 10 } } }, saved.nodes[1]] };
    expect(snapshots.isDirty()).toBe(true);
  });

  it("retains exact explicit serialization and previously persisted baseline behavior", () => {
    const { state, snapshots } = setup(); const saved = snapshots.getApplied();
    state.doc = { ...state.doc, height: 500 };
    expect(snapshots.serialize()).toBe(JSON.stringify(serialiseDocument(state.doc)));
    snapshots.setApplied(saved);
    expect(snapshots.isDirty()).toBe(true);
    state.doc = { ...state.doc, height: 400 };
    expect(snapshots.isDirty()).toBe(false);
    snapshots.setApplied("legacy baseline");
    expect(snapshots.isDirty()).toBe(true);
    snapshots.setApplied(snapshots.serialize());
    expect(snapshots.isDirty()).toBe(false);
    snapshots.setApplied("");
    const stringify = vi.spyOn(JSON, "stringify");
    expect(snapshots.isDirty()).toBe(true);
    expect(stringify).not.toHaveBeenCalled();
    snapshots.setApplied(null);
    expect(snapshots.isDirty()).toBe(false);
  });

  it("keeps pixel buffers and unfinished transforms independently dirty", () => {
    const flags = { mask: false, paint: false, selection: null };
    const transforms = new Set();
    const isDocumentDirty = vi.fn(() => false);
    const api = createHistoryApi({ history: {},
      maskTools: { hasDirtyMasks: () => flags.mask }, paintTools: { hasDirtyPaints: () => flags.paint },
      getSelectionTransform: () => flags.selection, transformsInFlight: transforms,
      isDocumentDirty });
    expect(api.isDirty()).toBe(false);
    for (const field of ["mask", "paint", "selection"]) {
      flags[field] = true;
      expect(api.isDirty()).toBe(true);
      flags[field] = false;
    }
    transforms.add("pending");
    expect(api.isDirty()).toBe(true);
    transforms.clear();
    expect(api.isDirty()).toBe(false);
  });

  it("preserves the generic history client's legacy snapshot fallback", () => {
    let current = "saved", applied = current;
    const api = createHistoryApi({ history: {},
      maskTools: { hasDirtyMasks: () => false }, paintTools: { hasDirtyPaints: () => false },
      getSelectionTransform: () => null, transformsInFlight: new Set(),
      snapshotState: () => current, getAppliedSnapshot: () => applied,
      setAppliedSnapshot: text => { applied = text; } });
    expect(api.isDirty()).toBe(false);
    current = "edited";
    expect(api.isDirty()).toBe(true);
    api.markApplied();
    expect(api.isDirty()).toBe(false);
  });
});
