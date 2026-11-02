import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const directory = new URL("../vendor/client-models/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
for (const model of manifest.models) {
  if (!/^[a-z0-9-]+\.onnx$/.test(model.file)) throw new Error("Invalid client model filename");
  const bytes = await readFile(new URL(model.file, directory));
  if (bytes.length !== model.bytes || createHash("sha256").update(bytes).digest("hex") !== model.sha256) {
    throw new Error(`Client model checksum mismatch: ${model.file}`);
  }
}
console.log(`Verified ${manifest.models.length} pinned client model files.`);
