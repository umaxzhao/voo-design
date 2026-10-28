import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";
import { connect } from "../../electron/mcp_server/stdio_server.js";
import { CLI_BRIDGE_CHANNEL as C } from "../../src/shared/cli_bridge_protocol.js";

/** Isolated real editor + private MCP relay; never changes the user's open document. */
export async function withEditorBrowser(run, pageOptions = {}) {
  const { openDocument = true, mcpLink = true, ...browserOptions } = pageOptions;
  if (openDocument && !mcpLink) throw new Error("Document fixtures require the MCP link");
  const reservation = createServer();
  const port = await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => resolve(reservation.address().port));
  });
  const origin = `http://localhost:${port}`;
  let bridge;
  try {
    // Keep Vite's chosen port occupied while the relay gets its own random
    // port. Releasing it first lets the relay accidentally claim that port.
    bridge = await startCliBridgeServer({ port: 0, origins: [origin] });
  } finally {
    await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  }
  const vite = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), detached: true,
    env: { ...process.env, VITE_CLI_BRIDGE_URL: `ws://127.0.0.1:${bridge.port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let viteOutput = "", spawnError;
  vite.once("error", error => { spawnError = error; });
  for (const stream of [vite.stdout, vite.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", chunk => { viteOutput = (viteOutput + chunk).slice(-8192); });
  }
  let browser;
  let socket;
  try {
    const deadline = Date.now() + 60000;
    while (true) {
      if (spawnError) throw spawnError;
      if (vite.exitCode !== null) throw new Error(`Fixture Vite exited before startup (${vite.exitCode}):\n${viteOutput}`);
      try {
        const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) break;
      } catch (error) {
        if (Date.now() >= deadline) throw new Error(`Fixture Vite did not respond:\n${viteOutput}`, { cause: error });
      }
      if (Date.now() >= deadline) throw new Error(`Fixture Vite startup timed out:\n${viteOutput}`);
      await delay(200);
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...browserOptions });
    if (mcpLink) await page.addInitScript(() => localStorage.setItem("voo.mcpLink", "on"));
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      // Development React reports contract violations through console.error,
      // so pageerror alone would let broken panel props pass release checks.
      if (message.type() === "error" && /Warning: Failed (?:prop|%s) type:/.test(message.text())) {
        errors.push(message.text());
      }
    });
    await page.goto(`${origin}/?voo-test=1`);
    await page.waitForLoadState("networkidle");
    // A welcome-only session deliberately has no engine. The MCP store-level
    // new_document command below opens the workspace before waiting for one.
    if (mcpLink) socket = await connect(bridge.port, bridge.token);
    let id = 0;
    const tool = (name, args = {}) => new Promise((resolve, reject) => {
      if (!socket) { reject(new Error("MCP is disabled for this browser fixture")); return; }
      const callId = `effects_${++id}`;
      const finish = (error, value) => {
        clearTimeout(timer);
        socket.off("message", listener);
        if (error) reject(error); else resolve(value);
      };
      const listener = (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === "result" && frame.id === callId) finish(frame.ok ? null : new Error(frame.error), frame.value);
      };
      const timer = setTimeout(() => finish(new Error(`MCP timeout: ${name}`)), 15000);
      socket.on("message", listener);
      socket.send(JSON.stringify({ type: "invoke", id: callId, channel: name === "voo_status" ? C.MCP_STATUS : C.MCP_CALL,
        args: name === "voo_status" ? [] : [name, args] }));
    });
    for (let attempt = 0; mcpLink && !(await tool("voo_status")).canvasConnected; attempt += 1) {
      if (attempt >= 40) throw new Error("Fixture canvas did not register with MCP");
      await delay(100);
    }
    if (openDocument) {
      await tool("new_document", { width: 600, height: 400, name: "EffectsAudit", force: true });
      await page.waitForFunction(() => window.__vooStore?.activeDocumentId && window.__vooEditor);
      await page.waitForTimeout(300);
    }
    await run({ page, tool, origin, errors });
    if (errors.length) throw new Error(`Editor errors: ${errors.join("\n")}`);
  } finally {
    socket?.close();
    await browser?.close();
    await bridge.close();
    try { if (vite.pid) process.kill(-vite.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}
