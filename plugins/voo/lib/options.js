import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `plugins/voo/lib` → `plugins/voo`. */
export const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The loopback port the built editor is served on. */
export const DEFAULT_EDITOR_PORT = 4173;
/** The VOO CLI bridge port (`CLI_BRIDGE_DEFAULT_PORT` in the VOO repository). */
export const DEFAULT_BRIDGE_PORT = 4179;
/**
 * Upstream used when no local build exists: the server proxies the hosted
 * editor through the loopback origin, so the page can still link to the bridge.
 */
export const DEFAULT_EDITOR_URL = "https://voo.run/editor/";
/**
 * Where the panel's editor comes from:
 * - `hosted` (default): the web version at `editorUrl`, proxied through the
 *   loopback origin so the page can link to the bridge. Always the latest build.
 * - `local`: a local `dist/` build must exist — for previewing local changes.
 * - `auto`: local build when present, otherwise the hosted web version.
 */
export const DEFAULT_EDITOR_SOURCE = "hosted";
const EDITOR_SOURCES = new Set(["hosted", "local", "auto"]);

function positivePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

/** A configured path, or `undefined` when the row left it blank. */
function configuredPath(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Find an editor build by walking up from this package: the linked
 * `plugins/voo` resolves `<repo>/dist`, and a connector built by
 * `scripts/build-agent-plugin.mjs` resolves nothing unless a build sits next
 * to it.
 *
 * @returns {string|undefined} the first directory containing `index.html`.
 */
export function discoverEditorBuild() {
  let directory = PACKAGE_DIR;
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(directory, "dist");
    if (isFile(path.join(candidate, "index.html"))) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

/**
 * Normalise the bundle row's config into the values the Host half uses.
 *
 * Defaults target a checkout of the VOO repository with the bundle linked from
 * `plugins/voo`: the editor build is discovered under the checkout `<dist>`,
 * and the local bridge lives at `<repo>/electron/cli_bridge_server.js`.
 *
 * @param {object} [config] the loader row's config.
 * @returns {{host: string, port: number, bridgePort: number, editorDir: string, editorUrl: string|null, source: "hosted"|"local"|"auto", repoDir: string, bridge: boolean}}
 */
export function resolveEditorPanelOptions(config = {}) {
  // A blank row value means "use the default", so it must not shadow the env override.
  const repoSetting = configuredPath(config.repoDir) ?? configuredPath(process.env.VOO_EDITOR_PANEL_REPO);
  const repoDir = path.resolve(repoSetting ?? path.resolve(PACKAGE_DIR, "..", ".."));
  const editorSetting =
    configuredPath(config.editorDir) ??
    configuredPath(process.env.VOO_EDITOR_PANEL_DIR) ??
    (repoSetting === undefined ? discoverEditorBuild() : undefined);
  const editorUrlSetting =
    configuredPath(config.editorUrl) ??
    configuredPath(process.env.VOO_EDITOR_PANEL_URL) ??
    DEFAULT_EDITOR_URL;
  const sourceSetting = configuredPath(config.editorSource) ?? configuredPath(process.env.VOO_EDITOR_PANEL_SOURCE) ?? DEFAULT_EDITOR_SOURCE;
  return {
    host: "127.0.0.1",
    port: positivePort(config.port, DEFAULT_EDITOR_PORT),
    bridgePort: positivePort(config.bridgePort, DEFAULT_BRIDGE_PORT),
    editorDir: path.resolve(editorSetting ?? path.join(repoDir, "dist")),
    editorUrl: editorUrlSetting === "off" ? null : ensureTrailingSlash(editorUrlSetting),
    source: EDITOR_SOURCES.has(sourceSetting) ? sourceSetting : DEFAULT_EDITOR_SOURCE,
    repoDir,
    bridge: config.bridge !== false,
  };
}

/** `https://voo.run/editor` and `https://voo.run/editor/` resolve the same way. */
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
