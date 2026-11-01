import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { connect } from "../../electron/mcp_server/stdio_server.js";
import { CLI_BRIDGE_CHANNEL as C } from "../../src/shared/cli_bridge_protocol.js";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";

const STARTUP_TIMEOUT_MS = 90_000;

/** Isolated real editor + private MCP relay; never changes the user's open document. */
export async function withEditorBrowser(run, pageOptions = {}) {
  const { openDocument = true, mcpLink = true, preparePage, ...browserOptions } = pageOptions;
  if (openDocument && !mcpLink) throw new Error("Document fixtures require the MCP link");
  const environment = await startEditorBrowserServer();
  const { origin, bridge } = environment;
  let browser;
  let socket;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...browserOptions });
    if (mcpLink) await page.addInitScript(() => localStorage.setItem("voo.mcpLink", "on"));
    const errors = [];
    const startupMessages = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? String(error)));
    page.on("console", (message) => {
      if (message.type() === "error" && startupMessages.length < 8) startupMessages.push(message.text());
      // Development React reports contract violations through console.error,
      // so pageerror alone would let broken panel props pass release checks.
      if (message.type() === "error" && /Warning: Failed (?:prop|%s) type:/.test(message.text())) {
        errors.push(message.text());
      }
    });
    // Cold Vite transforms contend during parallel release runs. Keep this setup
    // allowance separate from the editor readiness and functional assertions.
    await preparePage?.(page);
    const startupDeadline = Date.now() + STARTUP_TIMEOUT_MS;
    const remainingStartupTime = () => Math.max(1, startupDeadline - Date.now());
    await page.goto(`${origin}/?voo-test=1`, {
      waitUntil: "domcontentloaded", timeout: remainingStartupTime(),
    });
    // Wait for actual React UI readiness, not optional images/fonts or idle traffic.
    await page.getByTestId("editor-top-bar").waitFor({ timeout: remainingStartupTime() });
    // A welcome-only session deliberately has no engine. The MCP store-level
    // new_document command below opens the workspace before waiting for one.
    if (mcpLink) socket = await connect(bridge.port, bridge.token);
    let id = 0;
    const tool = (name, args = {}, timeoutMs = 15000) => new Promise((resolve, reject) => {
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
      const timer = setTimeout(() => finish(new Error(`MCP timeout: ${name}`)), timeoutMs);
      socket.on("message", listener);
      socket.send(JSON.stringify({ type: "invoke", id: callId, channel: name === "voo_status" ? C.MCP_STATUS : C.MCP_CALL,
        args: name === "voo_status" ? [] : [name, args] }));
    });
    if (mcpLink) {
      const deadline = Math.min(startupDeadline, Date.now() + 20000);
      let status;
      while (Date.now() < deadline) {
        if (errors.length) throw new Error(`Editor failed during MCP startup: ${errors.join("\n")}`);
        status = await tool("voo_status", {}, Math.max(1, Math.min(5000, deadline - Date.now())));
        if (status.canvasConnected) break;
        await delay(100);
      }
      if (!status?.canvasConnected) {
        throw new Error(`Fixture canvas did not register with MCP at ${origin}; last status: ${JSON.stringify(status)}; page errors: ${errors.join("\n")}; console errors: ${startupMessages.join("\n")}`);
      }
    }
    if (openDocument) {
      // The lazy workspace starts after welcome; give its setup the same
      // bounded budget without changing any functional assertion timeout.
      const workspaceDeadline = Date.now() + STARTUP_TIMEOUT_MS;
      const remainingWorkspaceTime = () => Math.max(1, workspaceDeadline - Date.now());
      await tool("new_document", { width: 600, height: 400, name: "EffectsAudit", force: true });
      await page.waitForFunction(() => window.__vooStore?.activeDocumentId && window.__vooEditor,
        null, { timeout: remainingWorkspaceTime() });
      // Exercise normal stacking and hit testing, not the entry guard that
      // temporarily disables inspector pointer events during document opening.
      await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')
        ?.getAttribute("data-open-guard") === "off", null, { timeout: remainingWorkspaceTime() });
    }
    await run({ page, tool, origin, bridge, errors, reloadModule: environment.reloadModule });
    if (errors.length) throw new Error(`Editor errors: ${errors.join("\n")}`);
  } finally {
    try { socket?.close(); await browser?.close(); }
    finally { await environment.close(); }
  }
}
