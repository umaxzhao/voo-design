import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn(), build: vi.fn(), raster: vi.fn() }));
vi.mock("../../src/canvas/store/project_io.js", () => ({ buildVooFile: mocks.build }));
vi.mock("../../src/canvas/store/draft-entry.js", () => ({ findDraftEntry: name => ({ id: name, name }) }));
vi.mock("../../src/canvas/store/draft_store.js", () => ({ saveDraftBytes: mocks.save }));
vi.mock("../../src/canvas/store/voo-background-client.js", () => ({
  createVooBackgroundClient: () => ({ run: mocks.run }),
}));
vi.mock("../../src/canvas/previews/project_cover.js", () => ({ rasterizeProjectCover: mocks.raster }));
import { createDraftAutosaver, writeDraftSnapshot } from "../../src/canvas/store/draft_autosave.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.run.mockReset().mockImplementation(async (operation, file) => operation === "cover" ? null : new Uint8Array([file.document.nodes[0].x]));
  mocks.build.mockReset().mockImplementation(async ({ document }) => ({ document, assets: {}, version: 2 }));
  mocks.save.mockReset().mockResolvedValue(true);
  mocks.raster.mockReset().mockResolvedValue("data:image/png;base64,AA==");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function input() {
  let doc = { nodes: [{ id: "rect", kind: "rect", x: 1 }] };
  const engine = { serialise: vi.fn(() => doc) };
  return { store: { fileName: "Draft.voo", editingNodeId: "page", nodes: [{ id: "page" }] },
    enginesRef: { current: new Map([["page", { ready: true, engine }]]) }, engine,
    change: x => { doc = { ...doc, nodes: [{ ...doc.nodes[0], x }] }; } };
}

describe("background draft publication", () => {
  it("captures each requested revision before awaiting and commits older then newer bytes", async () => {
    const f = input(), cover = deferred();
    mocks.run.mockImplementationOnce(() => cover.promise);
    const first = writeDraftSnapshot(f);
    await tick();
    f.change(2);
    const second = writeDraftSnapshot(f);
    expect(f.engine.serialise).toHaveBeenCalledTimes(2);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    cover.resolve(null);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(mocks.save.mock.calls.map(call => [...call[1]])).toEqual([[1], [2]]);
    expect(mocks.run.mock.calls.map(call => call[0])).toEqual(["cover", "encode", "cover", "encode"]);
  });

  it("drops a cancelled queued snapshot before collecting assets or publishing", async () => {
    const f = input(), cover = deferred(), controller = new AbortController();
    mocks.run.mockImplementationOnce(() => cover.promise);
    const first = writeDraftSnapshot(f);
    await tick();
    f.change(2);
    const second = writeDraftSnapshot({ ...f, signal: controller.signal });
    controller.abort(); cover.resolve(null);
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("preserves the document if optional cover generation fails and recovers after encode failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = input();
    mocks.run.mockRejectedValueOnce(new Error("cover unavailable"));
    expect(await writeDraftSnapshot(f)).toBe(true);
    mocks.run.mockImplementationOnce(async () => null).mockRejectedValueOnce(new Error("worker crashed"));
    expect(await writeDraftSnapshot(f)).toBe(false);
    f.change(3);
    expect(await writeDraftSnapshot(f)).toBe(true);
    expect(mocks.save.mock.calls.map(call => [...call[1]])).toEqual([[1], [3]]);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("does not publish when cancellation arrives during cover rasterization", async () => {
    const f = input(), cover = deferred(), controller = new AbortController();
    mocks.raster.mockImplementationOnce(() => cover.promise);
    const task = writeDraftSnapshot({ ...f, signal: controller.signal });
    await tick();
    expect(mocks.raster).toHaveBeenCalledOnce();
    controller.abort(); cover.resolve(null);
    expect(await task).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it("waits for an already-started storage commit before publishing a newer snapshot", async () => {
    const f = input(), commit = deferred(), controller = new AbortController();
    mocks.save.mockImplementationOnce(() => commit.promise);
    const first = writeDraftSnapshot({ ...f, signal: controller.signal });
    await tick();
    expect(mocks.save).toHaveBeenCalledOnce();
    f.change(2);
    const second = writeDraftSnapshot(f);
    controller.abort(); await tick();
    expect(mocks.build).toHaveBeenCalledTimes(1);
    // An already-open IDB transaction is allowed to complete; cancellation
    // must not roll it back or let it race the newer commit.
    commit.resolve(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(mocks.save.mock.calls.map(call => [...call[1]])).toEqual([[1], [2]]);
  });
});

describe("single-flight draft scheduling", () => {
  it("coalesces notifications during an active write and runs only the latest due snapshot", async () => {
    const pending = deferred(), write = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(true);
    const saver = createDraftAutosaver({ write });
    saver.notify(); await vi.advanceTimersByTimeAsync(1500);
    saver.notify(); saver.notify(); await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(1);
    pending.resolve(true); await tick();
    expect(write).toHaveBeenCalledTimes(2);
    saver.cancel();
  });

  it("aborts in-flight computation and drops any due follow-up on cancellation", async () => {
    const pending = deferred(), write = vi.fn(() => pending.promise);
    const saver = createDraftAutosaver({ write });
    saver.notify(); await vi.advanceTimersByTimeAsync(1500);
    const signal = write.mock.calls[0][0].signal;
    saver.notify(); await vi.advanceTimersByTimeAsync(1500); saver.cancel();
    expect(signal.aborted).toBe(true);
    pending.resolve(false); await tick();
    expect(write).toHaveBeenCalledTimes(1);
    saver.notify(); await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(2);
    saver.cancel();
  });
});
