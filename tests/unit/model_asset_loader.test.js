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
      // CacheStorage returns a fresh response body for each match.
      match: vi.fn(async (key) => memoryCache.get(key)?.clone() || null),
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
    expect(mockCache.put).toHaveBeenCalledTimes(1);

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

  it("falls back remotely when a local SPA route returns HTTP 200 HTML", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    const valid = new Uint8Array([1, 2, 3]);
    const cache = { match: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() };
    globalThis.caches = { open: async () => cache };
    globalThis.fetch = vi.fn(async url => url.startsWith("https://example.test/")
      ? new Response("<!doctype html><html>Editor</html>", { headers: { "content-type": "text/html; charset=utf-8" } })
      : new Response(valid, { headers: { "content-type": "application/octet-stream" } }));
    expect(await loadModelAssetBytes({ filename: "test.onnx", fallbackUrl: "https://models.test/test.onnx" })).toEqual(valid);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalled();
    for (const [, response] of cache.put.mock.calls) {
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(valid);
    }
  });

  it("rejects HTML even if a server incorrectly labels it as binary", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    const valid = new Uint8Array([4, 5, 6]);
    globalThis.fetch = vi.fn(async url => url.startsWith("https://example.test/")
      ? new Response("<!DOCTYPE html><html>Editor</html>", { headers: { "content-type": "application/octet-stream" } })
      : new Response(valid));
    expect(await loadModelAssetBytes({ filename: "test.onnx", fallbackUrl: "https://models.test/test.onnx" })).toEqual(valid);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache an HTML response from the remote fallback", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    const cache = { match: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() };
    globalThis.caches = { open: async () => cache };
    globalThis.fetch = vi.fn(async url => url.startsWith("https://example.test/")
      ? new Response(null, { status: 404 })
      : new Response("<html>Error</html>", { headers: { "content-type": "text/html" } }));
    await expect(loadModelAssetBytes({ filename: "test.onnx", fallbackUrl: "https://models.test/test.onnx" })).rejects.toThrow("modelAssetInvalidResponse");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("evicts previously cached SPA HTML and replaces it with real model bytes", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    const valid = new Uint8Array([7, 8, 9]);
    const cache = {
      match: vi.fn(async () => new Response("<!doctype html><html>Stale editor</html>", { headers: { "content-type": "application/octet-stream" } })),
      delete: vi.fn(), put: vi.fn(),
    };
    globalThis.caches = { open: async () => cache };
    globalThis.fetch = vi.fn(async url => url.startsWith("https://example.test/") ? new Response(null, { status: 404 }) : new Response(valid));
    expect(await loadModelAssetBytes({ filename: "test.onnx", fallbackUrl: "https://models.test/test.onnx" })).toEqual(valid);
    expect(cache.delete).toHaveBeenCalledWith("https://example.test/editor/models/test.onnx");
    expect(cache.put).toHaveBeenCalled();
  });

  it("rejects an empty local payload and fetches the remote model", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    const valid = new Uint8Array([10, 11]);
    globalThis.fetch = vi.fn(async url => url.startsWith("https://example.test/") ? new Response(new Uint8Array()) : new Response(valid));
    expect(await loadModelAssetBytes({ filename: "test.onnx", fallbackUrl: "https://models.test/test.onnx" })).toEqual(valid);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps remote downloads available to desktop builds without a bundled optional model", async () => {
    const loadModelBytes = vi.fn().mockResolvedValue(null), valid = new Uint8Array([12, 13]);
    globalThis.window = { location: { href: "file:///application/dist/index.html" }, electronAPI: { loadModelBytes } };
    globalThis.fetch = vi.fn(async url => url.startsWith("file:") ? new Response(null, { status: 404 }) : new Response(valid));
    expect(await loadModelAssetBytes({ filename: "test.onnx", fallbackUrl: "https://models.test/test.onnx" })).toEqual(valid);
    expect(loadModelBytes).toHaveBeenCalledWith("test.onnx");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://models.test/test.onnx");
  });

  it("preserves native IPC availability reporting without reading a large model for status", async () => {
    const loadModelBytes = vi.fn();
    globalThis.window = { electronAPI: { loadModelBytes } };
    expect(await isModelAssetCached({ filename: "optional.onnx" })).toBe(true);
    expect(loadModelBytes).not.toHaveBeenCalled();
  });

  it("reports poisoned HTML cache entries as absent and removes them without fetching", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    const cache = {
      match: vi.fn(async () => new Response("<!doctype html><html>Editor</html>", { headers: { "content-type": "application/octet-stream" } })),
      delete: vi.fn(),
    };
    globalThis.caches = { open: async () => cache };
    globalThis.fetch = vi.fn();
    expect(await isModelAssetCached({ filename: "test.onnx" })).toBe(false);
    expect(cache.delete).toHaveBeenCalledWith("https://example.test/editor/models/test.onnx");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("checks only the first cache stream chunk and cancels further reading for status", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    let pulls = 0;
    const cancel = vi.fn();
    const cache = { match: vi.fn(async () => new Response(new ReadableStream({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array([1, 2, 3])); },
      cancel,
    }, { highWaterMark: 0 }))) };
    globalThis.caches = { open: async () => cache };
    expect(await isModelAssetCached({ filename: "test.onnx" })).toBe(true);
    expect(pulls).toBe(1); expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not start a network request after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = vi.fn();
    await expect(loadModelAssetBytes({ filename: "cancelled.onnx", signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("cancels a pending local fetch without starting the remote fallback", async () => {
    globalThis.window = { location: { href: "https://example.test/editor/" } };
    globalThis.caches = undefined;
    const controller = new AbortController();
    let started;
    const requestStarted = new Promise(resolve => { started = resolve; });
    globalThis.fetch = vi.fn((_url, { signal }) => {
      started();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    const request = loadModelAssetBytes({ filename: "cancelled.onnx", signal: controller.signal,
      fallbackUrl: "https://models.test/cancelled.onnx" });
    await requestStarted;
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

});
