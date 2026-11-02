import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const defaultManifest = JSON.parse(await readFile(new URL("./desktop-model-manifest.json", import.meta.url), "utf8"));

async function downloadWeight(source, model, baseUrl, fetcher) {
  const response = await fetcher(new URL(model.file, `${baseUrl.replace(/\/+$/, "")}/`).href);
  if (!response.ok || !response.body) throw new Error(`Desktop model download failed: ${model.file} (HTTP ${response.status})`);
  const temporary = `${source}.partial`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    const info = await stat(temporary);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(temporary)) hash.update(chunk);
    if (info.size !== model.bytes || hash.digest("hex") !== model.sha256) throw new Error(`Desktop model download checksum mismatch: ${model.file}`);
    await rename(temporary, source);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Verify every advertised local AI feature before writing any package input. */
export async function prepareDesktopModels({
  sourceDirectory = process.env.VOO_DESKTOP_MODELS_DIR || resolve(root, "public/models"),
  outputDirectory = resolve(root, "dist-electron/models"),
  manifest = defaultManifest,
  downloadMissing = false,
  fetcher = globalThis.fetch,
} = {}) {
  for (const model of manifest.models) {
    if (!/^[a-z0-9][a-z0-9._-]*\.onnx$/.test(model.file)) throw new Error("Invalid desktop model filename");
    const source = resolve(sourceDirectory, model.file);
    let info;
    try { info = await stat(source); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!downloadMissing) throw new Error(`Required desktop model missing: ${model.file}. Set VOO_DESKTOP_MODELS_DIR to the provisioned weight directory.`);
      await mkdir(sourceDirectory, { recursive: true });
      await downloadWeight(source, model, process.env.VOO_DESKTOP_MODEL_BASE_URL || manifest.baseUrl, fetcher);
      info = await stat(source);
    }
    if (!info.isFile() || info.size !== model.bytes) throw new Error(`Desktop model size mismatch: ${model.file}`);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(source)) hash.update(chunk);
    if (hash.digest("hex") !== model.sha256) throw new Error(`Desktop model checksum mismatch: ${model.file}`);
  }
  await mkdir(outputDirectory, { recursive: true });
  for (const model of manifest.models) {
    await cp(resolve(sourceDirectory, model.file), resolve(outputDirectory, model.file));
  }
  await writeFile(resolve(outputDirectory, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest.models.map(model => model.file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = await prepareDesktopModels({ downloadMissing: process.argv.includes("--download") });
  process.stdout.write(`Verified and staged ${files.length} required desktop AI weights.\n`);
}
