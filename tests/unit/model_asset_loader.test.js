import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveLocalModelUrl,
  loadModelAssetBytes,
  isModelAssetCached,
  deleteModelAsset,
} from "../../src/canvas/editor/model_asset_loader.js";

describe("model_asset_loader (Offline & Local Bundle & Browser Caching)", () => {
  const origWindow = globalThis.window;
  const origFetch = globalThis.fetch;
  const origCaches = globalThis.caches;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.window = origWindow;
    globalThis.fetch = origFetch;
    globalThis.caches = origCaches;
  });

  it("resolves local model URL relative to window location", () => {
    globalThis.window = {
      location: { href: "http://localhost:5173/index.html" },
    };
    const url = resolveLocalModelUrl("rmbg-1.4-fp16.onnx");
    expect(url).toBe("http://localhost:5173/models/rmbg-1.4-fp16.onnx");
  });

  it("loads model directly from Electron IPC without network fetch", async () => {
    const fakeBuffer = new ArrayBuffer(16);
    const mockLoadModelBytes = vi.fn().mockResolvedValue(fakeBuffer);

    globalThis.window = {
      electronAPI: {
        loadModelBytes: mockLoadModelBytes,
      },
    };

    const progressCalls = [];
    const bytes = await loadModelAssetBytes({
      filename: "rmbg-1.4-fp16.onnx",
      onProgress: (p) => progressCalls.push(p),
    });

    expect(mockLoadModelBytes).toHaveBeenCalledWith("rmbg-1.4-fp16.onnx");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(16);
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("loads bundled model via local fetch when not in Electron", async () => {
    globalThis.window = {
      location: { href: "http://localhost:5173/" },
    };

    const dummyData = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h) => (h === "content-length" ? "4" : null),
      },
      arrayBuffer: () => Promise.resolve(dummyData.buffer),
    });

    const bytes = await loadModelAssetBytes({
      filename: "lama_512_int8.onnx",
      fallbackUrl: "https://voo.run/models/lama_512_int8.onnx",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:5173/models/lama_512_int8.onnx");
    expect(bytes).toEqual(dummyData);
  });

  it("falls back to remote URL if local fetch fails", async () => {
    globalThis.window = {
      location: { href: "http://localhost:5173/" },
    };

    const remoteData = new Uint8Array([9, 8, 7]);
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("localhost:5173")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => "3" },
        arrayBuffer: () => Promise.resolve(remoteData.buffer),
      });
    });

    const bytes = await loadModelAssetBytes({
      filename: "custom.onnx",
      fallbackUrl: "https://voo.run/models/custom.onnx",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(bytes).toEqual(remoteData);
  });

  it("caches downloaded model into browser CacheStorage and reads from cache without network", async () => {
    const memoryCache = new Map();
    const mockCache = {
      match: vi.fn(async (key) => memoryCache.get(key) || null),
      put: vi.fn(async (key, resp) => {
        memoryCache.set(key, resp);
      }),
      delete: vi.fn(async (key) => {
        memoryCache.delete(key);
        return true;
      }),
    };

    globalThis.caches = {
      open: vi.fn().mockResolvedValue(mockCache),
    };

    globalThis.window = {
      location: { href: "http://localhost:5173/" },
    };

    const modelBytes = new Uint8Array([11, 22, 33, 44, 55]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "5" },
      arrayBuffer: () => Promise.resolve(modelBytes.buffer),
    });

    // 1. Initially not cached
    const isCachedInitially = await isModelAssetCached({
      filename: "test-model.onnx",
      fallbackUrl: "https://voo.run/models/test-model.onnx",
    });
    expect(isCachedInitially).toBe(false);

    // 2. First load: downloads and caches
    const loaded = await loadModelAssetBytes({
      filename: "test-model.onnx",
      fallbackUrl: "https://voo.run/models/test-model.onnx",
    });
    expect(loaded).toEqual(modelBytes);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockCache.put).toHaveBeenCalled();

    // 3. Now it should be cached
    const isCachedAfter = await isModelAssetCached({
      filename: "test-model.onnx",
      fallbackUrl: "https://voo.run/models/test-model.onnx",
    });
    expect(isCachedAfter).toBe(true);

    // 4. Second load: returns from cache, zero network fetch
    globalThis.fetch.mockClear();
    const loadedFromCache = await loadModelAssetBytes({
      filename: "test-model.onnx",
      fallbackUrl: "https://voo.run/models/test-model.onnx",
    });
    expect(loadedFromCache).toEqual(modelBytes);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // 5. Deleting model from cache
    await deleteModelAsset({
      filename: "test-model.onnx",
      fallbackUrl: "https://voo.run/models/test-model.onnx",
    });
    const isCachedAfterDelete = await isModelAssetCached({
      filename: "test-model.onnx",
      fallbackUrl: "https://voo.run/models/test-model.onnx",
    });
    expect(isCachedAfterDelete).toBe(false);
  });
});
