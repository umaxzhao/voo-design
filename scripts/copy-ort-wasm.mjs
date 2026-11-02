// Copies the ONNX Runtime wasm binaries and their loaders into public/ort.
// ort_runtime.js and module_loader.js expect these unhashed file names under /ort/,
// and the runtime builds the wasm URL itself, so Vite cannot discover them.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "node_modules/onnxruntime-web/dist");
const targetDir = path.join(root, "public/ort");

const ORT_FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

mkdirSync(targetDir, { recursive: true });
for (const file of ORT_FILES) {
  const from = path.join(sourceDir, file);
  // Fail fast: a missing binary would otherwise surface later as a model start error.
  if (!existsSync(from)) {
    throw new Error(`onnxruntime-web file missing: ${from}. Run npm install first.`);
  }
  copyFileSync(from, path.join(targetDir, file));
}
console.log(`Copied ${ORT_FILES.length} ONNX Runtime files to public/ort`);
