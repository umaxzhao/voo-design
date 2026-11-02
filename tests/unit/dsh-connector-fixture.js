/**
 * DeepSeek Harness detection and one-click installation.
 *
 * The fixture is a throwaway HOME plus a throwaway "Applications" directory:
 * the harness app, every DSH profile and the connector build destination all
 * live inside one temp root, so nothing here reads or writes the developer's
 * real `~/.dsh` or `~/Library/Application Support/VOO*`.
 */

import { afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DSH_CONNECTOR_PACKAGE, readDshStatus } from "../../electron/dsh_connector.js";



export const APP_NAME = "DeepSeek Harness.app";

export let tempRoot;
export let homeDir;
export let userDataDir;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "voo-dsh-detect-"));
  homeDir = path.join(tempRoot, "home");
  userDataDir = path.join(tempRoot, "userData");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

/** A fake "installed" harness app (a directory is enough to detect it). */
export function makeAppPath() {
  const appPath = path.join(tempRoot, "Applications", APP_NAME);
  fs.mkdirSync(path.join(appPath, "Contents", "MacOS"), { recursive: true });
  return appPath;
}

export function profileDir(name) {
  return path.join(homeDir, ".dsh", "profiles", name);
}

export function writeProfile(
  name,
  { packageJson, patch, nodeModulesTarget } = {},
) {
  const dir = profileDir(name);
  fs.mkdirSync(dir, { recursive: true });
  if (packageJson) {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );
  }
  if (patch) fs.writeFileSync(path.join(dir, "cordis.patch.yml"), patch);
  if (nodeModulesTarget) {
    fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    fs.symlinkSync(
      nodeModulesTarget,
      path.join(dir, "node_modules", DSH_CONNECTOR_PACKAGE),
    );
  }
  return dir;
}

export function readStatus(options = {}) {
  return readDshStatus({
    home: homeDir,
    userDataDir,
    platform: "darwin",
    env: { HOME: homeDir, PATH: "" },
    appPaths: [],
    ...options,
  });
}

export function connectorDirOf(userData = userDataDir) {
  return path.join(userData, "connectors", "voo");
}

/** The shell command the UI shows/copies, for a given target profile. */
export function installCommandOf(profile = "desktop", connectorDir = connectorDirOf()) {
  return `dsh plugin --profile ${profile} add "link:${connectorDir}"`;
}

/** A fake repo exposing the `buildPortableConnector` contract. */
export function makeFakeRepo({ throws = false } = {}) {
  const repoDir = path.join(tempRoot, "repo");
  const scriptsDir = path.join(repoDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const body = throws
    ? "export async function buildPortableConnector() { throw new Error('boom'); }\n"
    : [
        'import fs from "node:fs";',
        'import path from "node:path";',
        "export async function buildPortableConnector({ root, destination }) {",
        '  if (!root) throw new Error("missing root");',
        '  if (fs.existsSync(destination)) throw new Error("destination must not exist");',
        '  fs.mkdirSync(destination, { recursive: true });',
        "  fs.writeFileSync(",
        '    path.join(destination, "package.json"),',
        '    JSON.stringify({ name: "voo", version: "1.0.0" }),',
        "  );",
        '  fs.writeFileSync(path.join(destination, "cordis.patch.yml"), "name: mcp-voo\\n");',
        "  return { destination };",
        "}",
        "",
      ].join("\n");
  fs.writeFileSync(path.join(scriptsDir, "build-agent-plugin.mjs"), body);
  return repoDir;
}

