import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

/** Serve only real files inside the explicit editor build directory. */
export function createLoopbackAssetHandler(root) {
  return async (req, res) => {
    const missing = () => { res.writeHead(404, { "cache-control": "no-store" }); res.end("Not found"); };
    if (!root || !["GET", "HEAD"].includes(req.method)) return missing();
    try {
      const raw = (req.url ?? "/").split("?", 1)[0];
      const decoded = decodeURIComponent(raw);
      if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").includes("..")) return missing();
      const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
      const base = await realpath(root), target = await realpath(path.resolve(base, relative));
      if (!target.startsWith(`${base}${path.sep}`) || !(await stat(target)).isFile()) return missing();
      res.writeHead(200, { "content-type": TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
        "x-content-type-options": "nosniff", "cache-control": "no-store" });
      if (req.method === "HEAD") return res.end();
      createReadStream(target).on("error", error => res.destroy(error)).pipe(res);
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "URIError"].includes(error.code ?? error.name)) return missing();
      res.destroy(error);
    }
  };
}
