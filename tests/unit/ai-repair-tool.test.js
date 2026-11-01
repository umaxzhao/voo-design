import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiRepairTool } from "../../src/canvas/editor/ai-repair-tool.js";

const model = vi.hoisted(() => ({
  prepareAiRepairModel: vi.fn(), isAiRepairModelCached: vi.fn(),
  inpaintWithLocalAi: vi.fn(), downloadAiRepairModel: vi.fn(), deleteAiRepairModel: vi.fn(),
}));
vi.mock("../../src/canvas/editor/local_ai_repair.js", () => model);

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  model.prepareAiRepairModel.mockResolvedValue({ id: "compatible", backend: "wasm" });
  model.isAiRepairModelCached.mockResolvedValue(true);
  const context = { drawImage: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn() };
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture() {
  let node = { id: "image", kind: "image", imageId: "original", width: 20, height: 20, x: 0, y: 0 };
  let state = null;
  let disposed = false;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  model.inpaintWithLocalAi.mockImplementation((_source, _mask, { signal }) => {
    started();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const writer = vi.fn().mockResolvedValue(true);
  const tool = createAiRepairTool({
    getDoc: () => ({ nodes: node ? [node] : [] }), cache: { get: () => ({ width: 20, height: 20 }) },
    getPixelSelection: () => null, getAiRepairDownload: () => state,
    setAiRepairDownload: value => { state = value; }, replaceNodeBitmap: writer,
    isDisposed: () => disposed, notify: vi.fn(),
  });
  return { tool, ready, writer, state: () => state,
    cancel: () => { state.abort(); state = null; },
    replace: () => { node = { ...node, imageId: "newer-edit" }; },
    dispose: () => { disposed = true; } };
}

describe("AI repair edit transaction", () => {
  it("exposes running cancellation even when weights are already cached", async () => {
    const f = fixture();
    const result = f.tool.inpaintAiRepairStroke("image", [{ x: 4, y: 4 }]);
    await f.ready;
    expect(f.state().phase).toBe("running");
    f.cancel();
    await expect(result).resolves.toBe(false);
    expect(f.writer).not.toHaveBeenCalled();
    expect(f.state()).toBeNull();
  });

  it.each(["replace", "dispose"])("stops inference after %s and never publishes a stale bitmap", async change => {
    const f = fixture();
    const result = f.tool.inpaintAiRepairStroke("image", [{ x: 4, y: 4 }]);
    await f.ready;
    f[change]();
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBe(false);
    expect(f.writer).not.toHaveBeenCalled();
    expect(f.state()).toBeNull();
  });

  it("refuses to download/resume a stroke after its source image has changed", async () => {
    const f = fixture();
    model.isAiRepairModelCached.mockResolvedValue(false);
    await f.tool.inpaintAiRepairStroke("image", [{ x: 4, y: 4 }]);
    expect(f.state().phase).toBe("required");
    f.replace();
    await expect(f.tool.downloadAiRepairModel()).resolves.toBe(false);
    expect(model.downloadAiRepairModel).not.toHaveBeenCalled();
    expect(f.state()).toBeNull();
  });

  it("retries a failed GPU edit with the newly selected compatible model", async () => {
    const f = fixture();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gpu = { id: "fast", backend: "webgpu" };
    const compatible = { id: "compatible", backend: "wasm" };
    model.prepareAiRepairModel.mockResolvedValueOnce(gpu);
    model.inpaintWithLocalAi.mockRejectedValueOnce(new Error("GPU unavailable"));
    await f.tool.inpaintAiRepairStroke("image", [{ x: 4, y: 4 }]);
    expect(f.state().phase).toBe("runFailed");
    model.inpaintWithLocalAi.mockResolvedValueOnce("data:image/png,repaired");
    await expect(f.tool.downloadAiRepairModel()).resolves.toBe(true);
    expect(model.deleteAiRepairModel).toHaveBeenCalledWith(gpu);
    expect(model.downloadAiRepairModel).toHaveBeenCalledWith(expect.objectContaining({ model: compatible }));
    expect(f.writer).toHaveBeenCalledOnce();
    expect(f.state()).toBeNull();
    warning.mockRestore();
  });
});
