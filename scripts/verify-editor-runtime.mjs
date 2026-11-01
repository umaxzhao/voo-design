import { pathToFileURL } from "node:url";

const RUNTIME_FILES = [
  "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm",
];

/** Do not publish an entry point whose runtime modules the browser cannot load. */
export async function verifyEditorRuntime(baseUrl, { fetchImpl = fetch } = {}) {
  const checks = [];
  for (const filename of RUNTIME_FILES) {
    const url = new URL(`ort/${filename}`, baseUrl);
    const response = await fetchImpl(url, { method: "HEAD" });
    if (response.status !== 200) throw new Error(`Editor runtime unavailable: ${url.pathname} (${response.status})`);
    const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const expected = filename.endsWith(".wasm") ? ["application/wasm"] : ["application/javascript", "text/javascript"];
    if (!expected.includes(type)) throw new Error(`Editor runtime MIME mismatch: ${url.pathname} (${type})`);
    checks.push({ path: url.pathname, type });
  }
  const missing = await fetchImpl(new URL("ort/__voo_missing_runtime__.mjs", baseUrl), { method: "HEAD" });
  if (missing.status !== 404) throw new Error("Missing editor runtime modules must return 404, never the SPA document");
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2];
  if (!baseUrl) throw new Error("Usage: node scripts/verify-editor-runtime.mjs <editor-url>");
  console.log(JSON.stringify({ runtime: "verified", checks: await verifyEditorRuntime(baseUrl) }, null, 2));
}
