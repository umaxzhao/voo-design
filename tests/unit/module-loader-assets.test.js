import { afterEach, expect, it, vi } from "vitest";
import { ensureModule, EDITOR_MODULE, _resetModuleStateCache } from "../../src/canvas/module_loader.js";

afterEach(() => {
  vi.unstubAllGlobals();
  _resetModuleStateCache();
});

it("loads the runtime beside an editor deployed below the origin root", async () => {
  vi.stubGlobal("document", { baseURI: "https://example.test/editor/?voo-test=1" });
  const fetcher = vi.fn(async (url) => new Response(null, {
    status: url === "https://example.test/editor/ort/ort-wasm-simd-threaded.wasm" ? 200 : 404,
  }));
  const load = vi.fn();
  const result = await ensureModule(EDITOR_MODULE.MATTING, { _deps: {
    getEnvironment: () => ({ mode: "standalone" }), fetch: fetcher, loaderOverride: load,
  } });
  expect(result).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledWith("https://example.test/editor/ort/ort-wasm-simd-threaded.wasm");
  expect(load).toHaveBeenCalledOnce();
});

it("retains the origin-root runtime URL without a document base", async () => {
  vi.stubGlobal("document", undefined);
  const fetcher = vi.fn(async () => new Response(null));
  await ensureModule(EDITOR_MODULE.MATTING, { _deps: {
    getEnvironment: () => ({ mode: "standalone" }), fetch: fetcher, loaderOverride: async () => {},
  } });
  expect(fetcher).toHaveBeenCalledWith("/ort/ort-wasm-simd-threaded.wasm");
});
