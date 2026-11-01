import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function prepare(gpu) {
  vi.resetModules();
  vi.stubGlobal("navigator", { gpu });
  const { prepareAiRepairModel } = await import("../../src/canvas/editor/local_ai_repair.js");
  return prepareAiRepairModel();
}

describe("AI repair backend selection", () => {
  it.each([
    ["no GPU API", undefined],
    ["an exposed API without adapters", { requestAdapter: async () => null }],
    ["an adapter without FP16", { requestAdapter: async () => ({ features: new Set() }) }],
  ])("uses actual INT8 inference with %s", async (_name, gpu) => {
    expect(await prepare(gpu)).toMatchObject({ id: "lama-512-int8", backend: "wasm" });
  });

  it("uses the FP16 model only with a usable GPU adapter", async () => {
    expect(await prepare({ requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) }))
      .toMatchObject({ id: "lama-512-fp16", backend: "webgpu" });
  });

  it("bounds adapter detection when a browser never resolves its probe", async () => {
    vi.useFakeTimers();
    const model = prepare({ requestAdapter: () => new Promise(() => {}) });
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
    await vi.advanceTimersByTimeAsync(1500);
    expect(await model).toMatchObject({ backend: "wasm" });
  });
});
