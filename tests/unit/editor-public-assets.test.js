import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, createServer } from "vite";
import { copyEditorPublicAssets, editorPublicAssetsPlugin } from "../../scripts/editor-public-assets.mjs";

let root;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "voo-public-assets-")));
  for (const folder of ["public/models", "public/ort", "public/fonts", "public/brand-icons"]) {
    await mkdir(join(root, folder), { recursive: true });
  }
  await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>');
  await writeFile(join(root, "main.js"), "document.title = 'asset policy';");
  // This tiny fixture is not an inference model and never touches ignored weights.
  await writeFile(join(root, "public/models/fixture.onnx"), "fixture model bytes");
  for (const name of ["ort/runtime.wasm", "fonts/example.woff2", "brand-icons/models.svg", "LICENSE"]) {
    await writeFile(join(root, "public", name), `public asset: ${name}`);
  }
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
const exists = async path => Boolean(await stat(path).catch(error => { if (error.code === "ENOENT") return null; throw error; }));
const copy = extra => copyEditorPublicAssets({ publicDir: join(root, "public"), outDir: join(root, "out"), ...extra });
const production = extra => build({
  configFile: false, root, logLevel: "silent",
  plugins: [editorPublicAssetsPlugin()],
  build: { outDir: "out", copyPublicDir: false, ...extra },
});

describe("editor public-asset model policy", () => {
  it("excludes root model weights while retaining fonts, WASM, brands and notices", async () => {
    const result = await copy();
    expect(result.bundledModels).toBe(false);
    expect(await exists(join(root, "out/models"))).toBe(false);
    for (const name of ["ort/runtime.wasm", "fonts/example.woff2", "brand-icons/models.svg", "LICENSE"]) {
      expect(await readFile(join(root, "out", name), "utf8")).toBe(`public asset: ${name}`);
    }
    expect(await readFile(join(root, "public/models/fixture.onnx"), "utf8")).toBe("fixture model bytes");
  });

  it("copies supplied local weights only when explicitly opted in", async () => {
    expect((await copy({ bundleModels: true })).bundledModels).toBe(true);
    expect(await readFile(join(root, "out/models/fixture.onnx"), "utf8")).toBe("fixture model bytes");
  });

  it("fails an offline request with no source weights instead of promising an empty bundle", async () => {
    await rm(join(root, "public/models"), { recursive: true });
    await expect(copy({ bundleModels: true })).rejects.toThrow("requires a public/models directory");
    await mkdir(join(root, "public/models"));
    await expect(copy({ bundleModels: true })).rejects.toThrow("non-empty ONNX weight");
  });

  it("preserves normal dev access to on-demand public models", async () => {
    const server = await createServer({ configFile: false, root, logLevel: "silent", plugins: [editorPublicAssetsPlugin()], server: { port: 0, host: "127.0.0.1" } });
    try {
      await server.listen();
      const port = server.httpServer.address().port;
      const response = await fetch(`http://127.0.0.1:${port}/models/fixture.onnx`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("fixture model bytes");
    } finally { await server.close(); }
  });

  it("writes a production web build without models and keeps its static runtime assets", async () => {
    vi.stubEnv("VOO_BUNDLE_MODELS", "0");
    await production();
    expect(await exists(join(root, "out/index.html"))).toBe(true);
    expect(await exists(join(root, "out/ort/runtime.wasm"))).toBe(true);
    expect(await exists(join(root, "out/models"))).toBe(false);
  });

  it("supports the explicit offline build flag", async () => {
    vi.stubEnv("VOO_BUNDLE_MODELS", "1");
    await production();
    expect(await readFile(join(root, "out/models/fixture.onnx"), "utf8")).toBe("fixture model bytes");
  });

  it("fails a desktop/offline build with absent weights instead of silently shipping none", async () => {
    await rm(join(root, "public/models"), { recursive: true });
    await expect(build({
      configFile: false, root, mode: "electron", logLevel: "silent",
      plugins: [editorPublicAssetsPlugin({ bundleModels: true })],
      build: { outDir: "out", copyPublicDir: false },
    })).rejects.toThrow("requires a public/models directory");
  });

  it("does not copy public assets during an in-memory bundle analysis", async () => {
    await production({ write: false });
    expect(await exists(join(root, "out"))).toBe(false);
  });
});
