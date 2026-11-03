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
  const unwrapScalar = (raw) => {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed.slice(1, -1);
      }
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1).replace(/''/g, "'");
    }
    return trimmed;
  };
  for (const line of String(patch ?? "").split(/\r?\n/)) {
    const scalar = /^\s*cwd:\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^#]+?)\s*$/.exec(line);
    if (scalar) {
      add(unwrapScalar(scalar[1]));
    }
    const entry = /^\s*-\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^#]+?)\s*$/.exec(line);
    if (entry) {
      const parsed = unwrapScalar(entry[1]);
      if (typeof parsed === "string" && /scripts[\\/]mcp-server\.mjs$/.test(parsed)) {
        // `<dir>/scripts/mcp-server.mjs` — the connector root is two levels up.
        add(parsed.replace(/[\\/]scripts[\\/]mcp-server\.mjs$/, ""));
      }
    }
  }
  if (dirs.length === 0) {
    const loose = /(?:[A-Za-z]:)?[^\s"']*[\\/]scripts[\\/]mcp-server\.mjs/.exec(
      String(patch ?? ""),
    );
    if (loose) add(loose[0].replace(/[\\/]scripts[\\/]mcp-server\.mjs$/, ""));
  }
  return dirs;
}

/**
 * Rewrites the install destination baked into a prebuilt `cordis.patch.yml` so
 * the copied connector points at its own folder. Throws rather than leaving a
 * patch that points at the build machine.
 */
export function rewriteConnectorPatch({ connectorPath, bakedDirs, fs: fsImpl = fs } = {}) {
  const sep =
    connectorPath.includes("\\") && !connectorPath.includes("/")
      ? "\\"
      : path.sep;
  const patchPath =
    connectorPath.endsWith("\\") || connectorPath.endsWith("/")
      ? `${connectorPath}cordis.patch.yml`
      : `${connectorPath}${sep}cordis.patch.yml`;
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

  const eol = patch.includes("\r\n") ? "\r\n" : "\n";
  const lines = patch.split(/\r?\n/);
  const nextLines = lines.map((line) => {
    let nextLine = line;
    for (const dir of dirs) {
      if (!dir || dir === connectorPath) continue;

      // In single-quoted scalars, single quotes are escaped as ''
      if (/'(?:[^']|'')*'/.test(nextLine)) {
        const sqDir = dir.replace(/'/g, "''");
        const sqTarget = connectorPath.replace(/'/g, "''");
        if (sqDir !== sqTarget && nextLine.includes(sqDir)) {
          nextLine = nextLine.split(sqDir).join(sqTarget);
        }
        const sqSlashDir = dir.split("\\").join("/").replace(/'/g, "''");
        const sqSlashTarget = connectorPath.split("\\").join("/").replace(/'/g, "''");
        if (sqSlashDir !== sqSlashTarget && nextLine.includes(sqSlashDir)) {
          nextLine = nextLine.split(sqSlashDir).join(sqSlashTarget);
        }
      }

      // In YAML double-quoted scalars, backslashes are escaped as "\\"
      if (/"(?:[^"\\]|\\.)*"/.test(nextLine)) {
        if (dir.includes("\\")) {
          const escDir = dir.split("\\").join("\\\\");
          const escTarget = connectorPath.split("\\").join("\\\\");
          if (escDir !== escTarget && nextLine.includes(escDir)) {
            nextLine = nextLine.split(escDir).join(escTarget);
          }
        }
        const slashDir = dir.split("\\").join("/");
        const slashTarget = connectorPath.split("\\").join("/");
        if (slashDir !== slashTarget && nextLine.includes(slashDir)) {
          nextLine = nextLine.split(slashDir).join(slashTarget);
        }
      }

      // Unquoted / general replacement fallback
      if (nextLine.includes(dir)) {
        nextLine = nextLine.split(dir).join(connectorPath);
      }
      const slashDir = dir.split("\\").join("/");
      const slashTarget = connectorPath.split("\\").join("/");
      if (slashDir !== slashTarget && nextLine.includes(slashDir)) {
        nextLine = nextLine.split(slashDir).join(slashTarget);
      }
    }
    return nextLine;
  });

  const next = nextLines.join(eol);
  const isPresent =
    next.includes(connectorPath) ||
    (connectorPath.includes("\\") &&
      next.includes(connectorPath.split("\\").join("\\\\"))) ||
    (connectorPath.includes("'") &&
      next.includes(connectorPath.replace(/'/g, "''"))) ||
    next.includes(connectorPath.split("\\").join("/"));
  if (!isPresent) {
    throw new Error(`connector patch could not be rewritten: ${patchPath}`);
  }
  if (next !== patch) fsImpl.writeFileSync(patchPath, next);
  return { patchPath, bakedDirs: dirs, rewritten: next !== patch };
}
