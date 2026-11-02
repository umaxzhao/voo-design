// Copies CanvasKit WASM binary and JavaScript loader into public/.
// Skia host and CanvasKit loader expect these unhashed files under the public root (/canvaskit.js and /canvaskit.wasm).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "node_modules/canvaskit-wasm/bin");
const targetDir = path.join(root, "public");

const CANVASKIT_FILES = [
  "canvaskit.js",
  "canvaskit.wasm",
];

mkdirSync(targetDir, { recursive: true });
for (const file of CANVASKIT_FILES) {
  const from = path.join(sourceDir, file);
  if (!existsSync(from)) {
    throw new Error(`canvaskit-wasm file missing: ${from}. Run npm install first.`);
  }
  copyFileSync(from, path.join(targetDir, file));
}
console.log(`Copied ${CANVASKIT_FILES.length} CanvasKit files to public/`);
