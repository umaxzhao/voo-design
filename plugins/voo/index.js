import { resolveEditorPanelOptions } from "./lib/options.js";
import { startEditorServer } from "./lib/editor-server.js";
import { ensureCliBridge } from "./lib/cli-bridge.js";

/**
 * Host half of the VOO editor panel.
 *
 * Serves the built VOO editor on `http://127.0.0.1:<port>` for the Client
 * half's iframe, and keeps the VOO CLI bridge available so the editor page
 * links to the same canvas as the VOO tool plugin. Both resources are owned by
 * one plugin effect: unload (or a profile patch removing the row) stops them,
 * and a hook that wants the same routes can replace the row's Config.
 */
export function apply(ctx, config = {}) {
  const options = resolveEditorPanelOptions(config);

  ctx.effect(() => {
    let disposed = false;
    let server;
    let bridge;

    const shutdown = (resource, label) => {
      if (resource === undefined) return;
      Promise.resolve()
        .then(() => resource.close())
        .catch((error) => {
          console.warn(`[voo] ${label} shutdown failed: ${describe(error)}`);
        });
    };

    const boot = async () => {
      try {
        server = await startEditorServer({
          host: options.host,
          port: options.port,
          editorDir: options.editorDir,
          editorUrl: options.editorUrl,
        });
      } catch (error) {
        console.error(
          `[voo] cannot serve the editor on http://${options.host}:${options.port}: ${describe(error)}. ` +
            `Another process may own the port; set "port" in the profile patch.`,
        );
        return;
      }
      if (disposed) {
        shutdown(server, "editor server");
        return;
      }
      const sourceNote =
        server.mode === "local"
          ? server.editorDir
          : server.mode === "proxy"
            ? `proxying ${server.editorUrl}`
            : `no build and no hosted editor (${server.editorDir})`;
      console.info(`[voo] editor served at ${server.url}/?embed (${sourceNote})`);
      if (!options.bridge) return;
      try {
        bridge = await ensureCliBridge({ repoDir: options.repoDir, port: options.bridgePort });
      } catch (error) {
        console.error(`[voo] VOO bridge unavailable: ${describe(error)}`);
        return;
      }
      if (disposed) shutdown(bridge, "VOO bridge");
    };

    void boot();

    return () => {
      disposed = true;
      shutdown(server, "editor server");
      shutdown(bridge, "VOO bridge");
    };
  }, "voo: loopback editor host");
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
