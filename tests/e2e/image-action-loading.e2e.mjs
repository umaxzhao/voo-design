import { createAuthoredFrame } from "./authored-frame-fixture.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const enhanceModule = /\/src\/canvas\/editor\/auto_enhance_apply\.js(?:\?|$)/;
const cropModule = /\/src\/canvas\/editor\/auto_crop_page\.js(?:\?|$)/;
const implementations = /\/(?:auto_enhance(?:_apply)?|auto_crop(?:_page)?)\.js(?:\?|$)/;
const checks = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const nodeAdjustments = page => page.evaluate(() => [window.__imageActionNodes.first, window.__imageActionNodes.second]
  .map(id => window.__vooEditor.getNode(id).adjustments));

async function prepare(page, { reload = false, harness = false, crop = false } = {}) {
  if (reload) await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.isCanvasRoot);
  if (!crop) await createAuthoredFrame(page);
  assert.deepEqual(await page.evaluate(pattern => performance.getEntriesByType("resource")
    .map(entry => entry.name).filter(name => new RegExp(pattern).test(name)), implementations.source), []);
  await page.evaluate(async crop => {
    const e = window.__vooEditor, initial = e.getDocument();
    const frame = initial.nodes.find(node => node.isFrame);
    e.setDoc({ ...initial, isCanvasRoot: !crop, width: 400, height: 300, crop: null, backgroundColor: "#ffffff",
      nodes: crop ? [] : [{ ...frame, x: 0, y: 0, width: 400, height: 300 }] });
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#444444"; ctx.fillRect(0, 0, 32, 32);
    const first = await e.insertImage(canvas.toDataURL(), { x: 116, y: 116 });
    e.updateNode(first.id, { x: 100, y: 100, width: 32, height: 32, ...(crop ? {} : { parentId: frame.id }) });
    ctx.fillStyle = "#408020"; ctx.fillRect(0, 0, 32, 32);
    const second = await e.insertImage(canvas.toDataURL(), { x: 276, y: 116 });
    e.updateNode(second.id, { x: 260, y: 100, width: 32, height: 32, ...(crop ? {} : { parentId: frame.id }) });
    window.__imageActionNodes = { first: first.id, second: second.id };
    e.selectExactly(crop ? [] : [first.id]); e.setTool(crop ? "crop" : "select");
    if (crop) { e.setCropRatio(1); e.setCropRect({ x: 0, y: 0, width: 240, height: 240 }); }
  }, crop);
  if (harness) {
    await page.evaluate(async () => (await import("/tests/e2e/image-action-loading-harness.jsx")).mountImageActionHarness());
    await page.locator("#image-action-loading-harness button").first().waitFor();
  }
  await settle(page);
}

async function holdImport(page, pattern) {
  let started, release, finished;
  const began = new Promise(resolve => { started = resolve; });
  const ready = new Promise(resolve => { release = resolve; });
  const done = new Promise(resolve => { finished = resolve; });
  await page.route(pattern, async route => { started(); await ready; try { await route.continue(); } finally { finished(); } });
  return { began, release: async () => { release(); await done; await page.unroute(pattern); } };
}

await withEditorBrowser(async ({ page }) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
  await page.reload({ waitUntil: "networkidle" });
  await prepare(page);
  checks.push("ordinary New and selected images defer both image-action implementations and their planning modules");
  const before = await nodeAdjustments(page);
  const held = await holdImport(page, enhanceModule);
  try {
    await page.getByTestId("editor-taskbar-more").click();
    await page.getByTestId("more-auto-enhance").click(); await held.began;
    await page.getByTestId("editor-image-action-loading").waitFor();
    await page.getByTestId("editor-taskbar-more").click();
    await page.getByTestId("more-auto-enhance").click();
    await page.evaluate(() => window.__vooEditor.selectExactly([window.__imageActionNodes.second]));
    await held.release();
    await page.waitForFunction(() => !document.querySelector('[data-testid="editor-image-action-loading"]') &&
      window.__vooEditor.getNode(window.__imageActionNodes.first).adjustments?.brightness?.enabled);
    const after = await nodeAdjustments(page);
    assert.notDeepEqual(after[0], before[0]); assert.deepEqual(after[1], before[1]);
    assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 276, y: 116 })), "#408020");
    assert.notEqual(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 116, y: 116 })), "#444444");
    await page.evaluate(() => window.__vooEditor.undo());
    assert.deepEqual(await nodeAdjustments(page), before);
    checks.push("real cold Enhance shows loading, deduplicates repeated clicks and changes only the original image with one undo");
  } finally { await held.release(); }

  for (const mode of ["document-edit", "registry-replacement", "registry-removal", "unmount"]) {
    await prepare(page, { reload: true, harness: true });
    const original = await nodeAdjustments(page);
    const held = await holdImport(page, enhanceModule);
    try {
      await page.locator("#image-action-loading-harness").getByRole("button", { name: "Enhance", exact: true }).click();
      await held.began;
      await page.waitForFunction(() => window.__imageActionTrace.actions.imageActionPending);
      await page.evaluate(mode => {
        const trace = window.__imageActionTrace;
        if (mode === "document-edit") trace.source.updateNode(window.__imageActionNodes.first, { x: 101 });
        else if (mode === "registry-replacement") trace.replaceEngine();
        else if (mode === "registry-removal") trace.removeEngine();
        else trace.close();
        window.__imageActionHistory = JSON.stringify(trace.source.captureDocumentSession().history);
      }, mode);
      await held.release(); await page.evaluate(() => window.__imageActionTrace.lastAction);
      assert.deepEqual(await page.evaluate(() => [window.__imageActionNodes.first, window.__imageActionNodes.second]
        .map(id => window.__imageActionTrace.source.getNode(id).adjustments)), original);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__imageActionTrace.source.captureDocumentSession().history)),
        await page.evaluate(() => window.__imageActionHistory));
      await page.evaluate(mode => { if (mode !== "unmount") window.__imageActionTrace.close(); window.__imageActionTrace.dispose(); }, mode);
      checks.push(`late Enhance after ${mode} cannot mutate the old document or add a history entry`);
    } finally { await held.release(); }
  }

  await prepare(page, { reload: true });
  const original = await nodeAdjustments(page);
  await page.route(enhanceModule, route => route.abort("failed"));
  await page.getByTestId("editor-taskbar-more").click();
  await page.getByTestId("more-auto-enhance").click();
  const error = page.getByRole("alert").filter({ hasText: /enhance/i });
  await error.waitFor();
  assert.equal(await page.getByTestId("editor-image-action-loading").count(), 0);
  assert.deepEqual(await nodeAdjustments(page), original);
  await page.unroute(enhanceModule);
  await page.getByTestId("editor-taskbar-more").click();
  await page.getByTestId("more-auto-enhance").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="editor-image-action-loading"]') &&
    window.__vooEditor.getNode(window.__imageActionNodes.first).adjustments?.brightness?.enabled);
  assert.equal(await error.count(), 0);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await nodeAdjustments(page), original);
  checks.push("a failed module download preserves artwork, displays the existing alert and succeeds on the next real UI click");

  await prepare(page, { reload: true, crop: true });
  await page.evaluate(() => window.__vooEditor.setCropRatio(null));
  await page.waitForFunction(() => document.querySelector('[data-testid="crop-smart"]')?.disabled);
  assert.equal(await page.getByTestId("crop-smart").isDisabled(), true);
  assert.deepEqual(await page.evaluate(pattern => performance.getEntriesByType("resource").map(entry => entry.name)
    .filter(name => new RegExp(pattern).test(name)), cropModule.source), []);
  await page.evaluate(() => window.__vooEditor.setCropRatio(1));
  checks.push("Smart Crop stays disabled without a fixed ratio and does not download its planner");
  const cropBefore = await page.evaluate(() => window.__vooEditor.getCropRect());
  await page.getByTestId("crop-smart").click();
  await page.waitForFunction(before => JSON.stringify(window.__vooEditor.getCropRect()) !== JSON.stringify(before), cropBefore);
  const cropAfter = await page.evaluate(() => window.__vooEditor.getCropRect());
  assert.ok(cropAfter.width > 0 && cropAfter.height > 0);
  assert.ok(Math.abs(cropAfter.width / cropAfter.height - 1) < 0.01);
  await page.getByTestId("editor-properties-panel").getByRole("button", { name: "Apply", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().crop), cropAfter);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().crop ?? null), null);
  checks.push("real Smart Crop computes a nonempty ratio frame and Apply remains a single undoable crop edit");

  for (const mode of ["cancel", "ratio", "manual-frame", "registry-removal", "registry-only-replacement"]) {
    await prepare(page, { reload: true, harness: true, crop: true });
    const held = await holdImport(page, cropModule);
    try {
      await page.locator("#image-action-loading-harness").getByRole("button", { name: "Smart crop", exact: true }).click();
      await held.began;
      await page.evaluate(mode => {
        const e = window.__vooEditor;
        if (mode === "cancel") { e.cancelCrop(); e.setTool("select"); }
        else if (mode === "ratio") e.setCropRatio(4 / 3);
        else if (mode === "manual-frame") e.setCropRect({ x: 30, y: 30, width: 180, height: 180 });
        else if (mode === "registry-removal") window.__imageActionTrace.removeEngine();
        else window.__imageActionTrace.replaceEngine({ changeProp: false });
        window.__imageActionCrop = JSON.stringify(e.getCropRect());
        window.__imageActionHistory = JSON.stringify(e.captureDocumentSession().history);
      }, mode);
      await held.release(); await page.evaluate(() => window.__imageActionTrace.lastAction);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.getCropRect())), await page.evaluate(() => window.__imageActionCrop));
      assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.captureDocumentSession().history)), await page.evaluate(() => window.__imageActionHistory));
      await page.evaluate(() => window.__imageActionTrace.close());
      checks.push(`late Smart Crop after ${mode} preserves the user's newer crop state and history`);
    } finally { await held.release(); }
  }
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { openDocument: false, mcpLink: false });
