/**
 * DRAFT — tests/unit/dsh_connector_packaged.test.js (task-7 fallback).
 * Covers the packaged-app install path: a prebuilt connector shipped in the
 * app resources is copied to `<userData>/connectors/voo` and its baked
 * `cordis.patch.yml` paths are rewritten, so the asar build never has to run
 * the builder or `fs.cp` out of the archive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  connectorPatchDirs,
  installDshConnector,
  resolvePrebuiltConnectorDir,
  rewriteConnectorPatch,
} from "../../electron/dsh_connector.js";

let tempRoot;
let homeDir;
let userDataDir;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "voo-dsh-packaged-"));
  homeDir = path.join(tempRoot, "home");
  userDataDir = path.join(tempRoot, "home", "Library", "Application Support", "VOO Design");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function connectorDirOf() {
  return path.join(userDataDir, "connectors", "voo");
}

function installCommandOf(profile = "desktop") {
  return `dsh plugin --profile ${profile} add "link:${connectorDirOf()}"`;
}

/** The `cordis.patch.yml` the builder renders, with absolute paths baked in. */
function renderPatch(dir) {
  return [
    "- insert:",
    "    - id: mcp-voo",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        serverName: voo",
    "        transport: stdio",
    "        command: node",
    "        args:",
    `          - ${JSON.stringify(path.join(dir, "scripts", "mcp-server.mjs"))}`,
    `        cwd: ${JSON.stringify(dir)}`,
    "        toolCallTimeoutMs: 65000",
    "        failOnStartupError: false",
    "",
  ].join("\n");
}

/**
 * A connector as electron-builder ships it: `Contents/Resources/connector/voo`
 * (nested one level so its own `node_modules` survives the copy).
 */
function makePrebuiltConnector({ bakedDir } = {}) {
  const resourceRoot = path.join(tempRoot, "Resources");
  const connector = path.join(resourceRoot, "connector", "voo");
  fs.mkdirSync(path.join(connector, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(connector, "node_modules", "ws"), { recursive: true });
  fs.writeFileSync(path.join(connector, "package.json"), JSON.stringify({ name: "voo", version: "1.0.0" }));
  fs.writeFileSync(path.join(connector, "node_modules", "ws", "package.json"), JSON.stringify({ name: "ws", version: "8.22.0" }));
  fs.writeFileSync(path.join(connector, "scripts", "mcp-server.mjs"), "export {};\n");
  const baked = bakedDir ?? path.join(tempRoot, "build", "connector");
  fs.writeFileSync(path.join(connector, "cordis.patch.yml"), renderPatch(baked));
  return { resourceRoot, connector, baked };
}

const fakeExec = () => vi.fn(async () => ({ code: 0, stdout: "added 1 package", stderr: "" }));

describe("resolvePrebuiltConnectorDir", () => {
  it("finds the connector under the app resources", () => {
    const { resourceRoot, connector } = makePrebuiltConnector();
    expect(resolvePrebuiltConnectorDir({ resourcesPath: resourceRoot })).toBe(connector);
  });

  it("accepts an explicit directory", () => {
    const { connector } = makePrebuiltConnector();
    expect(resolvePrebuiltConnectorDir({ prebuiltConnectorDir: connector })).toBe(connector);
  });

  it("rejects an incomplete directory", () => {
    const resourceRoot = path.join(tempRoot, "Resources");
    fs.mkdirSync(path.join(resourceRoot, "connector", "voo"), { recursive: true });
    expect(resolvePrebuiltConnectorDir({ resourcesPath: resourceRoot })).toBeNull();
  });

  it("does not mistake the resource folder itself for the connector", () => {
    const { resourceRoot, connector } = makePrebuiltConnector();
    expect(resolvePrebuiltConnectorDir({ resourcesPath: resourceRoot })).toBe(connector);
    expect(resolvePrebuiltConnectorDir({ resourcesPath: resourceRoot })).not.toBe(
      path.join(resourceRoot, "connector"),
    );
  });

  it("returns null when the app has no bundled connector (dev run)", () => {
    const resourceRoot = path.join(tempRoot, "Resources");
    fs.mkdirSync(resourceRoot, { recursive: true });
    expect(resolvePrebuiltConnectorDir({ resourcesPath: resourceRoot })).toBeNull();
    expect(resolvePrebuiltConnectorDir({})).toBeNull();
  });
});

describe("connectorPatchDirs / rewriteConnectorPatch", () => {
  it("reads the baked directories out of the patch", () => {
    const baked = "/Users/someone/VOO Design/build/connector";
    expect(connectorPatchDirs(renderPatch(baked))).toEqual([baked]);
  });

  it("rewrites the baked paths to the install directory", () => {
    const { connector, baked } = makePrebuiltConnector();
    const patchPath = path.join(connector, "cordis.patch.yml");
    expect(fs.readFileSync(patchPath, "utf8")).toContain(baked);

    const result = rewriteConnectorPatch({ connectorPath: connector });

    expect(result.rewritten).toBe(true);
    const next = fs.readFileSync(patchPath, "utf8");
    expect(next).not.toContain(baked);
    expect(next).toContain(connector);
    // The install destination usually contains a space; it must stay one YAML word.
    expect(next).toContain(JSON.stringify(path.join(connector, "scripts", "mcp-server.mjs")));

    // A second pass is a no-op, so a retried install cannot corrupt the patch.
    const again = rewriteConnectorPatch({ connectorPath: connector });
    expect(again.rewritten).toBe(false);
  });

  it("refuses a patch without a discoverable path", () => {
    const dir = path.join(tempRoot, "broken");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "cordis.patch.yml"), "- insert:\n    - id: nothing\n");
    expect(() => rewriteConnectorPatch({ connectorPath: dir })).toThrow(/baked install path/);
  });

  describe("WIN-YAML-01: virtual filesystem contract for Windows and escaped paths", () => {
    // Virtual in-memory filesystem helper — explicitly labeled as a virtual FS contract,
    // not native Windows I/O.
    function createVirtualFs(filePath, initialContent) {
      const storage = { [filePath]: initialContent };
      return {
        files: storage,
        readFileSync(target) {
          if (storage[target] != null) return storage[target];
          const backslashPath = target.replace(/\//g, "\\");
          if (storage[backslashPath] != null) return storage[backslashPath];
          const slashPath = target.replace(/\\/g, "/");
          if (storage[slashPath] != null) return storage[slashPath];
          const err = new Error(`ENOENT: no such file or directory, open '${target}'`);
          err.code = "ENOENT";
          throw err;
        },
        writeFileSync(target, content) {
          storage[target] = String(content);
        },
      };
    }

    // Parses a YAML scalar value to verify true syntax validity, not just raw substring presence
    function parseYamlScalar(line) {
      let val = line.trim();
      if (val.startsWith("- ")) val = val.slice(2).trim();
      else if (val.includes(":")) val = val.replace(/^[^:]+:\s*/, "").trim();
      if (val.startsWith('"')) return JSON.parse(val);
      if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
      return val;
    }

    it("rewrites Windows paths with JSON double-quotes, escaped backslashes and spaces, with idempotency", () => {
      const bakedWin = "C:\\Program Files\\Build Machine\\VOO Design\\connector";
      const installWin = "C:\\Users\\Jane Doe\\AppData\\Roaming\\VOO Design\\connectors\\voo";
      const patchWinDouble = [
        "- insert:",
        "    - id: mcp-voo",
        "      name: \"@deepseek-ai/dsh-mcp-client\"",
        "      config:",
        "        serverName: voo",
        "        transport: stdio",
        "        command: node",
        "        args:",
        `          - ${JSON.stringify(bakedWin + "\\scripts\\mcp-server.mjs")}`,
        `        cwd: ${JSON.stringify(bakedWin)}`,
        "        toolCallTimeoutMs: 65000",
        "        failOnStartupError: false",
        "",
      ].join("\n");

      const patchFile = installWin + "\\cordis.patch.yml";
      const vfs = createVirtualFs(patchFile, patchWinDouble);

      // 1. Rewrite execution
      const result = rewriteConnectorPatch({
        connectorPath: installWin,
        fs: vfs,
      });
      expect(result.rewritten).toBe(true);

      // 2. Structural & syntactic validation (not just string inclusion)
      const writtenContent = vfs.files[patchFile];
      expect(writtenContent).not.toContain(bakedWin);

      const cwdLine = writtenContent.split("\n").find((l) => l.includes("cwd:"));
      expect(cwdLine).toBeDefined();
      const parsedCwd = parseYamlScalar(cwdLine);
      expect(parsedCwd).toBe(installWin);

      const argsLine = writtenContent.split("\n").find((l) => l.includes("- \"C:"));
      expect(argsLine).toBeDefined();
      const parsedArgs = parseYamlScalar(argsLine);
      expect(parsedArgs).toBe(installWin + "\\scripts\\mcp-server.mjs");

      // Verify valid YAML double-quote escape syntax: backslashes must be doubled
      expect(writtenContent).toContain(`cwd: ${JSON.stringify(installWin)}`);
      expect(writtenContent).toContain(
        JSON.stringify(installWin + "\\scripts\\mcp-server.mjs"),
      );

      // 3. Idempotency: a second run does not change results
      const secondRun = rewriteConnectorPatch({
        connectorPath: installWin,
        fs: vfs,
      });
      expect(secondRun.rewritten).toBe(false);
      expect(vfs.files[patchFile]).toBe(writtenContent);
    });

    it("rewrites Windows paths using forward-slash formatting and spaces", () => {
      const bakedSlash = "C:/Program Files/Build Machine/VOO Design/connector";
      const installSlash = "C:/Users/Jane Doe/AppData/Roaming/VOO Design/connectors/voo";
      const patchSlash = [
        "- insert:",
        "    - id: mcp-voo",
        "      config:",
        "        args:",
        `          - "${bakedSlash}/scripts/mcp-server.mjs"`,
        `        cwd: "${bakedSlash}"`,
        "",
      ].join("\n");

      const patchFile = installSlash + "/cordis.patch.yml";
      const vfs = createVirtualFs(patchFile, patchSlash);

      const result = rewriteConnectorPatch({
        connectorPath: installSlash,
        fs: vfs,
      });
      expect(result.rewritten).toBe(true);

      const written = vfs.files[patchFile];
      const cwdLine = written.split("\n").find((l) => l.includes("cwd:"));
      expect(parseYamlScalar(cwdLine)).toBe(installSlash);
    });

    it("rewrites Windows paths using single-quoted formatting", () => {
      const bakedWin = "C:\\Program Files\\Build Machine\\VOO Design\\connector";
      const installWin = "C:\\Users\\Jane Doe\\AppData\\Roaming\\VOO Design\\connectors\\voo";
      const patchSingle = [
        "- insert:",
        "    - id: mcp-voo",
        "      config:",
        "        args:",
        `          - '${bakedWin}\\scripts\\mcp-server.mjs'`,
        `        cwd: '${bakedWin}'`,
        "",
      ].join("\n");

      const patchFile = installWin + "\\cordis.patch.yml";
      const vfs = createVirtualFs(patchFile, patchSingle);

      const result = rewriteConnectorPatch({
        connectorPath: installWin,
        fs: vfs,
      });
      expect(result.rewritten).toBe(true);

      const written = vfs.files[patchFile];
      const cwdLine = written.split("\n").find((l) => l.includes("cwd:"));
      expect(parseYamlScalar(cwdLine)).toBe(installWin);
    });

    it("handles non-Windows POSIX paths as a baseline control case", () => {
      const bakedPosix = "/opt/voo-build/connector";
      const installPosix = "/home/jane/.config/voo/connectors/voo";
      const patchPosix = [
        "- insert:",
        "    - id: mcp-voo",
        "      config:",
        "        args:",
        `          - "${bakedPosix}/scripts/mcp-server.mjs"`,
        `        cwd: "${bakedPosix}"`,
        "",
      ].join("\n");

      const patchFile = installPosix + "/cordis.patch.yml";
      const vfs = createVirtualFs(patchFile, patchPosix);

      const result = rewriteConnectorPatch({
        connectorPath: installPosix,
        fs: vfs,
      });
      expect(result.rewritten).toBe(true);

      const written = vfs.files[patchFile];
      const cwdLine = written.split("\n").find((l) => l.includes("cwd:"));
      expect(parseYamlScalar(cwdLine)).toBe(installPosix);
    });

    it("demonstrates the failure mode before the fix on Windows escaped backslash paths", () => {
      // Demonstrates why next.split(dir).join(connectorPath) fails:
      // In YAML double-quoted scalars, dir contains double-escaped backslashes ("C:\\\\path").
      // When dir is parsed as a normal string, it contains single backslashes ("C:\\path").
      // A naive split(dir) finds 0 matches in next.
      const bakedWin = "C:\\baked\\connector";
      const patchContent = `cwd: ${JSON.stringify(bakedWin)}`;
      // patchContent is: cwd: "C:\\baked\\connector" (literal double backslashes)
      // bakedWin has single backslashes in memory
      const naiveSplitMatches = patchContent.split(bakedWin);
      expect(naiveSplitMatches.length).toBe(1); // 0 replacements performed!
    });
  });
});

describe("installDshConnector (packaged app)", () => {
  it("copies the prebuilt connector and rewrites its patch", async () => {
    const { resourceRoot, baked } = makePrebuiltConnector();
    const exec = fakeExec();
    // A packaged app's repoRoot is app.asar: the builder cannot be imported
    // from it, so success here proves the prebuilt path was used.
    const asarLikeRoot = path.join(tempRoot, "VOO Design.app", "Contents", "Resources", "app.asar");
    fs.mkdirSync(asarLikeRoot, { recursive: true });

    const result = await installDshConnector({
      repoRoot: asarLikeRoot,
      resourcesPath: resourceRoot,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec,
      findBinary: () => "/fake/bin/dsh",
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("resource");
    expect(result.connectorPath).toBe(connectorDirOf());
    expect(result.command).toBe(installCommandOf());

    for (const entry of ["package.json", "cordis.patch.yml", "scripts/mcp-server.mjs", "node_modules/ws/package.json"]) {
      expect(fs.existsSync(path.join(connectorDirOf(), entry))).toBe(true);
    }
    const patch = fs.readFileSync(path.join(connectorDirOf(), "cordis.patch.yml"), "utf8");
    expect(patch).not.toContain(baked);
    expect(patch).toContain(connectorDirOf());

    expect(exec).toHaveBeenCalledTimes(1);
    const [bin, args] = exec.mock.calls[0];
    expect(bin).toBe("/fake/bin/dsh");
    expect(args).toEqual(["plugin", "--profile", "desktop", "add", `link:${connectorDirOf()}`]);
  });

  it("replaces a stale connector directory", async () => {
    const { resourceRoot } = makePrebuiltConnector();
    fs.mkdirSync(connectorDirOf(), { recursive: true });
    fs.writeFileSync(path.join(connectorDirOf(), "stale.txt"), "old");

    const result = await installDshConnector({
      repoRoot: path.join(tempRoot, "missing-repo"),
      resourcesPath: resourceRoot,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: fakeExec(),
      findBinary: () => "/fake/bin/dsh",
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(connectorDirOf(), "stale.txt"))).toBe(false);
  });

  it("falls back to the repository builder when no resource is bundled", async () => {
    const result = await installDshConnector({
      repoRoot: path.join(tempRoot, "missing-repo"),
      resourcesPath: path.join(tempRoot, "Resources"),
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: fakeExec(),
      findBinary: () => "/fake/bin/dsh",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("connectorBuildUnavailable");
  });

  it("reports a broken prebuilt connector instead of silently installing it", async () => {
    const resourceRoot = path.join(tempRoot, "Resources");
    const connector = path.join(resourceRoot, "connector", "voo");
    fs.mkdirSync(path.join(connector, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(connector, "package.json"), JSON.stringify({ name: "voo" }));
    // Missing cordis.patch.yml and node_modules/ws: not a usable connector.
    const result = await installDshConnector({
      repoRoot: path.join(tempRoot, "missing-repo"),
      resourcesPath: resourceRoot,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: fakeExec(),
      findBinary: () => "/fake/bin/dsh",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("connectorBuildUnavailable");
  });
});
