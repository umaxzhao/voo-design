import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** Development mirrors the production model download URL without ignored local files. */
export function clientModelAssetsPlugin() {
  return {
    name: "voo-client-model-downloads",
    async configureServer(server) {
      const directory = join(server.config.root, "vendor/client-models");
      const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
      const allowed = new Set([...manifest.models.map(model => model.file), "manifest.json", "realesrgan-license.txt"]);
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (!["GET", "HEAD"].includes(request.method) || !pathname.startsWith("/models/")) return next();
        const filename = pathname.slice("/models/".length);
        if (!allowed.has(filename)) return next();
        try {
          const file = join(directory, filename);
          const info = await stat(file);
          response.setHeader("Content-Type", filename.endsWith(".onnx") ? "application/octet-stream" : filename.endsWith(".json") ? "application/json" : "text/plain");
          response.setHeader("Content-Length", info.size);
          if (request.method === "HEAD") return response.end();
          createReadStream(file).on("error", next).pipe(response);
        } catch (error) {
          next(error);
        }
      });
    }
  };
}
