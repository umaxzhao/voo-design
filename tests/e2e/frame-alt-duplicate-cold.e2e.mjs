import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { canonicalProjectNodes } from "../../scripts/desktop-release-plan.mjs";
import { saveZipSnapshot, importZipFromWelcome } from "./uf13-pen-join-helpers.mjs";

const out = mkdtempSync(editorArtifactPath("frame-alt-duplicate-cold/run-"));
console.log(`Evidence directory: ${out}`);
const zip = `${out}/duplicate.zip`;
let beforeNodes, duplicatedNodes, originalId, cloneId, children, nestedId, clonedNestedId;
const state = page => page.evaluate(() => {
  const e = window.__vooEditor, d = e.getDocument(), box = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
  return { nodes: d.nodes, root: d.isCanvasRoot, selected: e.getSelectedIds(), history: e.getCurrentHistoryIndex(),
    board: { x: box.x, y: box.y, width: box.width, height: box.height }, width: d.width, height: d.height };
});
const screen = (s, point) => ({ x: s.board.x + point.x * s.board.width / s.width, y: s.board.y + point.y * s.board.height / s.height });
const canonical = nodes => canonicalProjectNodes(nodes);
await withEditorBrowser(async ({ page, tool }) => {
  await page.keyboard.press("Control+n");
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes.some(node => node.isFrame));
  let current = await state(page); assert.equal(current.root, true);
  const root = current.nodes.find(node => node.isFrame);
  originalId = root.id; children = [];
  await page.evaluate(({ id, width, height }) => window.__vooEditor.updateNode(id,
    { baseWidth: width, baseHeight: height }), root);
  for (const [i, x] of [120, 360, 840].entries()) {
    const result = await tool("create_shape", { kind: "rect", name: `Clone child ${i}`,
      x, y: 120, width: 48, height: 48, fill: "#ff0000" });
    children.push(result.layerId);
  }
  const nested = await tool("create_frame", { x: 800, y: 80, width: 160, height: 160, name: "Clone nested Frame", layout: "none" });
  nestedId = nested.layerId;
  await page.evaluate(({ children, originalId, nestedId }) => {
    const e = window.__vooEditor;
    e.updateNode(nestedId, { parentId: originalId, x: 800, y: 80, width: 160, height: 160, baseWidth: 160, baseHeight: 160 });
    children.forEach((id, index) => e.updateNode(id,
      { parentId: index === 2 ? nestedId : originalId, x: [120, 360, 840][index], y: 120,
        width: 48, height: 48, baseWidth: 48, baseHeight: 48 }));
  }, { children, originalId, nestedId });
  await page.getByTestId("editor-select-menu-trigger").click();
  await page.getByTestId("editor-select-menu-list").getByRole("menuitem").first().click();
  current = await state(page);
  const start = screen(current, { x: 500, y: 300 }), end = screen(current, { x: 700, y: 340 });
  await page.mouse.click(start.x, start.y);
  assert.deepEqual((await state(page)).selected, [originalId], "real click selects original Frame");
  const before = await state(page); beforeNodes = before.nodes;
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { inside: Boolean(element?.closest("[data-editor-artboard]")),
      interactive: Boolean(element?.closest('button, input, textarea, [role="dialog"], [data-editor-artboard-title]')) };
  }, start);
  assert.deepEqual(hit, { inside: true, interactive: false }, "Alt drag begins on actual Frame body");
  await page.keyboard.down("Alt"); await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.screenshot({ path: `${out}/alt-before-up.png` });
  await page.mouse.up(); await page.keyboard.up("Alt");
  const after = await state(page); duplicatedNodes = after.nodes;
  const frames = after.nodes.filter(node => node.isFrame && !node.parentId);
  assert.equal(frames.length, 2, "real Alt-drag creates exactly one top-level Frame");
  cloneId = frames.find(node => node.id !== originalId).id;
  assert.deepEqual(canonical(after.nodes.filter(node => before.nodes.some(original => original.id === node.id))), canonical(before.nodes), "original tree stays identical");
  const originals = before.nodes.filter(node => node.id !== originalId);
  const copies = after.nodes.filter(node => node.id !== cloneId && !before.nodes.some(original => original.id === node.id));
  assert.equal(copies.length, originals.length, "entire nested child tree is copied");
  clonedNestedId = copies.find(node => node.name === "Clone nested Frame")?.id;
  assert.ok(clonedNestedId, "the nested Frame is duplicated");
  assert.equal(after.history, before.history + 1, "Alt drag adds exactly one history entry");
  const frame = after.nodes.find(node => node.id === cloneId), source = before.nodes.find(node => node.id === originalId);
  const dx = frame.x - source.x, dy = frame.y - source.y;
  assert.deepEqual(canonical([{ ...frame, id: source.id, x: source.x, y: source.y }]), canonical([source]),
    "duplicated Frame retains every source property except ID and position");
  assert.ok(Math.abs(dx - 200) < 0.1 && Math.abs(dy - 40) < 0.1, `Frame delta ${dx},${dy}`);
  for (const original of originals) {
    const copy = copies.find(node => node.name === original.name); assert.ok(copy, `copied ${original.name}`);
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.parentId, original.parentId === nestedId ? clonedNestedId : cloneId, "copied parent link is remapped");
    assert.ok(Math.abs(copy.x - original.x - dx) < 1e-6 && Math.abs(copy.y - original.y - dy) < 1e-6);
    assert.deepEqual(canonical([{ ...copy, id: original.id, parentId: original.parentId, x: original.x, y: original.y }]), canonical([original]));
  }
  await page.keyboard.press("Control+z");
  const undone = await state(page); assert.deepEqual(canonical(undone.nodes), canonical(before.nodes), "one Undo removes the whole duplicate");
  assert.equal(undone.history, before.history);
  await page.keyboard.press("Control+Shift+z");
  const redone = await state(page); assert.deepEqual(canonical(redone.nodes), canonical(after.nodes), "one Redo restores the whole duplicate");
  assert.equal(redone.history, before.history + 1);
  await saveZipSnapshot(page, zip);
  await writeFile(`${out}/before-after.json`, JSON.stringify({ start, end, hit, before, after, undone, redone, cloneId }, null, 2));
}, {});
await withEditorBrowser(async ({ page }) => {
  await importZipFromWelcome(page, zip);
  const reopened = await state(page);
  assert.deepEqual(canonical(reopened.nodes), canonical(duplicatedNodes), "cold ZIP preserves all source and cloned nodes and links");
  assert.equal(reopened.nodes.filter(node => node.parentId === cloneId).length, 3);
  assert.equal(reopened.nodes.filter(node => node.parentId === clonedNestedId).length, 1);
  assert.deepEqual(canonical(reopened.nodes.filter(node => beforeNodes.some(source => source.id === node.id))), canonical(beforeNodes));
  await writeFile(`${out}/cold-open.json`, JSON.stringify(reopened, null, 2));
}, { openDocument: false });
console.log(JSON.stringify({ passed: "Alt body duplicate retains the source, child tree, one Undo/Redo and cold ZIP", originalId, cloneId, children }, null, 2));
