import { describe, expect, it, vi } from "vitest";
import { createHistory, MAX_HISTORY } from "../../src/canvas/editor/editor_history.js";
import { createEngineHistoryState } from "../../src/canvas/editor/editor_engine_history_state.js";
import { createBitmapCache } from "../../src/canvas/editor/bitmap_cache.js";

function fixture(nodes = []) {
  let doc = { nodes };
  let pinned = new Set();
  const history = createHistory();
  history.reset({ doc });
  const state = createEngineHistoryState({
    getDoc: () => doc,
    history,
    cache: { setPinnedKeys: (ids) => { pinned = new Set(ids); } },
  });
  return {
    history,
    refresh: () => { state.refreshBitmapCachePins(); return pinned; },
    replace(next, commit = true) {
      doc = { nodes: next };
      if (commit) history.push({ doc });
    },
    restore(snapshot) { doc = snapshot.doc; },
  };
}

describe("history asset retention and scan cost", () => {
  it("does not reread unchanged historical nodes on repeated refresh or selection", () => {
    const read = vi.fn(() => "shared-image");
    const nodes = [{ get imageId() { return read(); }, maskId: "shared-mask" }];
    const f = fixture(nodes);
    for (let i = 0; i < MAX_HISTORY; i += 1) f.replace([...nodes, { id: `edit-${i}` }]);
    expect(f.refresh()).toEqual(new Set(["shared-image", "shared-mask"]));
    read.mockClear();
    f.history.updateCurrentSelection(["selected"]);
    for (let i = 0; i < 5; i += 1) f.refresh();
    expect(read).not.toHaveBeenCalled();
    f.replace([{ imageId: "new-image" }]);
    expect(f.refresh()).toEqual(new Set(["shared-image", "shared-mask", "new-image"]));
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps future redo assets, then releases only the discarded branch", () => {
    const f = fixture([{ imageId: "root", maskId: "common" }]);
    f.replace([{ imageId: "middle", maskId: "common" }]);
    f.replace([{ imageId: "future", maskId: "future-mask" }]);
    f.refresh();
    f.restore(f.history.undo());
    expect(f.refresh()).toEqual(new Set(["root", "common", "middle", "future", "future-mask"]));
    f.restore(f.history.redo());
    expect(f.refresh().has("future-mask")).toBe(true);
    f.restore(f.history.undo());
    f.replace([{ imageId: "branch", maskId: "common" }]);
    expect(f.history.canRedo()).toBe(false);
    expect(f.refresh()).toEqual(new Set(["root", "common", "middle", "branch"]));
  });

  it("releases dropped history while preserving assets shared by remaining snapshots", () => {
    const f = fixture([{ imageId: "expired", maskId: "common" }]);
    f.refresh();
    for (let i = 0; i < MAX_HISTORY; i += 1) {
      f.replace([{ imageId: `image-${i}`, maskId: "common" }]);
      f.refresh();
    }
    const ids = f.refresh();
    expect(ids.has("expired")).toBe(false);
    expect(ids.size).toBe(MAX_HISTORY + 1);
    expect(ids.has("common")).toBe(true);
    f.history.reset({ doc: { nodes: [] } });
    expect(f.refresh()).toEqual(new Set([`image-${MAX_HISTORY - 1}`, "common"]));
    f.replace([], false);
    expect(f.refresh()).toEqual(new Set());
  });

  it("retains live uncommitted assets and refreshes immutable image and mask replacements", () => {
    const f = fixture([{ imageId: "original", maskId: "old-mask" }]);
    f.refresh();
    f.replace([{ imageId: "live", maskId: "new-mask" }], false);
    expect(f.refresh()).toEqual(new Set(["original", "old-mask", "live", "new-mask"]));
    f.history.reset({ doc: { nodes: [] } });
    expect(f.refresh()).toEqual(new Set(["live", "new-mask"]));
    f.replace([], false);
    expect(f.refresh()).toEqual(new Set());
  });

  it("shares node-array sets across document wrappers without reference-count drift", () => {
    const nodes = [{ imageId: "shared", maskId: "shared" }];
    const f = fixture(nodes);
    for (let i = 0; i < 4; i += 1) f.replace(nodes);
    expect(f.refresh()).toEqual(new Set(["shared"]));
    f.replace([], false);
    expect(f.refresh()).toEqual(new Set(["shared"]));
    f.history.reset({ doc: { nodes: [] } });
    expect(f.refresh()).toEqual(new Set());
    f.replace(nodes);
    expect(f.refresh()).toEqual(new Set(["shared"]));
  });

  it("reconciles page history sessions after reset and restoration", () => {
    const f = fixture([{ imageId: "first-page" }]);
    f.replace([{ imageId: "first-page-edit", maskId: "first-page-mask" }]);
    const session = f.history.captureSession();
    f.refresh();
    f.replace([{ imageId: "second-page" }], false);
    f.history.reset({ doc: { nodes: [{ imageId: "second-page" }] } });
    expect(f.refresh()).toEqual(new Set(["second-page"]));
    f.history.restoreSession(session);
    f.restore(session.entries[session.currentIndex].snapshot);
    expect(f.refresh()).toEqual(new Set(["first-page", "first-page-edit", "first-page-mask"]));
  });

  it("protects historical image/mask bitmaps under pressure and evicts them after branch removal", () => {
    const f = fixture([{ imageId: "base" }]);
    f.replace([{ imageId: "future", maskId: "future-mask" }]);
    const evicted = [];
    const cache = createBitmapCache({ maxBytes: 4, onEvict: (image) => evicted.push(image) });
    const bitmaps = new Map(["base", "future", "future-mask"].map((id) => [id, { width: 1, height: 1 }]));
    try {
      cache.setPinnedKeys(f.refresh());
      for (const [id, bitmap] of bitmaps) cache.put({ imageId: id }, bitmap);
      f.restore(f.history.undo());
      cache.setPinnedKeys(f.refresh());
      expect(evicted).toEqual([]);
      f.restore(f.history.redo());
      cache.setPinnedKeys(f.refresh());
      expect(cache.get({ imageId: "future" })).toBe(bitmaps.get("future"));
      expect(cache.getMask({ maskId: "future-mask" })).toBe(bitmaps.get("future-mask"));
      f.restore(f.history.undo());
      f.replace([{ imageId: "base" }]);
      cache.setPinnedKeys(f.refresh());
      expect(evicted).toEqual(expect.arrayContaining([bitmaps.get("future"), bitmaps.get("future-mask")]));
      expect(cache.stats()).toMatchObject({ size: 1, pinnedCount: 1, totalBytes: 4 });
      expect(cache.get({ imageId: "base" })).toBe(bitmaps.get("base"));
    } finally { cache.dispose(); }
  });

  it("supports legacy raw/wrapped JSON and ignores invalid entries without repeated parsing", () => {
    const f = fixture();
    f.history.reset(JSON.stringify({ nodes: [{ imageId: "raw" }] }));
    f.history.push(JSON.stringify({ doc: { nodes: [{ maskId: "wrapped" }] } }));
    f.history.push("invalid-json");
    expect(f.refresh()).toEqual(new Set(["raw", "wrapped"]));
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(f.refresh()).toEqual(new Set(["raw", "wrapped"]));
      expect(parse).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
    f.history.updateCurrentSelection(["x"]);
    expect(f.refresh()).toEqual(new Set(["raw", "wrapped"]));
    f.history.reset({ doc: { nodes: [] } });
    expect(f.refresh()).toEqual(new Set());
  });
});
