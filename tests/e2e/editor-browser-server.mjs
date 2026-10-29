import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";

/** Keep the actual listener bound while configuring its bridge and Vite middleware. */
export async function startEditorBrowserServer() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
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
      configFile: fileURLToPath(new URL("../../vite.config.js", import.meta.url)),
      logLevel: "error",
      define: { "import.meta.env.VITE_CLI_BRIDGE_URL": JSON.stringify(`ws://127.0.0.1:${bridge.port}`) },
      server: { middlewareMode: true, hmr: { server }, watch: { ignored: ["**/dist/**"] } },
    });
    server.on("request", vite.middlewares);
    return { origin, bridge, close };
  } catch (error) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Editor fixture startup failed"); }
    throw error;
  }
}
