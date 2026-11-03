import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { bindObserver, observe, project, capture, drag, dragLabel, settle, saveUi, openUi } from "./frame-overlay-audit-helpers.mjs";

const out = process.env.FRAME_OVERLAY_EVIDENCE_DIR ?? editorArtifactPath("frame-overlay-sync");
await mkdir(out, { recursive: true });
const failures = [], checkpoints = [];
let firstId, secondId, savedDoc, artifact;
const options = { preparePage: page => page.addInitScript(() => {
  window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined;
}) };
const frame = (state, id) => state.frames.find(item => item.node.id === id);
const geometry = node => [node.x, node.y, node.width, node.height, node.rotation ?? 0];
const assertNear = (a, b, message) => assert.ok(Math.abs(a - b) <= 2, `${message}: ${a} versus ${b}`);
async function checkpoint(page, name, { reference = false, selected = true } = {}) {
  await settle(page);
  const state = await capture(page, out, name, await observe(page));
  assert.ok(state.referenceSamples >= 2, `${name}: reference coordinates must be visible`);
  if (reference ? state.referenceGreenSamples < 2 : state.referenceGreenSamples !== 0) {
    failures.push({ name, failure: reference ? "Bounded page outline missing" : "Phantom reference page outline on unbounded root",
      samples: state.referenceSamples, green: state.referenceGreenSamples });
  }
  if (selected) {
    assert.ok(state.selectionSamples >= 2, `${name}: actual Frame edges must be visible`);
    assert.equal(state.selectionGreenSamples, state.selectionSamples, `${name}: selection chrome must follow the real model corners`);
  }
  checkpoints.push({ name, camera: state.camera, reference: state.referenceGreenSamples,
    selection: `${state.selectionGreenSamples}/${state.selectionSamples}`, model: state.frames.map(f => ({ id: f.node.id, geometry: geometry(f.node) })) });
  await writeFile(`${out}/failures.json`, JSON.stringify(failures, null, 2));
  return state;
}
async function session(name, callback, fixtureOptions = {}) {
  await withEditorBrowser(async ({ page }) => {
    await bindObserver(page);
    await page.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
    try { await callback(page); }
    finally {
      await page.screenshot({ path: `${out}/${name}-last.png` });
      await writeFile(`${out}/${name}-last.html`, await page.content());
      await page.context().tracing.stop({ path: `${out}/${name}-trace.zip` });
    }
  }, { ...options, ...fixtureOptions });
}
await session("default-frame", async page => {
  const initial = await observe(page);
  assert.equal(initial.doc.isCanvasRoot, true); assert.equal(initial.frames.length, 1);
  firstId = initial.frames[0].node.id;
  await capture(page, out, "00-default", initial);
  const motion = await dragLabel(page, firstId, { x: 125, y: 80 });
  let state = await observe(page);
  const moved = frame(state, firstId).node;
  assertNear(moved.x - initial.frames[0].node.x, 125 / initial.camera.zoom, "Frame model x follows actual label drag");
  assertNear(moved.y - initial.frames[0].node.y, 80 / initial.camera.zoom, "Frame model y follows actual label drag");
  assert.deepEqual(state.board, initial.board, "Root workspace layout stays independent of object movement");
  await writeFile(`${out}/mouse-drag.json`, JSON.stringify({ motion, before: initial, after: state }, null, 2));
  const panel = page.getByTestId("editor-properties-panel");
  const colour = panel.locator("[data-fill-paint-row]").first().getByRole("textbox", { name: "Custom colour", exact: true });
  await colour.fill("ffffff"); await colour.press("Enter"); await page.mouse.move(15, 300);
  state = await checkpoint(page, "01-moved-white-frame");
  const stableDoc = state.doc;
  await drag(page, { x: 700, y: 200 }, { x: -65, y: 35 }, ["Space"]);
  state = await checkpoint(page, "02-real-space-pan");
  assert.deepEqual(state.doc, stableDoc, "Pan must not change Frame model");
  const zoomBefore = state.camera.zoom;
  await page.mouse.move(600, 300); await page.keyboard.down("Control");
  await page.mouse.wheel(0, 300); await page.keyboard.up("Control");
  await page.waitForFunction(previous => window.__frameOverlayAuditStore.getState().editorCamera.zoom !== previous, zoomBefore);
  state = await checkpoint(page, "03-real-zoom-out");
  assert.ok(state.camera.zoom < zoomBefore); assert.deepEqual(state.doc, stableDoc);
  const source = frame(state, firstId).node, start = project(state, { x: source.x + 250, y: source.y + 200 });
  await drag(page, start, { x: 640 * state.camera.zoom, y: 30 * state.camera.zoom }, ["Alt"]);
  state = await observe(page); assert.equal(state.frames.length, 2, "Real Alt-drag must create a second Frame");
  secondId = state.frames.find(f => f.node.id !== firstId).node.id;
  assert.deepEqual(geometry(frame(state, firstId).node), geometry(source), "Duplicate drag preserves original Frame");
  await drag(page, { x: 700, y: 180 }, { x: 120 - state.board.x, y: 320 - state.board.y }, ["Space"]);
  state = await checkpoint(page, "04-multiple-frames");
  const rotation = panel.getByLabel("Rotation", { exact: true });
  await rotation.fill("30"); await rotation.press("Enter"); await page.mouse.move(15, 300);
  state = await checkpoint(page, "05-rotated-frame");
  assert.equal(frame(state, secondId).node.rotation, 30);
  const before = state, scale = state.camera.zoom;
  await dragLabel(page, secondId, { x: 40, y: 25 });
  const after = await checkpoint(page, "06-rotated-frame-move");
  assertNear(frame(after, secondId).node.x - frame(before, secondId).node.x, 40 / scale, "Rotated Frame drag x");
  assertNear(frame(after, secondId).node.y - frame(before, secondId).node.y, 25 / scale, "Rotated Frame drag y");
  assert.equal(frame(after, secondId).node.rotation, 30);
  assert.equal(after.history, before.history + 1, "One pointer drag is one history entry");
  await page.keyboard.press("Control+z");
  const undo = await checkpoint(page, "07-one-undo");
  assert.deepEqual(undo.doc, before.doc, "One Undo restores Frame model");
  await page.keyboard.press("Control+Shift+z");
  const redo = await checkpoint(page, "08-one-redo");
  assert.deepEqual(redo.doc, after.doc, "One Redo restores moved Frame model");
  savedDoc = redo.doc; artifact = await saveUi(page, out);
  await writeFile(`${out}/saved-artifact.json`, JSON.stringify({ artifact, savedDoc }, null, 2));
});
await session("cold-reopen", async page => {
  await openUi(page, artifact, firstId);
  let state = await observe(page);
  for (const id of [firstId, secondId]) assert.deepEqual(geometry(frame(state, id).node), geometry(savedDoc.nodes.find(n => n.id === id)), "Cold reopen retains each Frame geometry");
  assert.equal(state.doc.isCanvasRoot, true);
  const coldZoom = state.camera.zoom;
  await page.mouse.move(600, 300); await page.keyboard.down("Control");
  await page.mouse.wheel(0, 300); await page.keyboard.up("Control");
  await page.waitForFunction(previous => window.__frameOverlayAuditStore.getState().editorCamera.zoom !== previous, coldZoom);
  state = await observe(page);
  await drag(page, { x: 700, y: 180 }, { x: 120 - state.board.x, y: 320 - state.board.y }, ["Space"]);
  await page.locator(`[data-testid="editor-canvas-frame-label"][data-frame-id="${secondId}"]`).click();
  await page.mouse.move(15, 300); state = await checkpoint(page, "09-real-chooser-cold-reopen");
  const before = state;
  await dragLabel(page, secondId, { x: -30, y: 20 });
  const after = await checkpoint(page, "10-cold-frame-drag");
  assert.notDeepEqual(geometry(frame(after, secondId).node), geometry(frame(before, secondId).node));
  await page.keyboard.press("Control+z");
  const undo = await checkpoint(page, "11-cold-undo");
  assert.deepEqual(undo.doc, before.doc);
  await page.keyboard.press("Control+Shift+z");
  const redo = await checkpoint(page, "12-cold-redo");
  assert.deepEqual(redo.doc, after.doc);
}, { openDocument: false, mcpLink: false });
await session("bounded-page-control", async page => {
  // Legacy bounded-page setup only; camera acceptance still uses actual mouse input.
  await page.evaluate(() => { const e = window.__vooEditor; e.setDoc({ ...e.getDocument(), isCanvasRoot: false, nodes: [], backgroundColor: "#ffffff" }); e.selectExactly([]); });
  const before = await checkpoint(page, "13-bounded-page-outline", { reference: true, selected: false });
  await drag(page, { x: 700, y: 180 }, { x: 45, y: 30 }, ["Space"]);
  const after = await checkpoint(page, "14-bounded-page-pan", { reference: true, selected: false });
  assert.deepEqual(after.doc, before.doc);
  assertNear(after.board.x - before.board.x, 45, "Bounded page outline pan x");
});
await writeFile(`${out}/matrix.json`, JSON.stringify({ checkpoints, failures, artifact }, null, 2));
assert.equal(failures.length, 0, JSON.stringify(failures));
console.log("PASS real Frame movement/selection chrome, pan/zoom, multiple rotated Frames, one Undo/Redo, actual ZIP save/chooser cold reopen, and bounded page outline control");
