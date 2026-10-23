// Real-app pointer checks. Usage: node tests/e2e/qa_flows.e2e.mjs
// Starts its own Vite server; needs `playwright` and Chromium installed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { TOOL } from "../../src/canvas/editor/tool_ids.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});
const url = `http://localhost:${port}/?voo-test=1`;
const vite = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
  cwd: root,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let viteLog = "";
let viteError;
vite.on("error", (error) => { viteError = error; });
for (const stream of [vite.stdout, vite.stderr]) {
  stream.on("data", (chunk) => { viteLog = (viteLog + chunk).slice(-12000); });
}
let browser;
const pageErrors = [];
const consoleErrors = [];

try {
  const deadline = Date.now() + 60000;
  while (true) {
    if (viteError) throw viteError;
    if (vite.exitCode !== null || vite.signalCode !== null) {
      throw new Error(`Vite exited before startup:\n${viteLog}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) break;
    } catch {}
    if (Date.now() >= deadline) throw new Error(`Vite startup timed out:\n${viteLog}`);
    await delay(200);
  }

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120000);
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(url);
  await page.getByTitle(/返回画布|Back to canvas/).click();
  await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible" });
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 500 && box.height > 300, "Canvas must have room for two rects");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const drag = async (x1, y1, x2, y2) => {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 12 });
    await page.mouse.up();
  };
  const rectIds = [];
  for (const x of [cx - 180, cx + 40]) {
    const before = await page.evaluate(() => window.__vooEditor.getDocument().nodes.map((n) => n.id));
    await page.evaluate(() => window.__vooEditor.setTool("rect"));
    await drag(x, cy - 80, x + 120, cy + 20);
    await page.waitForFunction((ids) => window.__vooEditor.getDocument().nodes.some((n) => !ids.includes(n.id)), before);
    const added = await page.evaluate((ids) => window.__vooEditor.getDocument().nodes.filter((n) => !ids.includes(n.id)), before);
    assert.equal(added.length, 1, "Each drag must create exactly one node");
    assert.equal(added[0].kind, "rect", "Each created node must be a rectangle");
    rectIds.push(added[0].id);
  }
  assert.notEqual(rectIds[0], rectIds[1]);

  await page.evaluate(() => window.__vooEditor.setTool("select"));
  await page.mouse.click(cx - 120, cy - 30);
  await page.waitForFunction((id) => {
    const ids = window.__vooEditor.getSelectedIds();
    return Array.isArray(ids) && ids.length === 1 && ids[0] === id;
  }, rectIds[0]);
  const selected = await page.evaluate(() => window.__vooEditor.getSelectedIds());
  assert.ok(Array.isArray(selected), "Selection must be an array");
  assert.deepEqual(selected, [rectIds[0]], "Click must select only the clicked rectangle");

  await page.evaluate((tool) => window.__vooEditor.setTool(tool), TOOL.GRADIENT);
  await drag(cx - 165, cy - 65, cx - 75, cy + 5);
  await page.waitForTimeout(500);
  // Closing the page also captures errors emitted during teardown.
  await page.close();
  assert.deepEqual(pageErrors, [], "No pageerror events during QA flows");
  assert.deepEqual(consoleErrors, [], "No console errors during QA flows");
  console.log("PASS: rectangle selection and gradient drag");
} catch (error) {
  console.error("FAIL", error);
  if (pageErrors.length) console.error("pageerrors", pageErrors);
  if (consoleErrors.length) console.error("console errors", consoleErrors);
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } finally {
    // Kill the entire npx/Vite process group, including the spawned Vite child.
    const killVite = (signal) => {
      if (!vite.pid) return;
      try { process.kill(-vite.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    };
    killVite("SIGTERM");
    await delay(500);
    killVite("SIGKILL");
  }
}
