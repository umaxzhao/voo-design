import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/canvas/editor/ort_runtime.js", () => ({
  loadOrtRuntime: vi.fn(),
}));

vi.mock("../../src/canvas/editor/model_asset_loader.js", () => ({
  loadModelAssetBytes: vi.fn(),
  isModelAssetCached: vi.fn().mockResolvedValue(true),
  deleteModelAsset: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../src/canvas/editor/bitmap_cache.js", () => ({
  decodeImageSource: vi.fn().mockResolvedValue({ width: 32, height: 32, naturalWidth: 32, naturalHeight: 32 }),
}));

import { loadOrtRuntime } from "../../src/canvas/editor/ort_runtime.js";
import { loadModelAssetBytes } from "../../src/canvas/editor/model_asset_loader.js";
import { decodeImageSource } from "../../src/canvas/editor/bitmap_cache.js";
import {
  checkShouldStop,
  createSessionWithTimeout,
  DEFAULT_COMPILE_TIMEOUT_MS,
  getSession,
  releaseLocalUpscale,
} from "../../src/canvas/editor/upscale_compile.js";
import {
  runLocalUpscale,
} from "../../src/canvas/editor/local_upscale.js";
import { createImageActions } from "../../src/canvas/components/editor_hooks/raster-image-actions.js";

const setNavigatorGpu = (value) => {
  if (typeof navigator === "object") {
    Object.defineProperty(navigator, "gpu", {
      value,
      configurable: true,
      writable: true,
    });
  }
};

describe("local upscale cancellation and compile timeout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    releaseLocalUpscale();
    loadModelAssetBytes.mockResolvedValue(new Uint8Array(16));
    decodeImageSource.mockResolvedValue({
      width: 32,
      height: 32,
      naturalWidth: 32,
      naturalHeight: 32,
    });
  });

  afterEach(() => {
    releaseLocalUpscale();
    setNavigatorGpu(undefined);
  });

  describe("checkShouldStop predicate", () => {
    it("identifies stopped state across functions, signals, and falsy values", () => {
      expect(checkShouldStop(null)).toBe(false);
      expect(checkShouldStop(undefined)).toBe(false);
      expect(checkShouldStop(false)).toBe(false);
      expect(checkShouldStop(true)).toBe(false);

      expect(checkShouldStop(() => false)).toBe(false);
      expect(checkShouldStop(() => true)).toBe(true);

      const controller = new AbortController();
      expect(checkShouldStop(controller.signal)).toBe(false);
      controller.abort();
      expect(checkShouldStop(controller.signal)).toBe(true);

      // Throws safely treated as stopped
      expect(checkShouldStop(() => { throw new Error("test"); })).toBe(true);
    });
  });

  describe("createSessionWithTimeout", () => {
    it("resolves session when creation finishes before timeout", async () => {
      const mockSession = { release: vi.fn().mockResolvedValue(undefined) };
      const ort = {
        InferenceSession: {
          create: vi.fn().mockResolvedValue(mockSession),
        },
      };

      const session = await createSessionWithTimeout(ort, new Uint8Array([1]), "webgpu", {
        timeoutMs: 500,
        shouldStop: () => false,
      });

      expect(session).toBe(mockSession);
      expect(ort.InferenceSession.create).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        { executionProviders: ["webgpu"], graphOptimizationLevel: "all" },
      );
    });

    it("rejects immediately with stopped when shouldStop is already true", async () => {
      const ort = {
        InferenceSession: {
          create: vi.fn(),
        },
      };

      await expect(
        createSessionWithTimeout(ort, new Uint8Array([1]), "webgpu", {
          timeoutMs: 500,
          shouldStop: () => true,
        }),
      ).rejects.toThrow("stopped");

      expect(ort.InferenceSession.create).not.toHaveBeenCalled();
    });

    it("cancels immediately when shouldStop becomes true while compilation is pending", async () => {
      let resolveCompile;
      const released = vi.fn().mockResolvedValue(undefined);
      const compilePromise = new Promise((resolve) => {
        resolveCompile = resolve;
      });

      const ort = {
        InferenceSession: {
          create: vi.fn().mockReturnValue(compilePromise),
        },
      };

      let stopped = false;
      const promise = createSessionWithTimeout(ort, new Uint8Array([1]), "webgpu", {
        timeoutMs: 5000,
        shouldStop: () => stopped,
      });

      // Trigger cancellation while compile is pending
      stopped = true;

      await expect(promise).rejects.toThrow("stopped");

      // Verify late resolving session is released
      resolveCompile({ release: released });
      await new Promise((r) => setTimeout(r, 10));
      expect(released).toHaveBeenCalled();
    });

    it("cancels immediately when AbortSignal fires abort", async () => {
      const compilePromise = new Promise(() => {});
      const ort = {
        InferenceSession: {
          create: vi.fn().mockReturnValue(compilePromise),
        },
      };

      const controller = new AbortController();
      const promise = createSessionWithTimeout(ort, new Uint8Array([1]), "webgpu", {
        timeoutMs: 5000,
        shouldStop: controller.signal,
      });

      controller.abort();

      await expect(promise).rejects.toThrow("stopped");
    });

    it("times out when compilation hangs longer than timeoutMs", async () => {
      const compilePromise = new Promise(() => {});
      const ort = {
        InferenceSession: {
          create: vi.fn().mockReturnValue(compilePromise),
        },
      };

      const promise = createSessionWithTimeout(ort, new Uint8Array([1]), "webgpu", {
        timeoutMs: 50,
        shouldStop: () => false,
      });

      await expect(promise).rejects.toThrow(/upscaleCompileTimeout: webgpu compilation exceeded 50ms/);
    });

    it("propagates genuine compiler errors directly", async () => {
      const ort = {
        InferenceSession: {
          create: vi.fn().mockRejectedValue(new Error("webgpuCompilationFailed")),
        },
      };

      await expect(
        createSessionWithTimeout(ort, new Uint8Array([1]), "webgpu", {
          timeoutMs: 500,
          shouldStop: () => false,
        }),
      ).rejects.toThrow("webgpuCompilationFailed");
    });
  });

  describe("getSession cancellation & timeout integration", () => {
    it("aborts getSession before runtime load if shouldStop is set", async () => {
      await expect(
        getSession({ id: "model-1", filename: "m.onnx" }, null, {
          shouldStop: () => true,
        }),
      ).rejects.toThrow("stopped");
    });

    it("falls back from timed-out webgpu provider to wasm provider", async () => {
      const wasmSession = { release: vi.fn() };
      setNavigatorGpu({});

      loadOrtRuntime.mockResolvedValue({
        InferenceSession: {
          create: vi.fn((bytes, opts) => {
            if (opts.executionProviders[0] === "webgpu") {
              // Hang webgpu
              return new Promise(() => {});
            }
            return Promise.resolve(wasmSession);
          }),
        },
      });

      const result = await getSession(
        { id: "model-fallback", filename: "m.onnx" },
        vi.fn(),
        { compileTimeoutMs: 50, shouldStop: () => false },
      );

      expect(result.session).toBe(wasmSession);
    });

    it("throws stopped and stops further providers when cancelled during provider compilation", async () => {
      let webgpuCallCount = 0;
      let wasmCallCount = 0;
      let shouldStopFlag = false;

      setNavigatorGpu({});

      loadOrtRuntime.mockResolvedValue({
        InferenceSession: {
          create: vi.fn((bytes, opts) => {
            if (opts.executionProviders[0] === "webgpu") {
              webgpuCallCount++;
              // Cancel while webgpu is pending
              shouldStopFlag = true;
              return new Promise(() => {});
            }
            wasmCallCount++;
            return Promise.resolve({});
          }),
        },
      });

      await expect(
        getSession(
          { id: "model-cancel", filename: "m.onnx" },
          vi.fn(),
          { compileTimeoutMs: 5000, shouldStop: () => shouldStopFlag },
        ),
      ).rejects.toThrow("stopped");

      expect(webgpuCallCount).toBe(1);
      expect(wasmCallCount).toBe(0); // Did not proceed to wasm!
    });
  });

  describe("runLocalUpscale cancellation & fallback behavior", () => {
    it("does not fall back to canvas when shouldStop is requested during compilation", async () => {
      const mockBitmap = { width: 32, height: 32 };
      let stop = false;

      loadOrtRuntime.mockImplementation(async () => {
        stop = true;
        throw new Error("stopped");
      });

      const onProgress = vi.fn();
      await expect(
        runLocalUpscale(mockBitmap, {
          scale: 2,
          shouldStop: () => stop,
          onProgress,
        }),
      ).rejects.toThrow("stopped");

      // Verify it did NOT enter fallback phase
      expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ phase: "fallback" }));
    });
  });

  describe("raster-image-actions clean cancellation", () => {
    it("cleanly resets busy/progress states and does not set maskError or materialize on abort", async () => {
      const setUpscaleBusy = vi.fn();
      const setUpscaleProgress = vi.fn();
      const setMaskError = vi.fn();
      const emitGeneratedOutput = vi.fn();
      const inFlightAbortRef = { current: null };

      const context = {
        engine: {
          exportNodePng: vi.fn().mockReturnValue({ width: 32, height: 32 }),
          serialise: vi.fn().mockReturnValue({}),
        },
        selected: { id: "img-1", kind: "image" },
        upscaleBusy: false,
        retouchBusy: false,
        setMaskError,
        setUpscaleBusy,
        setUpscaleProgress,
        setRetouchBusy: vi.fn(),
        setRetouchFailure: vi.fn(),
        reportRetouchError: vi.fn(),
        emitGeneratedOutput,
        onMaterializeGeneratedOutput: vi.fn(),
        inFlightAbortRef,
        isCurrent: () => true,
      };

      // Mock runLocalUpscale to abort via inFlightAbortRef while running
      const localUpscaleModule = await import("../../src/canvas/editor/local_upscale.js");
      vi.spyOn(localUpscaleModule, "runLocalUpscale").mockImplementation(async (bitmap, opts) => {
        // User clicks cancel during compile/run:
        inFlightAbortRef.current?.abort();
        throw new Error("stopped");
      });

      const { upscaleImage } = createImageActions(context);
      const result = await upscaleImage(2);

      expect(result).toBe(false);
      // maskError must NOT be reported on cancellation
      expect(setMaskError).not.toHaveBeenCalled();
      // emitGeneratedOutput must NOT be called on cancellation
      expect(emitGeneratedOutput).not.toHaveBeenCalled();
      // Progress and busy states must be reset
      expect(setUpscaleBusy).toHaveBeenCalledWith(false);
      expect(setUpscaleProgress).toHaveBeenCalledWith(null);
    });

    it("reports maskError on real unexpected failures", async () => {
      const setUpscaleBusy = vi.fn();
      const setUpscaleProgress = vi.fn();
      const setMaskError = vi.fn();
      const emitGeneratedOutput = vi.fn();
      const inFlightAbortRef = { current: null };

      const context = {
        engine: {
          exportNodePng: vi.fn().mockReturnValue({ width: 32, height: 32 }),
          serialise: vi.fn().mockReturnValue({}),
        },
        selected: { id: "img-1", kind: "image" },
        upscaleBusy: false,
        retouchBusy: false,
        setMaskError,
        setUpscaleBusy,
        setUpscaleProgress,
        setRetouchBusy: vi.fn(),
        setRetouchFailure: vi.fn(),
        reportRetouchError: vi.fn(),
        emitGeneratedOutput,
        onMaterializeGeneratedOutput: vi.fn(),
        inFlightAbortRef,
        isCurrent: () => true,
      };

      const localUpscaleModule = await import("../../src/canvas/editor/local_upscale.js");
      vi.spyOn(localUpscaleModule, "runLocalUpscale").mockRejectedValue(new Error("gpuOutOfMemory"));

      const { upscaleImage } = createImageActions(context);
      const result = await upscaleImage(2);

      expect(result).toBe(false);
      // Real failure must report maskError
      expect(setMaskError).toHaveBeenCalled();
    });
  });
});
