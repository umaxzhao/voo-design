import assert from "node:assert/strict";
import { createServer } from "node:net";
import { access } from "node:fs/promises";
import { WebSocket } from "ws";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const checks = [];

// An optional image must not hold the real editor's startup behind window.load.
let releaseImage;
const imageReleased = new Promise(resolve => { releaseImage = resolve; });
let imageRequested = false;
try {
  await withEditorBrowser(async ({ page, tool }) => {
    assert.equal(imageRequested, true);
    assert.equal(await page.evaluate(() => document.readyState), "interactive");
    assert.equal((await tool("voo_status")).canvasConnected, true);
    assert.ok(await page.evaluate(() => window.__vooEditor.getDocument().width > 0));
    releaseImage();
    await page.waitForLoadState("load");
  }, {
    preparePage: async page => {
      await page.route("**/__fixture-pending-image.svg", async route => {
        imageRequested = true;
        await imageReleased;
        await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
      });
      // Keep the main document on a real loopback connection: fulfilling it
      // through request interception changes Chromium's local-network checks.
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const image = document.createElement("img");
          image.src = "/__fixture-pending-image.svg";
          image.alt = "";
          document.body.append(image);
        }, { once: true });
      });
    },
  });
  checks.push("real editor and MCP become usable while a noncritical image still holds the load event open");
} finally { releaseImage(); }

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
  // Four Vite servers plus their bridges cold-start in parallel here; under high
  // CPU contention the default 5s handshake and probe budget can expire before
  // the socket settles, so both get the same generous 20s ceiling.
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin, handshakeTimeout: 20000 });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("Origin probe timed out")); }, 20000);
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
  await Promise.all(environments.map(environment => {
    const firstClose = environment.close();
    assert.equal(environment.close(), firstClose, "concurrent callers share one teardown");
    return firstClose;
  }));
}
for (const { origin, bridge, cacheDir } of environments) {
  await assert.rejects(access(cacheDir), { code: "ENOENT" });
  assert.equal(await canBind(Number(new URL(origin).port)), true);
  assert.equal(await canBind(bridge.port), true);
}
checks.push("closing concurrent cold fixtures releases Vite/HMR and MCP ports and removes private optimizer caches");

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
