import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const { mountEditorSessionAudit } = await import("/tests/e2e/editor-session-harness.jsx");
    window.__session = mountEditorSessionAudit();
  });
  await page.waitForFunction(() => window.__session?.current && window.__session.master.ready);
  await page.waitForFunction(() => !window.__session.current.registry.openGuard);
  const snapshot = await page.evaluate(async () => {
    const api = window.__session, registry = api.current.registry;
    api.host.updateNode("host-child", { fill: "#0000ff" });
    await registry.handleBeforeDispose(api.hostId, api.host, true);
    const saved = registry.snapshotsRef.current.get(api.hostId);
    const image = new Image(); image.src = saved.png; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const { useDesignStore } = await import("/src/store/design_store.js");
    registry.handleEngine(api.hostId, { engine: null });
    return { fill: saved.doc.nodes.find(node => node.id === "host-child").fill, dirty: saved.dirty,
      pixel: [...ctx.getImageData(40, 35, 1, 1).data],
      reader: useDesignStore.getState().editorPageDocumentReader(api.hostId).nodes.find(node => node.id === "host-child").fill };
  });
  assert.deepEqual(snapshot, { fill: "#0000ff", dirty: true, pixel: [0, 0, 255, 255], reader: "#0000ff" });
  await page.evaluate(() => {
    const api = window.__session;
    api.current.registry.handleEngine(api.hostId, { engine: api.host, ready: true, dirty: true });
  });
  assert.equal(await page.evaluate(() => window.__session.current.registry.snapshotsRef.current.has(window.__session.hostId)), false);
  checks.push("eviction snapshots keep actual edited document pixels and the document reader survives engine removal until ready replacement");

  const fallback = await page.evaluate(async () => {
    const api = window.__session, errors = [], originalError = console.error;
    const failing = Object.create(api.host);
    failing.flushPaints = async () => { throw new Error("expected-flush-failure"); };
    console.error = (...args) => errors.push(args.map(value => String(value)).join(" "));
    try {
      const pending = api.current.registry.handleBeforeDispose("failed-page", failing, true);
      const immediate = api.current.registry.snapshotsRef.current.get("failed-page");
      await pending;
      const final = api.current.registry.snapshotsRef.current.get("failed-page");
      await api.current.registry.handleBeforeDispose("unready-page", failing, false);
      return { immediate: immediate.doc.nodes[0].fill, final: final.doc.nodes[0].fill,
        png: final.png.startsWith("data:image/png"), errors, unready: api.current.registry.snapshotsRef.current.has("unready-page") };
    } finally { console.error = originalError; }
  });
  assert.equal(fallback.immediate, "#0000ff");
  assert.equal(fallback.final, "#0000ff");
  assert.equal(fallback.png, true);
  assert.equal(fallback.unready, false);
  assert.match(fallback.errors[0], /Failed to flush editor snapshot before eviction.*expected-flush-failure/);
  checks.push("failed asynchronous flush retains a synchronous durable snapshot and reports the error; unready pages do not overwrite snapshots");

  await page.evaluate(() => {
    const api = window.__session;
    api.current.registry.handleEngine("session-master", { engine: api.master.engine, ready: false });
    api.master.engine.selectExactly([]);
    api.current.navigation.handleSelectCanvasLayer("session-master", "master-child");
  });
  await settled();
  assert.deepEqual(await page.evaluate(() => window.__session.master.engine.getSelectedIds()), []);
  await page.evaluate(() => {
    const api = window.__session;
    api.current.registry.handleEngine("session-master", { engine: api.master.engine, ready: true });
  });
  await settled();
  assert.deepEqual(await page.evaluate(() => window.__session.master.engine.getSelectedIds()), ["master-child"]);
  await page.evaluate(() => window.__session.current.navigation.handleFocusCanvas(window.__session.hostId));
  await settled();
  assert.equal(await page.evaluate(() => window.__session.host.isBackgroundSelected()), true);
  assert.equal(await page.evaluate(() => window.__session.background), false);
  checks.push("cross-page layer selection waits for the actual master engine to become ready and canvas focus selects its background independently");

  await page.evaluate(() => {
    const api = window.__session;
    api.host.selectExactly(["session-instance"]);
    api.current.navigation.openCanvasSource("session-master-canvas", "session-instance");
  });
  await page.waitForFunction(() => window.__session.props.focusedId === "session-master");
  const hostId = await page.evaluate(() => window.__session.hostId);
  assert.equal(await page.evaluate(() => window.__session.current.navigation.returnCanvasId), hostId);
  await page.evaluate(() => window.__session.current.navigation.returnToCanvasInstance());
  await page.waitForFunction(() => window.__session.props.focusedId === window.__session.hostId);
  const returned = await page.evaluate(() => window.__session.current.navigation.pendingNavigationRef.current);
  assert.equal(returned.kind, "return");
  assert.deepEqual(returned.selectedIds, ["session-instance"]);
  assert.equal(returned.cameraMode, "shared");
  assert.equal(await page.evaluate(() => window.__session.current.navigation.returnCanvasId), null);
  await page.evaluate(() => window.__session.current.navigation.openCanvasSource("absent"));
  await settled();
  assert.equal(await page.evaluate(() => window.__session.current.navigation.navigationError), true);
  checks.push("component-source navigation preserves host selection/camera return context and missing sources expose the existing error state");

  await page.evaluate(() => {
    const api = window.__session;
    api.render({ focusedId: api.hostId, nodeIds: [api.hostId] });
  });
  await settled();
  await page.evaluate(() => window.__session.current.navigation.selectInstanceChild({ instanceId: "session-instance", sourceCanvasId: "session-master-canvas", nodeId: "master-child" }));
  await settled();
  assert.deepEqual(await page.evaluate(() => {
    const api = window.__session;
    return { focused: api.props.focusedId, hostId: api.hostId, open: api.openCalls.at(-1), nested: api.current.nested.nodeId,
      selected: api.host.getSelectedIds(), included: api.props.nodeIds.includes("session-master") };
  }), { focused: hostId, hostId, open: "session-master", nested: "master-child", selected: [], included: true });
  checks.push("nested child editing joins an unopened master to the session while keeping host focus and clearing its ordinary selection");

  await page.evaluate(() => {
    const api = window.__session;
    api.render({ nodeIds: [api.hostId, ...api.metadata.filter(node => node.id.startsWith("session-filler-")).map(node => node.id), "session-master"], focusedId: api.hostId });
    api.setNested(null);
  });
  await settled();
  assert.equal(await page.evaluate(() => window.__session.current.registry.activeIds.size), 12);
  assert.equal(await page.evaluate(() => window.__session.current.registry.activeIds.has("session-master")), false);
  await page.evaluate(() => {
    const api = window.__session;
    api.current.registry.handleVisibility("session-filler-13", true);
    api.setNested({ sourceCanvasId: "session-master-canvas" });
  });
  await settled();
  assert.equal(await page.evaluate(() => window.__session.current.registry.activeIds.has("session-filler-13")), true);
  assert.equal(await page.evaluate(() => window.__session.current.registry.activeIds.has("session-master")), true);
  assert.equal(await page.evaluate(() => window.__session.current.registry.activeIds.size), 13);
  checks.push("engine retention prioritizes visible pages, respects the base cap and retains the selected component master");

  const cleanup = await page.evaluate(async () => {
    const api = window.__session;
    const { emitRemoteStroke } = await import("/src/canvas/collab/stroke_bus.js");
    const strokes = [];
    api.master.engine.replayMaskStroke = stroke => strokes.push(stroke.nodeId);
    emitRemoteStroke({ nodeId: "master-child" });
    emitRemoteStroke({ nodeId: "absent-remote-child" });
    const beforeClose = [...strokes];
    api.close();
    emitRemoteStroke({ nodeId: "master-child" });
    const callsBefore = api.focusCalls.length;
    window.dispatchEvent(new CustomEvent("voo:open-canvas-source", { detail: { canvasId: "session-master-canvas" } }));
    const { useDesignStore } = await import("/src/store/design_store.js");
    return { noNewFocus: api.focusCalls.length === callsBefore,
      beforeClose, afterClose: strokes, releasedReader: api.releasedReader, readerRestored: typeof useDesignStore.getState().editorPageDocumentReader === "function" };
  });
  assert.deepEqual(cleanup, { noNewFocus: true, beforeClose: ["master-child"], afterClose: ["master-child"], releasedReader: null, readerRestored: true });
  checks.push("remote strokes route only to a matching live page; unmount removes both listeners and releases the owned reader without affecting the enclosing editor");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
