import { describe, expect, it } from "vitest";
import { createExternalImageTracker } from "../../src/canvas/editor/external-image-ingestion.js";

const image = (id, imageId = id) => ({ id, imageId });
const saved = (...nodes) => ({ nodes });

describe("external image activation history", () => {
  it("does not reinsert baseline images deleted or removed by undo", () => {
    const baseline = image("baseline");
    const tracker = createExternalImageTracker([baseline]);
    expect(tracker.collect(saved(baseline), [], new Set(), {})).toEqual([]);
    expect(tracker.collect(saved(baseline, image("new")), [], new Set(), {}))
      .toEqual([{ imageId: "new", src: null }]);
  });

  it("remembers local insertion and replacement identities across deletion", () => {
    const tracker = createExternalImageTracker();
    const local = image("local");
    expect(tracker.collect(saved(local), [local], new Set(), {})).toEqual([]);
    expect(tracker.collect(saved(local), [], new Set(), {})).toEqual([]);
    const replaced = image("local", "painted");
    expect(tracker.collect(saved(local), [replaced], new Set(), {})).toEqual([]);
    expect(tracker.collect(saved(replaced), [], new Set(), {})).toEqual([]);
  });

  it("keeps pending deliveries unique and retries actual failures", () => {
    const tracker = createExternalImageTracker();
    const doc = saved(image("arrival"));
    expect(tracker.collect(doc, [], new Set(["arrival"]), {})).toEqual([]);
    tracker.accept({ added: [], skipped: [{ imageId: "arrival", reason: "assetMissing" }] });
    expect(tracker.collect(doc, [], new Set(), { arrival: "blob:ready" }))
      .toEqual([{ imageId: "arrival", src: "blob:ready" }]);
    tracker.accept({ added: ["arrival"], skipped: [] });
    expect(tracker.collect(doc, [], new Set(), {})).toEqual([]);
  });

  it("accepts concurrent existing deliveries without sharing page lifetimes", () => {
    const first = createExternalImageTracker();
    first.accept({ added: [], skipped: [{ imageId: "result", reason: "alreadyPresent" }] });
    expect(first.collect(saved(image("result")), [], new Set(), {})).toEqual([]);
    const nextPage = createExternalImageTracker();
    expect(nextPage.collect(saved(image("result")), [], new Set(), {}))
      .toEqual([{ imageId: "result", src: null }]);
  });
});
