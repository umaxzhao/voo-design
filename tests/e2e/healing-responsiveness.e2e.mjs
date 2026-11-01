import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Controlled CPU inference validates real Worker isolation and editor ownership.
// Real neural weights are separately exercised by image-network's AI repair case.
const WORKER_FIXTURE = `self.onmessage = ({data}) => {
  self.postMessage({id:data.id,type:"progress",phase:"running"});
  const started=performance.now();
  while(performance.now()-started<1000) {}
  const pixels=new Float32Array(3*512*512);
  pixels.fill(0.2,0,512*512);pixels.fill(0.8,512*512,2*512*512);
  pixels.fill(0.4,2*512*512);
  self.postMessage({id:data.id,type:"result",pixels,backend:"wasm"},[pixels.buffer]);
};`;

await withEditorBrowser(async ({ page, tool, errors }) => {
  let workerCount = 0;
  let closedCount = 0;
  page.on("worker", worker => {
    if (!worker.url().includes("ai-repair-worker")) return;
    workerCount++;
    worker.on("close", () => closedCount++);
  });
  const nodeId = await page.evaluate(async () => {
    const editor = window.__vooEditor;
    editor.setTool("select");
    editor.setDoc({ ...editor.getDocument(), width: 600, height: 400, isCanvasRoot: false, nodes: [] });
    const source = document.createElement("canvas");
    source.width = 160; source.height = 120;
    const ctx = source.getContext("2d");
    ctx.fillStyle = "#c03020"; ctx.fillRect(0, 0, 160, 120);
    const node = await editor.insertImage(source.toDataURL(), { x: 280, y: 240 });
    editor.updateNode(node.id, { x: 200, y: 180, width: 160, height: 120 });
    editor.selectExactly([node.id]);
    const { prepareAiRepairModel } = await import("/src/canvas/editor/local_ai_repair.js");
    const { AI_REPAIR_MODEL_CACHE } = await import("/src/canvas/editor/model_cache_names.js");
    const model = await prepareAiRepairModel();
    const cache = await caches.open(AI_REPAIR_MODEL_CACHE);
    await cache.put(model.url, new Response(new Uint8Array(16).fill(1)));
    return node.id;
  });

  await page.getByTestId("editor-healing-menu-trigger").click();
  await page.getByTestId("editor-healing-menu-patch").click();
  await page.evaluate(() => window.__vooEditor.setTool("select"));
  await page.getByTestId("editor-healing-menu").locator("button[aria-pressed]").click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getHealingMode()), "patch");
  await page.getByTestId("editor-healing-menu-trigger").click();
  await page.getByTestId("editor-healing-menu-aiRepair").click();

  const stroke = async () => {
    const points = await page.evaluate(() => {
      const e = window.__vooEditor;
      const origin = e.toDocPoint(0, 0), unit = e.toDocPoint(1, 1);
      return [250, 270].map(x => ({ x: (x-origin.x)/(unit.x-origin.x), y: (220-origin.y)/(unit.y-origin.y) }));
    });
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    await page.mouse.move(points[1].x, points[1].y, { steps: 4 });
    await page.mouse.up();
  };
  const original = await page.evaluate(id => window.__vooEditor.getNode(id).imageId, nodeId);
  await page.evaluate(() => {
    window.__repairHeartbeats = { count: 0, maxGap: 0, last: performance.now() };
    window.__repairTimer = setInterval(() => {
      const beat = window.__repairHeartbeats, now = performance.now();
      beat.maxGap = Math.max(beat.maxGap, now-beat.last); beat.last=now; beat.count++;
    }, 16);
  });
  await stroke();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).waitFor();
  await page.waitForFunction(({id, original}) => window.__vooEditor.getNode(id).imageId !== original, { id:nodeId, original });
  await dialog.waitFor({ state: "detached" });
  const beats = await page.evaluate(() => { clearInterval(window.__repairTimer); return window.__repairHeartbeats; });
  assert.ok(beats.count >= 8 && beats.maxGap < 250, JSON.stringify(beats));
  assert.equal(workerCount, 1, "inference must run in an actual dedicated Worker");
  await tool("undo");
  assert.equal(await page.evaluate(id => window.__vooEditor.getNode(id).imageId, nodeId), original);

  await stroke();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(id => window.__vooEditor.getNode(id).imageId, nodeId), original);
  assert.equal(closedCount, 1, "cancel must terminate expensive inference immediately");

  await stroke();
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(id => window.__vooEditor.getNode(id).imageId, nodeId), original);
  assert.equal(closedCount, 2, "Escape must cancel without a delayed bitmap write");

  await stroke();
  await dialog.waitFor();
  await page.evaluate(id => window.__vooEditor.removeNode(id), nodeId);
  await dialog.waitFor({ state: "detached" });
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(id => Boolean(window.__vooEditor.getNode(id)), nodeId), false);
  assert.equal(closedCount, 3, "source removal must stop its worker");
  await tool("undo");
  assert.equal(await page.evaluate(id => window.__vooEditor.getNode(id).imageId, nodeId), original);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ simulatedInference:true, workerCount, closedCount, heartbeat:beats,
    passed:["toolbar mode retention", "real pointer stroke and pixel writeback", "one-step undo", "responsive Worker inference", "running Cancel and Escape", "source removal cancels late writes"] }));
}, { preparePage: page => page.route("**/ai-repair-worker.js*", route => route.fulfill({
  contentType: "text/javascript", body: WORKER_FIXTURE,
})) });
