import fs from "node:fs";
import path from "node:path";
import { DSH_CONNECTOR_DIRNAME, DSH_CONNECTOR_RESOURCE_DIRNAME, CONNECTOR_REQUIRED_ENTRIES, isDirectory, readText, defaultResourcesPath } from "./dsh-connector-common.js";

/** A directory that looks like a complete connector build. */
export function isConnectorDir(dir, { fs: fsImpl = fs } = {}) {
  if (typeof dir !== "string" || !dir.trim()) return false;
  if (!isDirectory(fsImpl, dir)) return false;
  return CONNECTOR_REQUIRED_ENTRIES.every((entry) =>
    fsImpl.existsSync(path.join(dir, entry)),
  );
}

/**
 * The connector prebuilt into the app resources at packaging time, or null.
 * Explicit argument first (tests, a launcher that knows better), then the
 * Electron resources directory this module is running from.
 */
export function resolvePrebuiltConnectorDir({
  prebuiltConnectorDir,
  resourcesPath,
  fs: fsImpl = fs,
} = {}) {
  const candidates = [];
  if (typeof prebuiltConnectorDir === "string" && prebuiltConnectorDir.trim()) {
    candidates.push(path.resolve(prebuiltConnectorDir));
  }
  for (const resources of [resourcesPath, defaultResourcesPath()]) {
    if (typeof resources === "string" && resources.trim()) {
      const root = path.resolve(resources);
      // The shipped layout: `Contents/Resources/connector/voo` (nested so the
      // connector's own node_modules survives electron-builder's copy).
      candidates.push(
        path.join(root, DSH_CONNECTOR_RESOURCE_DIRNAME, DSH_CONNECTOR_DIRNAME),
      );
      // Tolerate a flat `Contents/Resources/connector` layout too.
      candidates.push(path.join(root, DSH_CONNECTOR_RESOURCE_DIRNAME));
    }
  }
  for (const candidate of candidates) {
    if (isConnectorDir(candidate, { fs: fsImpl })) return candidate;
  }
  return null;
}

/** Copies a real directory tree. `fs.cp` cannot read an asar source; real ones are fine. */
export function copyConnectorTree(fsImpl, source, destination) {
  if (typeof fsImpl.cpSync === "function") {
    fsImpl.cpSync(source, destination, { recursive: true });
    return;
  }
  fsImpl.mkdirSync(destination, { recursive: true });
  for (const entry of fsImpl.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyConnectorTree(fsImpl, from, to);
    } else if (typeof entry.isSymbolicLink === "function" && entry.isSymbolicLink()) {
      fsImpl.symlinkSync(fsImpl.readlinkSync(from), to);
    } else {
      fsImpl.copyFileSync(from, to);
    }
  }
}

/**
 * Directories a connector `cordis.patch.yml` has baked in. The builder renders
 * absolute paths (`cwd` and the MCP server entry) so the linked plugin works
 * from any directory; a prebuilt connector must have them rewritten to wherever
 * it is installed.
 */
export function connectorPatchDirs(patch) {
  const dirs = [];
  const add = (value) => {
    const dir = typeof value === "string" ? value.trim() : "";
    if (dir && !dirs.includes(dir)) dirs.push(dir);
  };
  for (const line of String(patch ?? "").split(/\r?\n/)) {
    const scalar = /^\s*cwd:\s*("(?:[^"\\]|\\.)*"|[^#]+?)\s*$/.exec(line);
    if (scalar) {
      const raw = scalar[1].trim();
      try {
        add(raw.startsWith('"') ? JSON.parse(raw) : raw);
      } catch {
        add(raw);
      }
    }
    const entry = /^\s*-\s*("(?:[^"\\]|\\.)*")\s*$/.exec(line);
    if (entry) {
      let parsed = null;
      try {
        parsed = JSON.parse(entry[1]);
      } catch {
        parsed = null;
      }
      if (typeof parsed === "string" && /scripts[\\/]mcp-server\.mjs$/.test(parsed)) {
        // `<dir>/scripts/mcp-server.mjs` — the connector root is two levels up.
        add(path.dirname(path.dirname(parsed)));
      }
    }
  }
  if (dirs.length === 0) {
    const loose = /(?:[A-Za-z]:)?[^\s"']*[\\/]scripts[\\/]mcp-server\.mjs/.exec(
      String(patch ?? ""),
    );
    if (loose) add(path.dirname(path.dirname(loose[0])));
  }
  return dirs;
}

/**
 * Rewrites the install destination baked into a prebuilt `cordis.patch.yml` so
 * the copied connector points at its own folder. Throws rather than leaving a
 * patch that points at the build machine.
 */
export function rewriteConnectorPatch({ connectorPath, bakedDirs, fs: fsImpl = fs } = {}) {
  const patchPath = path.join(connectorPath, "cordis.patch.yml");
  const patch = readText(fsImpl, patchPath);
  if (patch == null) {
    throw new Error(`connector patch is missing: ${patchPath}`);
  }
  const dirs = (
    Array.isArray(bakedDirs) && bakedDirs.length ? bakedDirs : connectorPatchDirs(patch)
  )
    .filter((dir) => typeof dir === "string" && dir.trim())
    .map((dir) => dir.trim());
  if (dirs.length === 0) {
    throw new Error(`cannot find the baked install path in ${patchPath}`);
  }
  let next = patch;
  for (const dir of dirs) {
    if (dir === connectorPath) continue;
    next = next.split(dir).join(connectorPath);
  }
  if (!next.includes(connectorPath)) {
    throw new Error(`connector patch could not be rewritten: ${patchPath}`);
  }
  if (next !== patch) fsImpl.writeFileSync(patchPath, next);
  return { patchPath, bakedDirs: dirs, rewritten: next !== patch };
}
