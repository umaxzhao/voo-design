import path from "node:path";
import { fileURLToPath } from "node:url";

/** `plugins/voo-editor-panel/lib` → `plugins/voo-editor-panel`. */
export const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The loopback port the built editor is served on. */
export const DEFAULT_EDITOR_PORT = 4173;
/** The VOO CLI bridge port (`CLI_BRIDGE_DEFAULT_PORT` in the VOO repository). */
export const DEFAULT_BRIDGE_PORT = 4179;

function positivePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

/** A configured path, or `undefined` when the row left it blank. */
function configuredPath(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Normalise the bundle row's config into the values the Host half uses.
 *
 * Defaults target a checkout of the VOO repository with the bundle linked from
 * `plugins/voo-editor-panel`: the editor build is `<repo>/dist` and the local
 * bridge lives at `<repo>/electron/cli_bridge_server.js`.
 *
 * @param {object} [config] the loader row's config.
 * @returns {{host: string, port: number, bridgePort: number, editorDir: string, repoDir: string, bridge: boolean}}
 */
export function resolveEditorPanelOptions(config = {}) {
  // A blank row value means "use the default", so it must not shadow the env override.
  const repoSetting = configuredPath(config.repoDir) ?? configuredPath(process.env.VOO_EDITOR_PANEL_REPO);
  const repoDir = path.resolve(repoSetting ?? path.resolve(PACKAGE_DIR, "..", ".."));
  const editorSetting = configuredPath(config.editorDir) ?? configuredPath(process.env.VOO_EDITOR_PANEL_DIR);
  const editorDir = path.resolve(editorSetting ?? path.join(repoDir, "dist"));
  return {
    host: "127.0.0.1",
    port: positivePort(config.port, DEFAULT_EDITOR_PORT),
    bridgePort: positivePort(config.bridgePort, DEFAULT_BRIDGE_PORT),
    editorDir,
    repoDir,
    bridge: config.bridge !== false,
  };
}
