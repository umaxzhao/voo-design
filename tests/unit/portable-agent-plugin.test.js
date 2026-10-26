import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

it("discovers tools from a portable package without a running bridge or repository dependencies", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voo-portable-plugin-"));
  directories.push(directory);
  const plugin = path.join(directory, "plugin");
  await promisify(execFile)(process.execPath, ["scripts/build-agent-plugin.mjs", plugin]);
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
  expect(frames.find(frame => frame.id === 1).result.serverInfo.name).toBe("voo-design");
  const tools = frames.find(frame => frame.id === 2).result.tools;
  expect(tools.some(tool => tool.name === "new_document")).toBe(true);
  expect(tools.some(tool => tool.name === "capture_canvas")).toBe(true);
  expect(frames.find(frame => frame.id === 3).result.isError).toBe(true);
}, 10000);
