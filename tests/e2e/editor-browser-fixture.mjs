import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";
import { connect } from "../../electron/mcp_server/stdio_server.js";
import { CLI_BRIDGE_CHANNEL as C } from "../../src/shared/cli_bridge_protocol.js";

/** Isolated real editor + private MCP relay; never changes the user's open document. */
export async function withEditorBrowser(run) {
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close((error) => error ? reject(error) : resolve(value));
    });
  });
  const origin = `http://localhost:${port}`;
  const bridge = await startCliBridgeServer({ port: 0, origins: [origin] });
  const vite = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), detached: true,
    env: { ...process.env, VITE_CLI_BRIDGE_URL: `ws://127.0.0.1:${bridge.port}` },
    stdio: "ignore",
  });
  let browser;
  let socket;
  try {
    const deadline = Date.now() + 60000;
    while (true) {
      if (vite.exitCode !== null) throw new Error("Fixture Vite exited before startup");
      try {
        const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
      }
      if (Date.now() >= deadline) throw new Error("Fixture Vite startup timed out");
      await delay(200);
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => localStorage.setItem("voo.mcpLink", "on"));
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${origin}/?voo-test=1`);
    await page.waitForLoadState("networkidle");
    const back = page.getByTitle(/返回画布|Back to canvas/);
    if (await back.count()) await back.click();
    await page.waitForFunction(() => Boolean(window.__vooEditor), null, { timeout: 60000 });
    socket = await connect(bridge.port, bridge.token);
    let id = 0;
    const tool = (name, args = {}) => new Promise((resolve, reject) => {
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
    for (let attempt = 0; !(await tool("voo_status")).canvasConnected; attempt += 1) {
      if (attempt >= 40) throw new Error("Fixture canvas did not register with MCP");
      await delay(100);
    }
    await tool("new_document", { width: 600, height: 400, name: "EffectsAudit", force: true });
    await page.waitForFunction(() => window.__vooStore?.activeDocumentId && window.__vooEditor);
    await page.waitForTimeout(300);
    await run({ page, tool, origin, errors });
    if (errors.length) throw new Error(`Editor errors: ${errors.join("\n")}`);
  } finally {
    socket?.close();
    await browser?.close();
    await bridge.close();
    try { process.kill(-vite.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}
