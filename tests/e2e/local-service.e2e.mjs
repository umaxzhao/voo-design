import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { CLI_BRIDGE_CHANNEL as C } from "../../src/shared/cli_bridge_protocol.js";

await withEditorBrowser(async ({ page, bridge }) => {
  const ipc = bridge.adapter.ipcMain;
  for (const channel of [C.CHECK_ALL, C.CONNECT]) ipc.removeHandler(channel);
  ipc.handle(C.CHECK_ALL, () => ({ claude: { installed: true, authenticated: true }, codex: { installed: false } }));
  ipc.handle(C.CONNECT, () => ({ ok: true, installed: false }));
  let available = false;
  let legacy = false;
  await page.route("**/health", route => !available ? route.abort() : legacy
    ? route.fulfill({ json: { ok: true, version: "1.0.0" }, headers: { "access-control-allow-origin": "*" } })
    : route.continue());
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    const { localServiceDiscovery } = await import("/src/canvas/components/agent-panel/local-service-discovery.js");
    window.__localDiscovery = localServiceDiscovery;
  });
  const trigger = page.locator('.welcome-composer-model-select button');
  const options = () => page.getByRole("option", { name: /Sonnet|GPT-6/ });
  await trigger.click();
  await page.getByTestId("settings-drawer").waitFor();
  await page.getByTestId("settings-drawer").getByRole("tab", { name: "AI Assistant", exact: true }).click();
  assert.equal(await page.getByTestId("agent-settings-tab-cli").count(), 0);
  assert.equal(await options().count(), 0, "No unreachable local models in web picker");
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("voo.custom_providers", JSON.stringify([
    { id: "fixture-api", name: "Fixture API", baseUrl: "https://example.invalid/v1",
      models: [{ id: "fixture-model", label: "Fixture Model" }] },
  ])));
  // A real loopback HTTP health identity plus real WebSocket capability RPC.
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => window.__localDiscovery.getSnapshot().available);
  await trigger.click();
  await page.getByRole("option", { name: "Sonnet 5.5", exact: true }).waitFor();
  assert.equal(await page.getByRole("option", { name: /GPT-6/ }).count(), 0, "Uninstalled CLI stays hidden");
  await page.getByRole("option", { name: "Sonnet 5.5", exact: true }).click();
  const readSelection = () => page.evaluate(async () => {
    const { getSetting } = await import("/src/shared/settings.js");
    return getSetting("agent.model");
  });
  const selected = await readSelection();
  assert.equal(selected, "claude:claude-sonnet-5-5");
  // Discovery must not register the browser as a new writable MCP canvas.
  const status = await page.evaluate(async () => {
    const { getLocalCliBridge } = await import("/src/canvas/components/agent-panel/local_cli_bridge.js");
    return getLocalCliBridge().isOpen();
  });
  assert.equal(status, true);
  const relayStatus = await page.evaluate(async () => {
    const { CLI_BRIDGE_URL } = await import("/src/canvas/components/agent-panel/local_cli_bridge.js");
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(CLI_BRIDGE_URL);
      socket.onopen = () => socket.send(JSON.stringify({ type: "invoke", id: "status", channel: "voo:mcp-status", args: [] }));
      socket.onmessage = event => { socket.close(); resolve(JSON.parse(event.data).value); };
      socket.onerror = reject;
    });
  });
  assert.equal(relayStatus.canvasConnected, false, "Discovery must not steal the App's writable target");
  available = false;
  for (const socket of bridge.wss.clients) socket.terminate();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !window.__localDiscovery.getSnapshot().available);
  await trigger.click();
  assert.equal(await options().count(), 0);
  await page.getByRole("option", { name: "Fixture Model", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await readSelection(), selected, "Disconnect preserves selection");
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => window.__localDiscovery.getSnapshot().available);
  await trigger.click();
  await page.getByRole("option", { name: "Sonnet 5.5", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  legacy = true;
  const recoveredLegacy = await page.evaluate(async () => {
    const { resetWebCliBridge } = await import("/src/canvas/components/agent-panel/local_cli_bridge.js");
    resetWebCliBridge();
    return (await window.__localDiscovery.refresh()).available;
  });
  assert.equal(recoveredLegacy, true, "Released bridge remains usable without the new health identity");
  await page.screenshot({ path: editorArtifactPath("voo-local-service.png") });
  console.log("Local service: absent, discovered, installed-only, disconnected, recovered; no prompt generation");
}, { openDocument: false, mcpLink: false });
