import { createServer as createHttpServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";

/** Keep the actual listener bound while configuring its bridge and Vite middleware. */
export async function startEditorBrowserServer() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  // Each bridge URL changes Vite's config hash. Sharing node_modules/.vite
  // across concurrent fixtures invalidated active browsers with 504 errors.
  const cacheDir = await mkdtemp(join(tmpdir(), "voo-editor-vite-"));
  const server = createHttpServer();
  let bridge;
  let vite;
  let closing;
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      const results = await Promise.allSettled([vite?.close(), bridge?.close()]);
      server.closeAllConnections();
      if (server.listening) {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
      // Vite may finish deleting an optimizer batch as its close promise settles.
      // Node retries transient ENOTEMPTY/EBUSY races; permanent errors still reject.
      await rm(cacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, "Editor fixture server cleanup failed");
    })();
    return closing;
  };
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    bridge = await startCliBridgeServer({ port: 0, origins: [origin] });
    vite = await createViteServer({
      root,
      cacheDir,
      configFile: fileURLToPath(new URL("../../vite.config.js", import.meta.url)),
      logLevel: "error",
      define: { "import.meta.env.VITE_CLI_BRIDGE_URL": JSON.stringify(`ws://127.0.0.1:${bridge.port}`) },
      server: { middlewareMode: true, hmr: { server }, watch: { ignored: ["**/dist/**"] } },
    });
    server.on("request", vite.middlewares);
    const reloadModule = async (url, dependencies = []) => {
      const timestamp = Date.now();
      for (const path of [...dependencies, url]) {
        const module = await vite.moduleGraph.getModuleByUrl(path);
        if (!module) throw new Error(`Browser fixture has not loaded ${path}`);
        vite.moduleGraph.invalidateModule(module);
        module.lastHMRTimestamp = timestamp;
      }
      // Exercise a real module replacement without editing repository files.
      vite.ws.send({ type: "update", updates: [{ type: "js-update", path: url,
        acceptedPath: url, timestamp }] });
      return timestamp;
    };
    return { origin, bridge, close, reloadModule, cacheDir };
  } catch (error) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Editor fixture startup failed"); }
    throw error;
  }
}
