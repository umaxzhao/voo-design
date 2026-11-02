import { describe, expect, it, vi } from "vitest";
import { createHistory, MAX_HISTORY } from "../../src/canvas/editor/editor_history.js";
import { createEngineHistoryState } from "../../src/canvas/editor/editor_engine_history_state.js";

function makeDoc(nodes, overrides = {}) {
  return {
    version: 1,
    width: 800,
    height: 600,
    backgroundColor: "#111111",
    nodes,
    ...overrides,
  };
}

function makeImageNode(id, imageId, maskId = null) {
  return {
    id,
    kind: "image",
    imageId,
    ...(maskId ? { maskId } : {}),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
}

describe("structural sharing undo history", () => {
  it("stores object snapshots and skips duplicate pushes that share the same doc", () => {
    const history = createHistory();
    const doc = makeDoc([makeImageNode("n1", "img-a")]);
    const snap = {
      doc,
      pixelSelection: null,
      selectedIds: ["n1"],
    };
    history.reset(snap);
    history.push({ ...snap, selectedIds: ["n1"] });
    expect(history.getSnapshots()).toHaveLength(1);

    const nextDoc = makeDoc([
      makeImageNode("n1", "img-a"),
      makeImageNode("n2", "img-b"),
    ]);
    history.push({
      doc: nextDoc,
      pixelSelection: null,
      selectedIds: ["n1", "n2"],
    });
    expect(history.getSnapshots()).toHaveLength(2);
    expect(history.getSnapshots()[0].doc).toBe(doc);
    expect(history.getSnapshots()[1].doc).toBe(nextDoc);
  });

  it("updateCurrentSelection mutates object snapshots in place", () => {
    const history = createHistory();
    const doc = makeDoc([makeImageNode("n1", "img-a")]);
    history.reset({
      doc,
      pixelSelection: null,
      selectedIds: [],
    });
    history.updateCurrentSelection(["n1"]);
    expect(history.getSnapshots()[0].selectedIds).toEqual(["n1"]);
    expect(history.getSnapshots()[0].doc).toBe(doc);
  });

  it("still supports legacy JSON string snapshots", () => {
    const history = createHistory();
    history.reset(JSON.stringify({ v: 0 }));
    for (let i = 1; i <= 60; i += 1) {
      history.push(JSON.stringify({ v: i }), `a_${i}`);
    }
    expect(history.getSnapshots()).toHaveLength(MAX_HISTORY);
    history.updateCurrentSelection(["x"]);
    const raw = JSON.parse(history.getSnapshots().at(-1));
    expect(raw.selectedIds).toEqual(["x"]);
  });
});

describe("history bitmap pin refresh", () => {
  it("pins assets from the live doc and every object history snapshot without JSON.parse", () => {
    const pinned = [];
    const cache = {
      setPinnedKeys: (keys) => {
        pinned.splice(0, pinned.length, ...keys);
      },
      preload: vi.fn(async () => {}),
    };

    const nodeA = makeImageNode("n1", "img-a", "mask-a");
    const nodeB = makeImageNode("n2", "img-b");
    let doc = makeDoc([nodeA]);
    const history = createHistory();

    const selection = {
      getIds: () => ["n1"],
      selectNodes: vi.fn(),
    };

    const state = createEngineHistoryState({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      getPixelSelection: () => null,
      setPixelSelectionInternal: vi.fn(),
      selection,
      history,
      cache,
      syncAnts: vi.fn(),
    });

    const snap1 = state.snapshotState();
    expect(snap1.doc).toBe(doc);
    expect(typeof snap1).toBe("object");
    history.reset(snap1);

    const sharedNode = nodeA;
    doc = makeDoc([sharedNode, nodeB]);
    const snap2 = state.snapshotState();
    history.push(snap2);

    // Unchanged node object is structurally shared across snapshots.
    expect(snap1.doc.nodes[0]).toBe(sharedNode);
    expect(snap2.doc.nodes[0]).toBe(sharedNode);

    state.refreshBitmapCachePins();
    expect(new Set(pinned)).toEqual(
      new Set(["img-a", "mask-a", "img-b"]),
    );
  });

  it("restore accepts object snapshots and reuses the live document reference", () => {
    const node = makeImageNode("n1", "img-a");
    const original = makeDoc([node]);
    let doc = original;
    const history = createHistory();
    const cache = {
      setPinnedKeys: vi.fn(),
      preload: vi.fn(async () => {}),
    };
    const selection = {
      getIds: () => [],
      selectNodes: vi.fn(),
    };

    const state = createEngineHistoryState({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      getPixelSelection: () => null,
      setPixelSelectionInternal: vi.fn(),
      selection,
      history,
      cache,
    });

    history.reset(state.snapshotState());
    doc = makeDoc([node, makeImageNode("n2", "img-b")]);
    history.push(state.snapshotState());

    const undone = history.undo();
    state.restore(undone, { fromHistory: true });
    expect(doc).toBe(original);
    expect(cache.preload).toHaveBeenCalled();
  });
});
