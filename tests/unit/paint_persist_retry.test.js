import { describe, it, expect, vi, beforeEach } from "vitest";

const putImage = vi.hoisted(() => vi.fn());

vi.mock("../../src/canvas/store/db.js", () => ({ putImage }));
vi.mock("../../src/canvas/editor/bitmap_cache.js", () => ({
  decodeBlob: vi.fn(async () => ({})),
}));
vi.mock("../../src/canvas/editor/scene_model.js", () => ({
  findNode: () => ({ id: "node-1", imageId: null }),
}));
vi.mock("../../src/canvas/editor/doc_ops.js", () => ({
  updateNode: () => ({}),
}));
vi.mock("../../src/canvas/undo-action-contracts.js", () => ({
  commitEditorDocument: vi.fn(),
}));
vi.mock("../../src/canvas/editor/editor_persist_events.js", () => ({
  emitPersistenceAlert: vi.fn(),
  isQuotaExceededError: () => false,
}));

const { createPaintPersistence } = await import(
  "../../src/canvas/editor/editor_paint_persist.js"
);

function makePersistence() {
  const paintCanvases = new Map([
    [
      "node-1",
      {
        canvas: { toBlob: (done) => done(new Blob(["px"], { type: "image/png" })) },
        version: 1,
        persistedVersion: 0,
        imageId: null,
      },
    ],
  ]);
  const persistence = createPaintPersistence({
    getDoc: () => ({}),
    setDoc: vi.fn(),
    cache: { put: vi.fn() },
    isDisposed: () => false,
    invalidateBitmap: vi.fn(),
    paintCanvases,
  });
  return { persistence, paintCanvases };
}

describe("paint persistence retry on save", () => {
  beforeEach(() => {
    putImage.mockReset();
  });

  it("a save retries a persist that failed earlier and clears the dirty state", async () => {
    putImage.mockRejectedValueOnce(new Error("IDB transaction aborted"));
    const { persistence } = makePersistence();

    await persistence.queuePaintPersist("node-1");
    expect(persistence.hasDirtyPaints()).toBe(true);

    putImage.mockResolvedValueOnce(true);
    await persistence.flushPaints();

    expect(putImage).toHaveBeenCalledTimes(2);
    expect(persistence.hasDirtyPaints()).toBe(false);
  });

  it("keeps reporting unsaved pixels when the retry keeps failing", async () => {
    putImage.mockRejectedValue(new Error("QuotaExceededError"));
    const { persistence } = makePersistence();

    await persistence.queuePaintPersist("node-1");
    await persistence.flushPaints();

    expect(putImage).toHaveBeenCalledTimes(2);
    expect(persistence.hasDirtyPaints()).toBe(true);
  });
});
