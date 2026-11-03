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
const snapshot = page => page.evaluate(async () => {
  const { useDesignStore } = await import("/src/store/design_store.js");
  const current = useDesignStore.getState();
  const engine = window.__vooEditor, doc = engine.getDocument();
  const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
  return { nodes: doc.nodes, root: doc.isCanvasRoot, width: doc.width, height: doc.height,
    board: { x: board.x, y: board.y, width: board.width, height: board.height },
    camera: structuredClone(current.editorCamera),
    layouts: current.editorArtboardLayouts instanceof Map
      ? { kind: "map", entries: structuredClone([...current.editorArtboardLayouts.entries()]) }
      : { kind: "object", value: structuredClone(current.editorArtboardLayouts) },
    history: engine.getHistoryEntries().map(({ id, name }) => ({ id, name })), selected: engine.getSelectedIds() };
});
const worldToScreen = (state, x, y) => ({ x: state.board.x + x * state.board.width / state.width,
  y: state.board.y + y * state.board.height / state.height });
async function freePoint(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="editor-pages"]');
    const screen = stage.getBoundingClientRect();
    const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    for (let y = screen.top + 18; y < Math.min(board.top - 8, screen.bottom - 18); y += 18) {
      for (let x = screen.left + 18; x < Math.min(board.left - 8, screen.right - 18); x += 18) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('[data-testid="editor-pages"]') === stage &&
            !hit.closest('button, input, textarea, select, [role="dialog"], [role="menu"], [data-testid="editor-properties-panel"], [data-testid="editor-layers-panel"]')) {
          return { x, y, tag: hit.tagName, testId: hit.closest('[data-testid]')?.getAttribute("data-testid") };
        }
      }
    }
    throw new Error("No free stage point above and left of the artboard");
  });
}
async function drag(page, a, b, screenshot) {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  if (screenshot) await page.screenshot({ path: `${out}/${screenshot}` });
  await page.mouse.up();
}
async function verify(page, label) {
  await page.getByTestId("editor-select-menu-trigger").click();
  await page.getByTestId("editor-select-menu-list").getByRole("menuitem").first().click();
  const focusState = await snapshot(page), stageFocus = worldToScreen(focusState, 80, 80);
  await page.mouse.click(stageFocus.x, stageFocus.y);
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  const initial = await snapshot(page);
  const a = worldToScreen(initial, 36, 24), b = worldToScreen(initial, 660, 440);
  const outside = await freePoint(page);
  await page.mouse.click(outside.x, outside.y);
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName,
    interactive: Boolean(document.activeElement?.closest('button, input, textarea, [role="dialog"], [data-editor-artboard-title]')) }));
  assert.equal(focus.interactive, false, `${label}: free-stage focus is not an interactive control`);
  await drag(page, outside, b, `${label}-free-marquee.png`);
  const freeAfter = await snapshot(page);
  assert.deepEqual(freeAfter.selected, ids.slice(0, 2), `${label}: free stage marquee selects exactly A and B`);
  assert.deepEqual(freeAfter.nodes, initial.nodes, `${label}: free stage marquee keeps model`);
  assert.deepEqual(freeAfter.camera, initial.camera, `${label}: free stage marquee does not pan`);
  assert.deepEqual(freeAfter.layouts, initial.layouts, `${label}: free stage marquee keeps layout`);
  assert.deepEqual(freeAfter.history, initial.history, `${label}: free stage marquee adds no history`);
  records.push({ label: `${label}-free-stage`, outside, end: b, focus,
    camera: initial.camera, afterCamera: freeAfter.camera, selected: freeAfter.selected });
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await page.mouse.move(outside.x, outside.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.keyboard.press("Escape"); await page.mouse.up();
  const freeCancelled = await snapshot(page);
  assert.deepEqual(freeCancelled.selected, [], `${label}: Escape cancels free-stage marquee`);
  assert.deepEqual(freeCancelled.nodes, initial.nodes, `${label}: cancelled free-stage marquee keeps model`);
  assert.deepEqual(freeCancelled.camera, initial.camera, `${label}: cancelled free-stage marquee keeps camera`);
  assert.deepEqual(freeCancelled.history, initial.history, `${label}: cancelled free-stage marquee adds no history`);
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
// A separate real-browser negative control proves camera and board observations
// change under Hand panning while the document model and artboard layouts do not.
await withEditorBrowser(async ({ page, tool }) => {
  await page.keyboard.press("Control+n");
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes.some(node => node.isFrame));
  const created = await snapshot(page);
  frameId = created.nodes.find(node => node.isFrame).id; ids = [];
  for (const [index, x] of [120, 360, 840].entries()) {
    const node = await tool("create_shape", { kind: "rect", name: `Pan probe ${index}`,
      x, y: 120, width: 48, height: 48, fill: "#ff0000" });
    ids.push(node.layerId);
  }
  await page.evaluate(({ ids, frameId }) => ids.forEach((id, index) => window.__vooEditor.updateNode(id,
    { parentId: frameId, x: [120, 360, 840][index], y: 120, width: 48, height: 48 })), { ids, frameId });
  const hand = page.locator('[data-testid="editor-toolbar"] button[aria-label="Hand"]').first();
  await hand.click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getTool()), "hand");
  const before = await snapshot(page), point = worldToScreen(before, 700, 500);
  const target = await page.evaluate(({ x, y }) => {
    const board = document.querySelector("[data-editor-artboard]");
    const stage = board?.firstElementChild, hit = document.elementFromPoint(x, y);
    return { insideStage: Boolean(stage && hit && stage.contains(hit)), tag: hit?.tagName,
      interactive: Boolean(hit?.closest('button, input, textarea, [role="dialog"], [data-editor-artboard-title]')) };
  }, point);
  assert.equal(target.insideStage, true, "Hand starts on the actual artboard stage");
  assert.equal(target.interactive, false, "Hand starts away from buttons and titles");
  await page.mouse.click(point.x, point.y);
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName,
    testId: document.activeElement?.getAttribute("data-testid"),
    insideEditor: Boolean(document.activeElement?.closest('[data-testid="design-editor"]')),
    insideArtboard: Boolean(document.activeElement?.closest('[data-editor-artboard]')),
    interactive: Boolean(document.activeElement?.closest('button, input, textarea, [role="dialog"], [data-editor-artboard-title]')) }));
  assert.equal(focus.insideEditor, true, "Focus remains in the editor");
  assert.equal(focus.insideArtboard, true, "Focus remains on the artboard");
  assert.equal(focus.interactive, false, "Focus is not on a toolbar or title control");
  await drag(page, point, { x: point.x + 48, y: point.y + 28 });
  await page.waitForFunction(async previous => {
    const state = (await import("/src/store/design_store.js")).useDesignStore.getState();
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    return state.editorCamera.panX !== previous.camera.panX && rect.x !== previous.board.x;
  }, before);
  const after = await snapshot(page);
  assert.notDeepEqual(after.camera, before.camera, "live camera changes after Hand pan");
  assert.notDeepEqual([after.board.x, after.board.y], [before.board.x, before.board.y], "board moves on screen");
  assert.deepEqual(after.nodes, before.nodes, "Hand pan keeps document model");
  assert.deepEqual(after.layouts, before.layouts, "Hand pan keeps artboard layout");
  records.push({ label: "hand-pan-negative-control", point, target, focus,
    before: { camera: before.camera, board: before.board, layouts: before.layouts },
    after: { camera: after.camera, board: after.board, layouts: after.layouts } });
  await page.locator('[data-testid="editor-toolbar"] button[aria-label="Select"]').first().click();
  await verify(page, "after-real-hand-pan");
  for (const kind of ["Space", "middle", "Hand"]) {
    if (kind === "Hand") {
      await page.locator('[data-testid="editor-toolbar"] button[aria-label="Hand"]').first().click();
      assert.equal(await page.evaluate(() => window.__vooEditor.getTool()), "hand");
    }
    const start = await freePoint(page), previous = await snapshot(page);
    await page.mouse.click(start.x, start.y);
    if (kind === "Space") await page.keyboard.down("Space");
    await page.mouse.move(start.x, start.y); await page.mouse.down({ button: kind === "middle" ? "middle" : "left" });
    await page.mouse.move(start.x + 30, start.y + 20, { steps: 6 });
    await page.mouse.up({ button: kind === "middle" ? "middle" : "left" });
    if (kind === "Space") await page.keyboard.up("Space");
    const next = await snapshot(page);
    assert.equal(next.camera.panX, previous.camera.panX + 30, `${kind}: camera x pans`);
    assert.equal(next.camera.panY, previous.camera.panY + 20, `${kind}: camera y pans`);
    assert.deepEqual(next.nodes, previous.nodes, `${kind}: model stays fixed`);
    assert.deepEqual(next.layouts, previous.layouts, `${kind}: layout stays fixed`);
    records.push({ label: `free-${kind}-pan`, start, before: previous.camera, after: next.camera });
  }
}, {});
await writeFile(`${out}/default-frame-marquee.json`, JSON.stringify({ zip, records }, null, 2));
console.log(JSON.stringify({ passed: "default frame marquee, reverse, shift, geometry/history and cold ZIP", records }, null, 2));
