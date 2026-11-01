// Real-app pointer checks. Usage: node tests/e2e/qa_flows.e2e.mjs
// Starts its own Vite server; needs `playwright` and Chromium installed.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";
import { TOOL } from "../../src/canvas/editor/tool_ids.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const screenshotDirectory = await mkdtemp(join(tmpdir(), "voo-qa-flows-"));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});
const url = `http://localhost:${port}/?voo-test=1`;
const bridge = await startCliBridgeServer({ port: 0, origins: [`http://localhost:${port}`] });
const vite = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
  cwd: root,
  env: { ...process.env, VITE_CLI_BRIDGE_URL: `ws://127.0.0.1:${bridge.port}` },
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
  await page.getByRole("button", { name: /^(新建|New)$/ }).click();
  await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')
    ?.getAttribute("data-open-guard") === "off", null, { timeout: 90000 });
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

  // Default creation stays visible; user-selected black remains represented in thumbs.
  const fills = await page.evaluate((ids) => window.__vooEditor.getDocument().nodes.filter(n => ids.includes(n.id)).map(n => n.fill), rectIds);
  assert.deepEqual(fills, ["#D4D4D4", "#D4D4D4"]);
  await page.screenshot({ path: join(screenshotDirectory, "01-shape-default-fill.png") });

  // Observe DOM commits as well as animation frames: a delayed effect-only
  // draft reset can otherwise escape a final-value assertion.
  await page.evaluate((ids) => {
    window.__xSamples = [];
    const sample = () => {
      const selected = ids.find(id => document.getElementById(`layer-row-${id}`)?.getAttribute("aria-selected") === "true");
      const input = document.querySelector('input[aria-label="X"]');
      if (!selected || !input) return;
      const node = window.__vooEditor.getDocument().nodes.find(n => n.id === selected);
      window.__xSamples.push({ id: selected, actual: input.value, expected: String(Math.round(node.x)) });
    };
    window.__xObserver = new MutationObserver(sample);
    window.__xObserver.observe(document.body, { subtree: true, attributes: true, childList: true });
    window.__xFrame = () => { sample(); window.__xRaf = requestAnimationFrame(window.__xFrame); };
    window.__xRaf = requestAnimationFrame(window.__xFrame);
  }, rectIds);
  for (const id of [rectIds[1], rectIds[0], rectIds[1]]) {
    await page.locator(`[id="layer-row-${id}"]`).click();
    await page.waitForTimeout(100);
  }
  const samples = await page.evaluate(() => {
    window.__xObserver.disconnect(); cancelAnimationFrame(window.__xRaf);
    return window.__xSamples;
  });
  assert.ok(samples.some(s => s.id === rectIds[1]));
  assert.deepEqual(samples.filter(s => s.actual !== s.expected), [], "X must match the selected layer at every observed DOM commit/frame");
  await page.screenshot({ path: join(screenshotDirectory, "03-layer-x-after-switch.png") });

  const imageId = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 100;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#a7ffd4"; ctx.fillRect(0, 0, 120, 100);
    const image = await window.__vooEditor.insertImage(canvas.toDataURL(), { x: 120, y: 120 });
    return image?.id;
  });
  assert.ok(imageId, "Image insertion must return a selected, editable node");
  await page.evaluate(async (id) => {
    const engine = window.__vooEditor;
    const { createLiveFilterEntry } = await import("/src/canvas/editor/live_filter_stack.js");
    engine.selectExactly([id]);
    engine.updateNode(id, { adjustments: { liveFilters: [createLiveFilterEntry("blur", { value: 100 })] } });
  }, imageId);
  const filters = page.getByTestId("effects-filter-stack");
  await filters.waitFor({ state: "visible", timeout: 5000 });
  const valueFields = filters.locator('input[type="number"]');
  if (await valueFields.count() === 0) await filters.locator("button").first().click();
  await valueFields.first().waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await valueFields.count(), 2);
  for (const field of await valueFields.all()) {
    await field.scrollIntoViewIfNeeded();
    await field.hover();
    await page.waitForTimeout(150);
    const geometry = await field.evaluate(el => {
      const r = el.getBoundingClientRect();
      const clips = [];
      for (let p = el.parentElement; p; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {
          const b = p.getBoundingClientRect();
          clips.push({ left: b.left, right: b.right });
        }
      }
      return { width: r.width, left: r.left, right: r.right, clips, value: el.value };
    });
    assert.equal(geometry.value, "100");
    assert.ok(geometry.width > 30, "Numeric filter field must have usable width");
    for (const clip of geometry.clips) assert.ok(geometry.left >= clip.left && geometry.right <= clip.right, "Filter field must stay inside clipping ancestors");
  }
  await page.screenshot({ path: join(screenshotDirectory, "02-live-filter-fields.png") });
  const accept = await page.getByTestId("editor-media-file-input").getAttribute("accept");
  for (const token of ["image/*", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".psd", "audio/*", "video/*", ".glb", ".obj"]) assert.ok(accept.split(",").includes(token));

  // A real picker upload must reach image insertion, not the media-only importer.
  const beforeImport = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  await page.getByTestId("editor-media-file-input").setInputFiles({ name: "qa-picker.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#a7ffd4"/></svg>') });
  await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length > count, beforeImport);
  await page.screenshot({ path: join(screenshotDirectory, "04-file-picker-accept.png") });

  await page.evaluate((tool) => window.__vooEditor.setTool(tool), TOOL.GRADIENT);
  await drag(cx - 165, cy - 65, cx - 75, cy + 5);
  await page.waitForTimeout(500);
  // Closing the page also captures errors emitted during teardown.
  await page.close();
  assert.deepEqual(pageErrors, [], "No pageerror events during QA flows");
  assert.deepEqual(consoleErrors, [], "No console errors during QA flows");
  console.log("PASS: shape defaults, selection X commits/frames, live filter clipping, picker accept/upload, rectangle selection and gradient drag");
} catch (error) {
  console.error("FAIL", error);
  if (pageErrors.length) console.error("pageerrors", pageErrors);
  if (consoleErrors.length) console.error("console errors", consoleErrors);
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
    await bridge.close();
    await rm(screenshotDirectory, { recursive: true, force: true });
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
