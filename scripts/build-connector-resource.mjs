/**
 * Builds the VOO connector once, at packaging time, into `build/connector/voo`.
 *
 * Why prebuild at all: a packaged app cannot build the connector at install
 * time. The builder lives inside the asar archive, `fs.cp` cannot copy a
 * directory out of an asar (ENOENT), and the packaged file list does not carry
 * the tool catalog's `src/canvas` chain (the dynamic import fails with
 * ERR_MODULE_NOT_FOUND). Measured on Electron 43; see `.voo-dsh/` in the
 * round's workspace for the probe.
 *
 * Why the extra `voo` level: electron-builder always drops the top-level
 * `node_modules` of a copied tree (app-builder-lib `util/filter.js`:
 * `if (relative === "node_modules") return false`), but keeps a nested
 * `…/node_modules`. The connector needs its own `node_modules/ws`, so it ships
 * as `<resource dir>/voo` and lands in `Contents/Resources/connector/voo`.
 *
 * electron-builder copies this tree to `Contents/Resources/connector`
 * (see the `extraResources` entry in `package.json`), and
 * `electron/dsh_connector.js` copies `connector/voo` into
 * `<userData>/connectors/voo`, rewriting the install destination baked into
 * `cordis.patch.yml`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortableConnector } from "./build-agent-plugin.mjs";

/** Folder (relative to the repository root) electron-builder ships as a resource. */
export const CONNECTOR_RESOURCE_DIR = "build/connector";

/** Folder name of the connector itself inside that resource tree. */
export const CONNECTOR_RESOURCE_INSTALL_DIRNAME = "voo";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Rebuilds the connector into `destination` (default `build/connector/voo`).
 * The builder refuses an existing destination, so the whole resource tree is
 * replaced first.
 */
export async function buildConnectorResource({
  repoRoot = defaultRoot,
  destination = path.join(
    repoRoot,
    CONNECTOR_RESOURCE_DIR,
    CONNECTOR_RESOURCE_INSTALL_DIRNAME,
  ),
} = {}) {
  const target = path.resolve(destination);
  // Replace the whole resource tree, not just `target`, so a stale flat layout
  // cannot sit next to the nested one.
  fs.rmSync(path.dirname(target), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = await buildPortableConnector({ root: repoRoot, destination: target });
  return { ...result, resourceDir: target };
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entrypoint && entrypoint === fileURLToPath(import.meta.url)) {
  try {
    const { resourceDir } = await buildConnectorResource();
    process.stdout.write(`Prebuilt connector resource: ${resourceDir}\n`);
  } catch (error) {
    process.stderr.write(
      `[voo-design] Prebuilt connector failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
