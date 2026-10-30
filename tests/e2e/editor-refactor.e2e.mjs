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
  const zoomsBeforeCancel = await page.evaluate(() => window.__refactor.calls.filter(call => call.kind === "zoom").length);
  for (const [name, pointerId, x] of [["pointerdown", 5, 80], ["pointerdown", 6, 160], ["pointercancel", 5, 80], ["pointermove", 6, 240], ["pointerup", 6, 240]]) {
    await stage.dispatchEvent(name, { pointerType: "touch", pointerId, clientX: x, clientY: 200 });
  }
  assert.equal(await page.evaluate(() => window.__refactor.calls.filter(call => call.kind === "zoom").length), zoomsBeforeCancel);
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
  await page.evaluate(() => {
    const a = window.__refactor;
    a.holdImport = new Promise(resolve => { a.releaseImport = resolve; });
    a.current.media.importMediaFiles([new File(["pixels"], "tool-change.png", { type: "image/png" })]);
  });
  await page.waitForFunction(() => window.__refactor.current.media.mediaImportBusy);
  await page.evaluate(() => {
    const a = window.__refactor;
    a.engines.first.setTool("brush");
    a.releaseImport();
    a.holdImport = null;
  });
  await page.waitForFunction(() => !window.__refactor.current.media.mediaImportBusy);
  assert.equal(await page.evaluate(() => window.__refactor.engines.first.getTool()), "brush");
  checks.push("completed async image imports preserve tools chosen while decoding");
  await page.evaluate(() => window.__refactor.current.media.importMediaFiles([new File(["doc"], "captured.psd")]));
  await page.waitForFunction(() => window.__refactor.calls.some(call => call.kind === "open-document"));
  assert.equal(await page.evaluate(() => window.__refactor.calls.find(call => call.kind === "open-document").values[0]), "captured.psd");
  checks.push("media imports retain the originating engine across focus changes and PSD files reach the document opener");

  await page.evaluate(async () => {
    const a = window.__refactor;
    await a.current.image.runAutoEnhance("second");
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

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff",
      nodes: [{ ...createRectNode({ x: 100, y: 100, width: 160, height: 100, fill: "#ff0000" }), id: "touch-target" }] });
    e.setTool("select"); e.selectExactly([]); e.setSnappingEnabled(false);
    useDesignStore.setState({ pendingArtboardFitId: null, editorCamera: { zoom: 1, panX: 300, panY: 150 } });
  });
  await settled();
  const point = (x, y) => page.evaluate(({ x, y }) => {
    const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: board.left + x * board.width / doc.width, y: board.top + y * board.height / doc.height };
  }, { x, y });
  const session = await page.context().newCDPSession(page);
  const touch = (type, points) => session.send("Input.dispatchTouchEvent", {
    type, touchPoints: points.map(({ id, x, y }) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 })),
  });
  const snapshot = () => page.evaluate(() => JSON.stringify(window.__vooEditor.serialise()));
  const index = () => page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
  const beforeDrag = await snapshot(), beforeDragIndex = await index();
  await page.evaluate(() => {
    const trace = [];
    const record = event => {
      if (event.isTrusted && event.pointerType === "touch") trace.push({ type: event.type, id: event.pointerId });
    };
    const types = ["pointerdown", "pointermove", "pointerup"];
    for (const type of types) document.addEventListener(type, record, true);
    window.__pinchPointerTrace = { trace, dispose: () => types.forEach(type => document.removeEventListener(type, record, true)) };
  });
  const first = { ...await point(180, 150), id: 1 };
  await touch("touchStart", [first]);
  const moved = { ...first, x: first.x + 20, y: first.y + 10 };
  await touch("touchMove", [moved]); await settled();
  await page.evaluate(() => window.__vooEditor.flushTransforms());
  assert.deepEqual(await page.evaluate(() => {
    const n = window.__vooEditor.getNode("touch-target"); return [n.x, n.y];
  }), [120, 110], "the original real touch must start an engine drag");
  const second = { id: 2, x: moved.x + 80, y: moved.y };
  await touch("touchStart", [moved, second]); await settled();
  const takenOver = await snapshot(), takeoverIndex = await index();
  assert.notEqual(takenOver, beforeDrag);
  assert.equal(takeoverIndex, beforeDragIndex + 1, "pointer cancellation retains the engine's one-commit preview policy");
  const zoomBefore = await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().editorCamera.zoom);
  const spread = { ...second, x: second.x + 40 };
  await touch("touchMove", [moved, spread]); await settled();
  assert.ok(await page.evaluate(async previous => (await import("/src/store/design_store.js")).useDesignStore.getState().editorCamera.zoom > previous, zoomBefore));
  // Lift the first finger, then move the remaining finger. Its old captured
  // engine drag must already have ended, even though the stage still sees it.
  await touch("touchEnd", [moved]);
  await touch("touchMove", [{ ...spread, x: spread.x + 25, y: spread.y + 15 }]);
  await touch("touchEnd", []); await settled();
  const trace = await page.evaluate(() => {
    const audit = window.__pinchPointerTrace;
    audit.dispose(); delete window.__pinchPointerTrace;
    return audit.trace;
  });
  const downIds = trace.filter(event => event.type === "pointerdown").map(event => event.id);
  assert.equal(downIds.length, 2, "the browser must see exactly the original two trusted touch pointers");
  assert.deepEqual(trace.filter(event => event.type === "pointerup").map(event => event.id), downIds);
  const firstUp = trace.findIndex(event => event.type === "pointerup" && event.id === downIds[0]);
  const remainingMoves = trace.slice(firstUp + 1).filter(event => event.type === "pointermove");
  assert.ok(remainingMoves.length > 0, JSON.stringify(trace));
  assert.ok(remainingMoves.every(event => event.id === downIds[1]), "remaining movement must retain the original second pointer ID");
  assert.equal(await snapshot(), takenOver);
  assert.equal(await index(), takeoverIndex);
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 180, y: 150 })), "#ff0000");
  await tool("undo"); assert.equal(await snapshot(), beforeDrag);
  await tool("redo"); assert.equal(await snapshot(), takenOver);
  checks.push("real CDP pinch finishes the nested engine drag once, zooms without dangling movement and one undo restores the complete pre-drag document");

  await page.evaluate(() => window.__vooEditor.updateNode("touch-target", { fill: "#00ff00" }));
  const green = await snapshot(), greenIndex = await index();
  const tap = async count => {
    const fingers = await Promise.all(Array.from({ length: count }, async (_, i) => ({ ...await point(400 + i * 30, 300), id: 10 + i })));
    for (let i = 0; i < fingers.length; i++) await touch("touchStart", fingers.slice(0, i + 1));
    await touch("touchEnd", []);
  };
  await tap(2);
  await page.waitForFunction(() => window.__vooEditor.getNode("touch-target").fill === "#ff0000");
  assert.equal(await index(), greenIndex - 1);
  await tap(3);
  await page.waitForFunction(() => window.__vooEditor.getNode("touch-target").fill === "#00ff00");
  assert.equal(await snapshot(), green);
  assert.equal(await index(), greenIndex);
  checks.push("real two-finger undo and three-finger redo still own exactly one history action after pinch takeover");
  await session.detach();
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { hasTouch: true });
