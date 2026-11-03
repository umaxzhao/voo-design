import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/** Content types the editor build ships. Unknown extensions fall back to bytes. */
const CONTENT_TYPES = new Map(Object.entries({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
}));

/** The page shown when the editor build is missing, so the panel explains itself. */
const MISSING_BUILD_PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>VOO 编辑器 · 未构建</title>
<style>
  html,body{margin:0;height:100%;background:#000;color:#f5f5f5;
    font:13px/1.6 ui-monospace,Menlo,Consolas,"PingFang SC","Microsoft YaHei",sans-serif}
  main{box-sizing:border-box;height:100%;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:24px}
  h1{margin:0;font-size:14px;font-weight:600}
  p{margin:0;color:#a3a3a3}
  code{color:#f5f5f5}
</style></head>
<body><main>
  <h1>VOO 编辑器尚未构建</h1>
  <p>在 VOO 仓库运行 <code>npm run build</code>，然后刷新这个面板。</p>
  <p>VOO editor build not found. Run <code>npm run build</code> in the VOO repository, then reload this panel.</p>
</main></body></html>`;

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function inside(root, target) {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * Map a request path to a file in the editor build. Directory requests and
 * extension-less routes fall back to `index.html` so the panel survives a
 * deep link into the SPA.
 *
 * @returns {string|null} the file to serve, or `null` when the path escapes the build.
 */
export function resolveEditorFile(editorDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const index = path.join(editorDir, "index.html");
  if (decoded.length === 0) return index;
  const target = path.resolve(editorDir, decoded);
  if (!inside(editorDir, target)) return null;
  if (isFile(target)) return target;
  const extension = path.extname(target);
  return extension.length === 0 || decoded.endsWith("/") ? index : target;
}

/**
 * Start the loopback static server for the built VOO editor.
 *
 * The server answers `GET`/`HEAD` only, binds to `host`, and serves
 * `/__voo/health` as JSON so scripts and the panel can tell the build state
 * apart from a connection failure.
 *
 * @param {{host?: string, port: number, editorDir: string, logger?: Console}} options
 * @returns {Promise<{url: string, port: number, editorDir: string, hasBuild: boolean, close: () => Promise<void>}>}
 */
export async function startEditorServer(options) {
  const { host = "127.0.0.1", port, editorDir, logger = console } = options;
  const indexPath = path.join(editorDir, "index.html");

  const server = http.createServer((request, response) => {
    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method Not Allowed");
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Bad Request");
      return;
    }

    if (pathname === "/__voo/health") {
      const body = JSON.stringify({ ok: true, service: "voo", editorDir, hasBuild: isFile(indexPath) });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(method === "HEAD" ? undefined : body);
      return;
    }

    if (!isFile(indexPath)) {
      if (pathname === "/" || pathname === "/index.html") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(method === "HEAD" ? undefined : MISSING_BUILD_PAGE);
        return;
      }
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    const filePath = resolveEditorFile(editorDir, pathname);
    if (filePath === null) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }
    if (!isFile(filePath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    const entry = path.basename(filePath) === "index.html";
    const headers = {
      "Content-Type": CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "Cache-Control": entry ? "no-store" : "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    };
    if (method === "HEAD") {
      response.writeHead(200, headers);
      response.end();
      return;
    }
    response.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
      logger.error?.(`[voo] failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      response.destroy();
    });
    stream.pipe(response);
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const actualPort = server.address().port;
  return {
    url: `http://${host}:${actualPort}`,
    port: actualPort,
    editorDir,
    hasBuild: isFile(indexPath),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
