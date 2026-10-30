const fs = require("node:fs");
const path = require("node:path");
exports.registerClientModelIpc = function registerClientModelIpc(ipcMain, app) {
  // Models are read by name from a fixed set of bundled directories. The name
  // comes from the renderer, so it is accepted only as a bare file name that is
  // on the allowlist, and the resolved path must stay inside the directory.
  const BUNDLED_MODEL_FILES = new Set(["lama_512_fp16.onnx", "lama_512_int8.onnx", "rmbg-1.4-fp16.onnx", "realesrgan-compact-2x.onnx", "realesrgan-compact-4x.onnx", "realesr-general-x4v3.onnx", "realesr-animevideov3.onnx", "isnet-general-fp16.onnx", "u2netp.onnx"]);
  function bundledModelDirs() {
    const dirs = [path.join(__dirname, "../dist/models"), path.join(__dirname, "../public/models"), path.join(__dirname, "../vendor/client-models"), path.join(app.getAppPath(), "models"), path.join(app.getAppPath(), "dist/models"), path.join(app.getAppPath(), "public/models")];
    if (process.resourcesPath) {
      dirs.push(path.join(process.resourcesPath, "models"));
    }
    return dirs;
  }
  function resolveBundledModelPath(modelName) {
    if (typeof modelName !== "string" || !BUNDLED_MODEL_FILES.has(modelName)) {
      throw new Error(`model:loadBytes rejected unknown model: ${String(modelName)}`);
    }
    for (const dir of bundledModelDirs()) {
      const fullPath = path.resolve(dir, modelName);
      if (path.dirname(fullPath) !== path.resolve(dir)) continue;
      if (fs.existsSync(fullPath)) return fullPath;
    }
    return null;
  }
  ipcMain.handle("model:loadBytes", async (_, modelName) => {
    const fullPath = resolveBundledModelPath(modelName);
    if (!fullPath) return null;
    const buf = await fs.promises.readFile(fullPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });
};
