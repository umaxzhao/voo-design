import os from "node:os";
import path from "node:path";

/** Package name the connector is installed under in a DSH profile. */
export const DSH_CONNECTOR_PACKAGE = "voo";

/** Folder of the built connector inside `<userData>/connectors`. */
export const DSH_CONNECTOR_DIRNAME = "voo";

/**
 * Folder the packaged app ships a prebuilt connector in
 * (`build.extraResources`: `build/connector` → `Contents/Resources/connector`).
 *
 * A packaged app cannot build the connector at install time: the builder lives
 * inside the asar archive, `fs.cp` cannot copy a directory out of an asar
 * (ENOENT), and the packaged file list does not carry the tool catalog's
 * `src/canvas` chain (the dynamic import fails with ERR_MODULE_NOT_FOUND).
 * Building it once at packaging time and copying the real folder keeps the
 * one-click install working in the asar build.
 *
 * The connector sits one level deeper, `connector/voo`, because electron-builder
 * drops the top-level `node_modules` of a copied tree while keeping a nested
 * one, and the connector needs its own `node_modules/ws`.
 */
export const DSH_CONNECTOR_RESOURCE_DIRNAME = "connector";

/** Everything a runnable connector directory must contain. */
export const CONNECTOR_REQUIRED_ENTRIES = [
  "package.json",
  "cordis.patch.yml",
  path.join("scripts", "mcp-server.mjs"),
  path.join("node_modules", "ws", "package.json"),
];

/** Profile the desktop app boots when no profile is named. */
export const DSH_DEFAULT_PROFILE = "desktop";

/** How long `dsh plugin add` may run before the child is killed. */
export const DSH_INSTALL_TIMEOUT_MS = 120000;

/** The harness application's product name, on every platform. */
export const DSH_APP_NAME = "DeepSeek Harness";

/** Marks a cordis.patch.yml layer that mounts the VOO MCP server. */
export const CONNECTOR_PATCH_RE =
  /mcp-voo\b|serverName:\s*["']?voo\b/;


export const DSH_APP_PATH_ENV = "DSH_APP_PATH";


export function envOf(env) {
  return env && typeof env === "object" ? env : process.env;
}


export function homeOf(home, env) {
  const envObject = envOf(env);
  return (
    home ||
    envObject.HOME ||
    envObject.USERPROFILE ||
    os.homedir()
  );
}


export function isFile(fsImpl, target) {
  try {
    return fsImpl.statSync(target).isFile();
  } catch {
    return false;
  }
}


export function isDirectory(fsImpl, target) {
  try {
    return fsImpl.statSync(target).isDirectory();
  } catch {
    return false;
  }
}


export function readText(fsImpl, target) {
  try {
    return String(fsImpl.readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}


export function errorMessage(error) {
  return String(error?.message ?? error ?? "");
}

/** `process.resourcesPath` in Electron main; null in plain Node and tests. */
export function defaultResourcesPath() {
  try {
    const fromProcess = process.resourcesPath;
    return typeof fromProcess === "string" && fromProcess ? fromProcess : null;
  } catch {
    return null;
  }
}

/** The profile a one-click install targets: desktop, else the only one. */
export function pickTargetProfile(profiles, requested) {
  if (typeof requested === "string" && requested.trim()) return requested.trim();
  const names = profiles.map((profile) => profile.name);
  if (names.includes(DSH_DEFAULT_PROFILE)) return DSH_DEFAULT_PROFILE;
  if (names.length === 1) return names[0];
  return DSH_DEFAULT_PROFILE;
}

/**
 * The command a user can paste into a terminal.
 *
 * `--profile` sits before the forwarded pnpm args because that is the only
 * position the dsh parser accepts (`dsh plugin --profile <name> <pnpm-args...>`);
 * after the positionals it is no longer parsed. The link spec is quoted as one
 * shell word because the connector path usually contains a space.
 */
export function dshInstallCommand(connectorDir, targetProfile) {
  return `dsh plugin --profile ${targetProfile} add "link:${connectorDir}"`;
}
