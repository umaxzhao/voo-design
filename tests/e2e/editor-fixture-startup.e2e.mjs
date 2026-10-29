import assert from "node:assert/strict";
import { createServer } from "node:net";
import { WebSocket } from "ws";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const checks = [];

async function canBind(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => resolve());
    });
    return true;
  } catch (error) {
    if (error.code === "EADDRINUSE") return false;
    throw error;
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function upgradeStatus(port, origin) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("Origin probe timed out")); }, 5000);
    const finish = status => { clearTimeout(timer); socket.terminate(); resolve(status); };
    socket.once("open", () => finish(101));
    socket.once("unexpected-response", (_request, response) => { response.resume(); finish(response.statusCode); });
    socket.once("error", error => { clearTimeout(timer); reject(error); });
  });
}

const environments = [];
try {
  const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    environments.push(await startEditorBrowserServer());
  }));
  const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, "Concurrent fixture startup failed");
  const ports = environments.map(({ origin, bridge }) => [Number(new URL(origin).port), bridge.port]).flat();
  assert.equal(new Set(ports).size, 8);
  for (const { origin, bridge } of environments) {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    await response.body.cancel();
    assert.equal(await canBind(Number(new URL(origin).port)), false);
    assert.equal(await upgradeStatus(bridge.port, origin), 101);
    assert.equal(await upgradeStatus(bridge.port, "http://unrelated.invalid"), 401);
  }
  checks.push("concurrent listeners retain unique OS-assigned ports and bind bridge authentication to the actual Vite origin");
} finally {
  await Promise.all(environments.map(environment => environment.close()));
}
for (const { origin, bridge } of environments) {
  assert.equal(await canBind(Number(new URL(origin).port)), true);
  assert.equal(await canBind(bridge.port), true);
}
checks.push("closing each fixture releases both its Vite/HMR and MCP listening ports");

const origins = [];
await Promise.all(Array.from({ length: 3 }, (_, index) => withEditorBrowser(async ({ page, tool, origin }) => {
  origins.push(origin);
  assert.equal((await tool("voo_status")).canvasConnected, true);
  await tool("new_document", { width: 300 + index, height: 200, name: `Isolated${index}`, force: true });
  await page.waitForFunction(width => window.__vooEditor?.getDocument()?.width === width, 300 + index);
  const width = await page.evaluate(() => window.__vooEditor.getDocument().width);
  assert.equal(width, 300 + index);
})));
assert.equal(new Set(origins).size, 3);
for (const origin of origins) assert.equal(await canBind(Number(new URL(origin).port)), true);
checks.push("three parallel real browsers register isolated MCP canvases and clean up their listeners after document operations");
console.log(JSON.stringify({ passed: checks }, null, 2));
