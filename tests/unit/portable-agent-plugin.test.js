import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildPortableConnector } from "../../scripts/build-agent-plugin.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const directories = [];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxIconBytes = 256 * 1024;

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

it("discovers tools from a portable package without a running bridge or repository dependencies", async () => {
  const directory = await temporaryDirectory("voo-portable-plugin-");
  const plugin = path.join(directory, "plugin");
  await promisify(execFile)(process.execPath, ["scripts/build-agent-plugin.mjs", plugin], { cwd: repoRoot });
  const frames = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(plugin, "scripts/mcp-server.mjs")], {
      cwd: directory,
      env: { ...process.env, XDG_CONFIG_HOME: path.join(directory, "empty-config"), VOO_CLI_BRIDGE_TOKEN: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("MCP discovery timed out")); }, 5000);
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
      { id: 3, method: "tools/call", params: { name: "voo_status" } },
    ]) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...frame }) + "\n");
    child.stdin.end();
  });
  expect(frames.find(frame => frame.id === 1).result.serverInfo.name).toBe("voo");
  const tools = frames.find(frame => frame.id === 2).result.tools;
  expect(tools.some(tool => tool.name === "new_document")).toBe(true);
  expect(tools.some(tool => tool.name === "capture_canvas")).toBe(true);
  expect(frames.find(frame => frame.id === 3).result.isError).toBe(true);
}, 10000);

it("builds the portable folder as an installable DeepSeek Harness bundle", async () => {
  const directory = await temporaryDirectory("voo-dsh-bundle-");
  const destination = path.join(directory, "plugin");
  const build = await buildPortableConnector({ root: repoRoot, destination });
  expect(build.destination).toBe(destination);

  const manifest = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
  expect(manifest.name).toBe("voo");
  expect(manifest.version).toBe("1.0.0");
  expect(manifest.private).toBe(true);
  expect(manifest.type).toBe("module");
  expect(manifest.engines.node).toBe(">=18");
  expect(manifest.dependencies.ws).toMatch(/^\d+\.\d+\.\d+/);
  expect(manifest.dsh).toEqual({ bundle: { patch: "./cordis.patch.yml" } });
  expect(manifest.exports["./locale/*.json"]).toBe("./locale/*.json");
  expect(manifest.exports["./icon"]).toBe("./icon.png");
  expect(manifest.exports["./lib/model-bridge.js"]).toBe("./lib/model-bridge.js");
  for (const entry of [
    "cordis.patch.yml",
    "locale/*.json",
    "icon.png",
    "lib",
    ".claude-plugin",
    ".mcp.json",
    "deepseek.cordis.yml",
    "scripts",
    "electron/mcp_server",
    "src/shared",
    "node_modules/ws",
    "README.md",
    "LICENSE",
  ]) expect(manifest.files).toContain(entry);

  const patch = await readFile(path.join(destination, "cordis.patch.yml"), "utf8");
  const serverEntry = path.join(destination, "scripts/mcp-server.mjs");
  expect(path.isAbsolute(serverEntry)).toBe(true);
  expect(patch.startsWith("- insert:\n")).toBe(true);
  for (const line of [
    "    - id: mcp-voo",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "        serverName: voo",
    "        transport: stdio",
    "        command: node",
    `          - ${JSON.stringify(serverEntry)}`,
    `        cwd: ${JSON.stringify(destination)}`,
    "        toolCallTimeoutMs: 65000",
    "        failOnStartupError: false",
    "    - id: voo-model-bridge",
    "      name: './lib/model-bridge.js'",
    "        port: 4399",
  ]) expect(patch).toContain(`${line}\n`);
  expect(patch).not.toContain("!!js");
  expect(patch).not.toContain("process.env");

  // The model bridge ships in the same folder and is wired by a patch-relative row.
  const bridge = await readFile(path.join(destination, "lib/model-bridge.js"), "utf8");
  expect(bridge).toContain('export const name = "voo-model-bridge"');
  expect(bridge).toContain("export function apply(ctx, config");
  expect(bridge).not.toContain(repoRoot);

  const english = JSON.parse(await readFile(path.join(destination, "locale/en.json"), "utf8"));
  const chinese = JSON.parse(await readFile(path.join(destination, "locale/zh.json"), "utf8"));
  expect(english.meta.title).toBe("VOO");
  expect(chinese.meta.title).toBe("VOO");
  expect(english.meta.description.length).toBeGreaterThan(20);
  expect(chinese.meta.description.length).toBeGreaterThan(10);

  const icon = await readFile(path.join(destination, "icon.png"));
  expect(icon.subarray(0, pngSignature.length).equals(pngSignature)).toBe(true);
  expect(icon.length).toBeLessThan(maxIconBytes);
  expect((await stat(path.join(destination, ".claude-plugin/icon.png"))).size).toBe(icon.length);

  const readme = await readFile(path.join(destination, "README.md"), "utf8");
  for (const snippet of [
    'dsh plugin --profile desktop add "link:',
    "mcp__voo__*",
    "deepseek.cordis.yml",
    "VOO",
    "rebuild",
    "http://127.0.0.1:4399/v1",
  ]) expect(readme).toContain(snippet);

  // The legacy channels stay in the same portable folder.
  expect(JSON.parse(await readFile(path.join(destination, ".claude-plugin/plugin.json"), "utf8")).name).toBe("voo");
  expect(await readFile(path.join(destination, ".mcp.json"), "utf8")).toContain("voo");
  expect(await readFile(path.join(destination, "deepseek.cordis.yml"), "utf8")).toContain("VOO_MCP_ENTRY");
  await stat(path.join(destination, "scripts/mcp-server.mjs"));
  await stat(path.join(destination, "node_modules/ws/package.json"));
});

it("refuses to replace an existing plugin folder", async () => {
  const directory = await temporaryDirectory("voo-dsh-existing-");
  const destination = path.join(directory, "plugin");
  await buildPortableConnector({ root: repoRoot, destination });
  await expect(buildPortableConnector({ root: repoRoot, destination })).rejects.toMatchObject({ code: "EEXIST" });
});

it("keeps the CLI failure behavior for invalid destinations", async () => {
  const error = await promisify(execFile)(
    process.execPath,
    ["scripts/build-agent-plugin.mjs", "relative/folder"],
    { cwd: repoRoot },
  ).catch(raised => raised);
  expect(error.code).toBe(1);
  expect(String(error.stderr)).toContain("Usage: node scripts/build-agent-plugin.mjs");
});
