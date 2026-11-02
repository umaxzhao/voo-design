import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { buildMcpTools } from "../../electron/mcp_server/tool_catalog.js";
import { buildPortableConnector } from "../../scripts/build-agent-plugin.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let fixture;

beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voo-dsh-connector-"));
  const destination = path.join(directory, "voo");
  await buildPortableConnector({ root: repoRoot, destination });
  fixture = { directory, destination };
});

afterAll(async () => {
  await rm(fixture.directory, { recursive: true, force: true });
});

async function discoverTools(destination) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(destination, "scripts/mcp-server.mjs")], {
      cwd: fixture.directory,
      env: { ...process.env, XDG_CONFIG_HOME: path.join(fixture.directory, "empty-config"), VOO_CLI_BRIDGE_TOKEN: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("MCP discovery timed out")); }, 8000);
    child.stderr.on("data", data => { errors += data; });
    child.stdout.on("data", data => { output += data; });
    child.on("error", reject);
    child.on("exit", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(errors));
      else resolve(output.trim().split("\n").map(line => JSON.parse(line)));
    });
    for (const frame of [
      { id: 1, method: "initialize", params: {} },
      { id: 2, method: "tools/list" },
    ]) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...frame }) + "\n");
    child.stdin.end();
  });
}

describe("portable DeepSeek Harness plugin bundle", () => {
  it("declares a DSH bundle with localizable display metadata", async () => {
    const manifest = JSON.parse(await readFile(path.join(fixture.destination, "package.json"), "utf8"));
    expect(manifest.name).toBe("voo");
    expect(manifest.dsh).toEqual({ bundle: { patch: "./cordis.patch.yml" } });
    expect(manifest.exports).toMatchObject({
      "./locale/*.json": "./locale/*.json",
      "./icon": "./icon.png",
      "./lib/model-bridge.js": "./lib/model-bridge.js",
    });
    for (const entry of ["cordis.patch.yml", "locale/*.json", "icon.png", "lib"]) {
      expect(manifest.files).toContain(entry);
    }
    // A configuration-only bundle needs no Host entry point.
    expect(manifest.main).toBeUndefined();
  });

  it("bakes a stdio MCP client row with the built absolute entry path", async () => {
    const patch = await readFile(path.join(fixture.destination, "cordis.patch.yml"), "utf8");
    const serverEntry = path.join(fixture.destination, "scripts/mcp-server.mjs");
    const expectedLines = [
      "- insert:",
      "    - id: mcp-voo",
      "      name: '@deepseek-ai/dsh-mcp-client'",
      "      config:",
      "        serverName: voo",
      "        transport: stdio",
      "        command: node",
      "        args:",
      `          - ${JSON.stringify(serverEntry)}`,
      `        cwd: ${JSON.stringify(fixture.destination)}`,
      "        toolCallTimeoutMs: 65000",
      "        failOnStartupError: false",
      "    - id: voo-model-bridge",
      "      name: './lib/model-bridge.js'",
      "      config:",
      "        port: 4399",
    ];
    expect(patch.trimEnd().split("\n")).toEqual(expectedLines);
    expect(patch).not.toContain("!!js");
    expect(patch).not.toContain("process.env");
    expect(patch).not.toContain("url:");
  });

  it("ships the model bridge module as a patch-relative Host row", async () => {
    const bridge = await readFile(path.join(fixture.destination, "lib/model-bridge.js"), "utf8");
    const source = await readFile(path.join(repoRoot, "plugins/voo-model-bridge/lib/model-bridge.js"), "utf8");
    expect(bridge).toBe(source);
    const library = path.join(fixture.destination, "lib");
    for (const file of await readdir(library)) {
      if (!file.endsWith(".js")) continue;
      const packaged = await readFile(path.join(library, file), "utf8");
      const original = await readFile(path.join(repoRoot, "plugins/voo-model-bridge/lib", file), "utf8");
      expect(packaged).toBe(original);
    }
    const runtime = await import(pathToFileURL(path.join(library, "model-bridge.js")).href);
    expect(runtime.name).toBe("voo-model-bridge");
    expect(typeof runtime.apply).toBe("function");
    // The row name is anchored beside the patch file, so the module stays inside
    // the installed connector folder with no package-subpath resolution needed.
    expect(bridge).not.toContain(repoRoot);
  });

  it("ships English and Chinese titles plus a valid icon below the DSH limit", async () => {
    const english = JSON.parse(await readFile(path.join(fixture.destination, "locale/en.json"), "utf8"));
    const chinese = JSON.parse(await readFile(path.join(fixture.destination, "locale/zh.json"), "utf8"));
    expect(english).toEqual({
      meta: {
        title: "VOO",
        description: "Connect the open VOO canvas to DeepSeek Harness through MCP tools.",
      },
    });
    expect(chinese.meta.title).toBe("VOO");
    expect(chinese.meta.description).toContain("VOO");
    const icon = await readFile(path.join(fixture.destination, "icon.png"));
    expect(icon.subarray(0, pngSignature.length).equals(pngSignature)).toBe(true);
    expect(icon.length).toBeLessThan(256 * 1024);
  });

  it("resolves its exported locale and icon resources through Node's package resolver", async () => {
    const nodeModules = path.join(fixture.directory, "node_modules");
    await mkdir(nodeModules, { recursive: true });
    await symlink(fixture.destination, path.join(nodeModules, "voo"), "dir");
    const consumerRequire = createRequire(path.join(fixture.directory, "consumer.mjs"));
    for (const resource of [
      "voo/locale/en.json",
      "voo/locale/zh.json",
      "voo/icon",
      "voo/package.json",
    ]) {
      const resolved = consumerRequire.resolve(resource);
      expect((await realpath(resolved)).startsWith(await realpath(fixture.destination))).toBe(true);
    }
    expect(consumerRequire.resolve("voo/icon").endsWith("icon.png")).toBe(true);
  });

  it("stays self-contained: the only runtime module is the bundled ws", async () => {
    const modules = await readdir(path.join(fixture.destination, "node_modules"));
    expect(modules).toEqual(["ws"]);
    const manifest = JSON.parse(await readFile(path.join(fixture.destination, "package.json"), "utf8"));
    expect(Object.keys(manifest.dependencies)).toEqual(["ws"]);
    // The MCP entry only references the portable runtime, not the repository.
    const server = await readFile(path.join(fixture.destination, "scripts/mcp-server.mjs"), "utf8");
    expect(server).not.toContain(repoRoot);
  });

  it("still discovers the full VOO tool catalog from the built folder", async () => {
    const frames = await discoverTools(fixture.destination);
    expect(frames.find(frame => frame.id === 1).result.serverInfo.name).toBe("voo");
    const tools = frames.find(frame => frame.id === 2).result.tools;
    const expectedNames = buildMcpTools().map(tool => tool.name).sort();
    expect(tools.map(tool => tool.name).sort()).toEqual(expectedNames);
    expect(new Set(tools.map(tool => tool.name)).size).toBe(expectedNames.length);
    for (const name of ["new_document", "capture_canvas", "voo_status", "build_layout"]) {
      expect(tools.some(tool => tool.name === name)).toBe(true);
    }
  }, 15000);

  it("documents installation, restart, rebuild, and the retained legacy overlay", async () => {
    const readme = await readFile(path.join(fixture.destination, "README.md"), "utf8");
    expect(readme).toContain('dsh plugin --profile desktop add "link:/absolute/new/plugin-folder"');
    expect(readme).toContain("Restart DeepSeek Harness");
    expect(readme).toContain("mcp__voo__*");
    expect(readme).toContain("dsh web --patch");
    expect(readme).toContain("rebuild");
    expect(readme).toContain("http://127.0.0.1:4399/v1");
    expect(readme).toContain("lib/model-bridge.js");
  });
});
