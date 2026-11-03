import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { canonicalProjectNodes } from "../../scripts/desktop-release-plan.mjs";
import { saveZipSnapshot, importZipFromWelcome } from "./uf13-pen-join-helpers.mjs";

const out = mkdtempSync(editorArtifactPath("default-frame-marquee/run-"));
console.log(`Evidence directory: ${out}`);
await mkdir(out, { recursive: true });
const zip = `${out}/default-frame.zip`, records = [];
let ids, frameId, savedNodes;
const snapshot = page => page.evaluate(() => {
  const engine = window.__vooEditor, doc = engine.getDocument();
  const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
  return { nodes: doc.nodes, root: doc.isCanvasRoot, width: doc.width, height: doc.height,
    board: { x: board.x, y: board.y, width: board.width, height: board.height },
    camera: window.__vooStore?.editorCamera, layouts: window.__vooStore?.editorArtboardLayouts,
    history: engine.getHistoryEntries().map(({ id, name }) => ({ id, name })), selected: engine.getSelectedIds() };
});
const worldToScreen = (state, x, y) => ({ x: state.board.x + x * state.board.width / state.width,
  y: state.board.y + y * state.board.height / state.height });
async function drag(page, a, b, screenshot) {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  if (screenshot) await page.screenshot({ path: `${out}/${screenshot}` });
  await page.mouse.up();
}
async function verify(page, label) {
  await page.evaluate(() => { window.__vooEditor.selectExactly([]); window.__vooEditor.setTool("select"); });
  const initial = await snapshot(page);
  const a = worldToScreen(initial, 36, 24), b = worldToScreen(initial, 660, 440);
  await page.evaluate(id => window.__vooEditor.selectExactly([id]), frameId);
  const selectedFrameStart = worldToScreen(initial, 80, 80);
  await drag(page, selectedFrameStart, b);
  const selectedFrameResult = await snapshot(page);
  assert.deepEqual(selectedFrameResult.selected, ids.slice(0, 2), `${label}: selected Frame blank drag is marquee`);
  assert.deepEqual(selectedFrameResult.nodes, initial.nodes, `${label}: selected Frame does not move`);
  assert.deepEqual(selectedFrameResult.history, initial.history, `${label}: selected Frame marquee adds no history`);
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await drag(page, a, b, `${label}-marquee.png`);
  let after = await snapshot(page);
  assert.deepEqual(after.selected, ids.slice(0, 2), `${label}: exactly A and B`);
  assert.deepEqual(after.nodes, initial.nodes, `${label}: geometry unchanged`);
  assert.deepEqual(after.history, initial.history, `${label}: no history`);
  assert.deepEqual(after.camera, initial.camera, `${label}: camera unchanged`);
  assert.deepEqual(after.layouts, initial.layouts, `${label}: layout unchanged`);
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await drag(page, b, a);
  after = await snapshot(page); assert.deepEqual(after.selected, ids.slice(0, 2), `${label}: reverse`);
  await page.evaluate(id => window.__vooEditor.selectExactly([id]), ids[2]);
  await page.keyboard.down("Shift"); await drag(page, a, b); await page.keyboard.up("Shift");
  after = await snapshot(page); assert.deepEqual(new Set(after.selected), new Set(ids), `${label}: shift adds`);
  assert.deepEqual(after.nodes, initial.nodes, `${label}: model intact`);
  assert.deepEqual(after.history, initial.history, `${label}: no history after selections`);
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  const cancelled = await snapshot(page);
  assert.deepEqual(cancelled.selected, [], `${label}: Escape cancels marquee`);
  assert.deepEqual(cancelled.nodes, initial.nodes, `${label}: Escape keeps geometry`);
  assert.deepEqual(cancelled.history, initial.history, `${label}: Escape adds no history`);
  records.push({ label, a, b, ids, frameId, history: after.history, selected: after.selected,
    board: initial.board, camera: initial.camera, layouts: initial.layouts });
}
await withEditorBrowser(async ({ page, tool }) => {
  await page.keyboard.press("Control+n");
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes.some(node => node.isFrame));
  await page.getByTestId("editor-canvas-frame-label").first().waitFor();
  const start = await snapshot(page); assert.equal(start.root, true);
  frameId = start.nodes.find(node => node.isFrame).id; ids = [];
  for (const [index, x] of [120, 360, 840].entries()) {
    const node = await tool("create_shape", { kind: "rect", name: `Probe ${index}`, x, y: 120, width: 48, height: 48, fill: "#ff0000" });
    ids.push(node.layerId);
  }
  await page.evaluate(({ ids, frameId }) => ids.forEach((id, index) => window.__vooEditor.updateNode(id,
    { parentId: frameId, x: [120, 360, 840][index], y: 120, width: 48, height: 48 })), { ids, frameId });
  await verify(page, "before-save");
  savedNodes = (await snapshot(page)).nodes;
  await saveZipSnapshot(page, zip);
}, {});
await withEditorBrowser(async ({ page }) => {
  await importZipFromWelcome(page, zip);
  const restored = await snapshot(page);
  assert.equal(restored.root, true);
  assert.deepEqual(canonicalProjectNodes(restored.nodes), canonicalProjectNodes(savedNodes), "cold model including parent and geometry");
  await verify(page, "cold-open");
}, { openDocument: false });
await writeFile(`${out}/default-frame-marquee.json`, JSON.stringify({ zip, records }, null, 2));
console.log(JSON.stringify({ passed: "default frame marquee, reverse, shift, geometry/history and cold ZIP", records }, null, 2));
