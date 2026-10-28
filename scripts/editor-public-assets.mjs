import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

/** Copy static runtime assets without making ignored local weights a web-build input. */
export async function copyEditorPublicAssets({ publicDir, outDir, bundleModels = false }) {
  const source = resolve(publicDir), target = resolve(outDir);
  const inside = relative(source, target);
  if (!inside || (!inside.startsWith("..") && !isAbsolute(inside))) {
    throw new Error("The public asset output must be outside the public source directory");
  }
  let entries;
  try { entries = await readdir(source, { withFileTypes: true }); }
  catch (error) {
    if (error.code !== "ENOENT" || bundleModels) throw error;
    return { copiedEntries: [], bundledModels: false };
  }
  if (bundleModels) {
    const modelDir = join(source, "models");
    const info = await stat(modelDir).catch(error => {
      if (error.code === "ENOENT") throw new Error("VOO_BUNDLE_MODELS=1 requires a public/models directory");
      throw error;
    });
    if (!info.isDirectory()) throw new Error("public/models must be a directory");
    const models = (await readdir(modelDir)).filter(name => name.endsWith(".onnx"));
    const weights = await Promise.all(models.map(name => stat(join(modelDir, name))));
    if (!weights.some(file => file.isFile() && file.size > 0)) {
      throw new Error("VOO_BUNDLE_MODELS=1 requires at least one non-empty ONNX weight");
    }
  }
  await mkdir(target, { recursive: true });
  const copiedEntries = [];
  for (const entry of entries) {
    if (entry.name === "models" && !bundleModels) continue;
    await cp(join(source, entry.name), join(target, entry.name), { recursive: true, force: true, dereference: true });
    copiedEntries.push(entry.name);
  }
  return { copiedEntries, bundledModels: bundleModels };
}

/** Keep Vite's normal public directory in dev; apply this policy only when writing a build. */
export function editorPublicAssetsPlugin({ bundleModels = process.env.VOO_BUNDLE_MODELS === "1" } = {}) {
  let config;
  return {
    name: "voo-editor-public-assets",
    apply: "build",
    configResolved(resolved) { config = resolved; },
    async writeBundle() {
      if (config.build.write === false || config.publicDir === false) return;
      await copyEditorPublicAssets({
        publicDir: config.publicDir,
        outDir: resolve(config.root, config.build.outDir),
        bundleModels,
      });
    },
  };
}
