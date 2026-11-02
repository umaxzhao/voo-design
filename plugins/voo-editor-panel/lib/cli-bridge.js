import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The bridge module inside a VOO repository checkout. */
export function bridgeServerPath(repoDir) {
  return path.join(repoDir, "electron", "cli_bridge_server.js");
}

/**
 * Ask the loopback bridge whether it is already serving.
 *
 * @param {{port: number, timeoutMs?: number, fetch?: typeof fetch}} options
 * @returns {Promise<object|null>} the health payload, or `null` when nothing answers.
 */
export async function probeCliBridge(options) {
  const { port, timeoutMs = 800, fetch: fetchImpl = globalThis.fetch } = options;
  if (typeof fetchImpl !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body !== null && typeof body === "object" && body.ok === true ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Keep the VOO CLI bridge available for the panel editor.
 *
 * A bridge started by the VOO desktop app (or by `npm run bridge`) is reused;
 * otherwise the repository's bridge module starts inside this Host process, so
 * the panel editor links to the same canvas the agent's VOO tools drive. A
 * missing repository checkout is not an error: the editor still runs, only
 * without the canvas link.
 *
 * @param {{repoDir: string, port: number, logger?: Console}} options
 * @returns {Promise<{started: boolean, port: number, close: () => Promise<void>}>}
 */
export async function ensureCliBridge(options) {
  const { repoDir, port, logger = console } = options;
  const existing = await probeCliBridge({ port });
  if (existing !== null) {
    logger.info?.(`[voo-editor-panel] reusing the VOO bridge already listening on 127.0.0.1:${port}`);
    return { started: false, port, close: async () => {} };
  }

  const entry = bridgeServerPath(repoDir);
  if (!fs.existsSync(entry)) {
    logger.warn?.(`[voo-editor-panel] no VOO bridge at ${entry}; the editor panel runs without a canvas link.`);
    return { started: false, port, close: async () => {} };
  }

  const module = await import(pathToFileURL(entry).href);
  if (typeof module.startCliBridgeServer !== "function") {
    throw new Error(`VOO bridge module at ${entry} does not export startCliBridgeServer`);
  }
  const bridge = await module.startCliBridgeServer({ port });
  logger.info?.(`[voo-editor-panel] started the VOO bridge on ws://127.0.0.1:${bridge.port}`);
  return {
    started: true,
    port: bridge.port,
    close: async () => {
      await bridge.close();
    },
  };
}
