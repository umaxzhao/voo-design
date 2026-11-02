import { describe, expect, it, vi } from "vitest";
import { verifyEditorRuntime } from "../../scripts/verify-editor-runtime.mjs";

function responseFor(url) {
  if (url.pathname.includes("__voo_missing_runtime__")) return new Response(null, { status: 404 });
  return new Response(null, { headers: { "content-type": url.pathname.endsWith(".wasm")
    ? "application/wasm" : "text/javascript; charset=utf-8" } });
}

describe("deployed editor runtime gate", () => {
  it("accepts actual module/wasm content types and checks a scoped missing module", async () => {
    const fetchImpl = vi.fn(async url => responseFor(url));
    const checks = await verifyEditorRuntime("https://example.test/editor/", { fetchImpl });
    expect(checks).toHaveLength(6);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(fetchImpl.mock.calls.every(([url, options]) => url.pathname.startsWith("/editor/ort/") && options.method === "HEAD")).toBe(true);
  });

  it.each([".mjs", ".wasm"])("blocks publication when %s files are served as generic binaries", async extension => {
    const fetchImpl = async url => url.pathname.endsWith(extension)
      ? new Response(null, { headers: { "content-type": "application/octet-stream" } }) : responseFor(url);
    await expect(verifyEditorRuntime("https://example.test/editor/", { fetchImpl })).rejects.toThrow("MIME mismatch");
  });

  it("rejects a missing required runtime", async () => {
    await expect(verifyEditorRuntime("https://example.test/editor/", {
      fetchImpl: async () => new Response(null, { status: 404 }),
    })).rejects.toThrow("unavailable");
  });

  it("rejects an HTML fallback for nonexistent modules", async () => {
    await expect(verifyEditorRuntime("https://example.test/editor/", { fetchImpl: async url =>
      url.pathname.includes("__voo_missing_runtime__") ? new Response("<html></html>") : responseFor(url),
    })).rejects.toThrow("must return 404");
  });
});
