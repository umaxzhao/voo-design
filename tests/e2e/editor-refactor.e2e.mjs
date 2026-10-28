import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    window.__refactorModule = await import("/tests/e2e/editor-refactor-harness.jsx");
    window.__refactor = window.__refactorModule.mountEditorRefactorAudit();
  });
  await page.waitForFunction(() => Boolean(window.__refactor.current));
  await page.locator("#expand-audit-panel").click();
  await page.waitForFunction(() => window.__refactor.current.mobile.mobileLayersExpanded);
  const panel = page.locator("#editor-refactor-audit [data-testid=editor-layers-panel]");
  await panel.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 21, clientY: 55 });
  await panel.dispatchEvent("pointermove", { pointerType: "touch", pointerId: 21, clientY: 90 });
  await panel.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 21, clientY: 90 });
  await page.locator("#audit-panel-action").click();
  assert.deepEqual(await page.evaluate(() => ({
    layers: window.__refactor.current.mobile.mobileLayersExpanded,
    properties: window.__refactor.current.mobile.mobilePropertiesExpanded,
    clicks: window.__refactor.calls.filter(call => call.kind === "panel-click").length,
  })), { layers: false, properties: false, clicks: 0 });
  await page.locator("#audit-panel-action").click();
  assert.equal(await page.evaluate(() => window.__refactor.calls.filter(call => call.kind === "panel-click").length), 1);
  checks.push("touch-drag collapses the shared panels and suppresses only the resulting click");

  const stage = page.locator("#editor-refactor-audit [data-testid=editor-pages]");
  for (const [name, pointerId, x] of [["pointerdown", 1, 80], ["pointerdown", 2, 160], ["pointermove", 2, 200], ["pointerup", 1, 80], ["pointerup", 2, 200]]) {
    await stage.dispatchEvent(name, { pointerType: "touch", pointerId, clientX: x, clientY: 200 });
  }
  assert.equal(await page.evaluate(() => window.__refactor.calls.some(call => call.kind === "zoom" && call.values[0] === "first")), true);
  await page.evaluate(() => window.__refactor.render({ focusedId: "second", multi: true }));
  await settle();
  for (const [name, pointerId, x] of [["pointerdown", 3, 80], ["pointerdown", 4, 160], ["pointermove", 4, 240], ["pointerup", 3, 80], ["pointerup", 4, 240]]) {
    await stage.dispatchEvent(name, { pointerType: "touch", pointerId, clientX: x, clientY: 200 });
  }
  assert.equal(await page.evaluate(() => window.__refactor.camera.zoom > 1), true);
  assert.equal(await page.evaluate(() => window.__refactor.calls.some(call => call.kind === "zoom" && call.values[0] === "second")), false);
  checks.push("pinch reroutes from the current page engine to the shared camera after a prop change");

  await page.evaluate(() => {
    const a = window.__refactor;
    a.holdImport = new Promise(resolve => { a.releaseImport = resolve; });
    a.current.media.importMediaFiles([new File(["pixels"], "captured.png", { type: "image/png" })]);
  });
  await page.waitForFunction(() => window.__refactor.current.media.mediaImportBusy);
  await page.evaluate(() => { window.__refactor.render({ focusedId: "first" }); });
  await settle();
  await page.evaluate(() => { window.__refactor.releaseImport(); window.__refactor.holdImport = null; });
  await page.waitForFunction(() => !window.__refactor.current.media.mediaImportBusy);
  assert.deepEqual(await page.evaluate(() => window.__refactor.calls.filter(call => ["insert-image", "tool"].includes(call.kind))), [
    { kind: "insert-image", values: ["second", "captured.png", null] },
    { kind: "tool", values: ["second", "select"] },
  ]);
  await page.evaluate(() => window.__refactor.current.media.importMediaFiles([new File(["doc"], "captured.psd")]));
  await page.waitForFunction(() => window.__refactor.calls.some(call => call.kind === "open-document"));
  assert.equal(await page.evaluate(() => window.__refactor.calls.find(call => call.kind === "open-document").values[0]), "captured.psd");
  checks.push("media imports retain the originating engine across focus changes and PSD files reach the document opener");

  await page.evaluate(() => {
    const a = window.__refactor;
    a.current.image.runAutoEnhance("second");
    a.current.image.runPortraitRetouch("second", { smooth: 10 });
    a.current.image.runPortraitRetouch("first", { smooth: 20 });
  });
  assert.deepEqual(await page.evaluate(() => {
    const calls = window.__refactor.calls;
    return { updates: calls.filter(call => call.kind === "update").map(call => call.values.slice(0, 2)),
      retouches: calls.filter(call => call.kind === "retouch").map(call => call.values) };
  }), { updates: [["second", "second-image"]], retouches: [["first", { smooth: 20 }]] });
  checks.push("enhance uses the requested page and retouch refuses a background-page runner");

  await page.clock.install();
  await page.evaluate(() => {
    const a = window.__refactor;
    a.regionHint = "editor.region.hint";
    a.current.feedback.setSavedNotice(true);
    a.current.feedback.setApplyError("editor.applyError");
    a.render();
  });
  await page.clock.runFor(50);
  assert.equal(await page.evaluate(() => window.__refactor.current.feedback.regionHint), "editor.region.hint");
  await page.clock.runFor(1300);
  assert.equal(await page.evaluate(() => window.__refactor.current.feedback.regionHintFading), true);
  await page.clock.runFor(2000);
  assert.deepEqual(await page.evaluate(() => ({ saved: window.__refactor.current.feedback.savedNotice,
    region: window.__refactor.current.feedback.regionHint,
    error: window.__refactor.current.feedback.applyError })), { saved: false, region: null, error: "editor.applyError" });
  await page.clock.runFor(3000);
  assert.equal(await page.evaluate(() => window.__refactor.current.feedback.applyError), false);
  checks.push("save, region-fade and error feedback preserve their independent expiration times");

  await page.evaluate(async () => {
    const a = window.__refactor;
    const { emitPersistenceAlert } = await import("/src/canvas/editor/editor_persist_events.js");
    emitPersistenceAlert({ type: "persist-quota", source: "mask" });
    a.regionHint = "editor.region.error"; a.regionTone = "error"; a.render();
  });
  await page.clock.runFor(50);
  assert.deepEqual(await page.evaluate(() => window.__refactor.current.feedback.persistQuota), { source: "mask" });
  const clearedBefore = await page.evaluate(() => window.__refactor.calls.filter(call => call.kind === "clear-region").length);
  await page.evaluate(() => window.__refactor.close());
  await page.clock.runFor(9000);
  assert.equal(await page.evaluate(() => window.__refactor.calls.filter(call => call.kind === "clear-region").length), clearedBefore);
  checks.push("quota feedback persists and unmount cancels region timers before they mutate the old engine");
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { openDocument: false, mcpLink: false });
