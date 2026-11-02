import assert from "node:assert/strict";
import { createRectNode } from "../../src/canvas/editor/scene_model_node_builders.js";

/** Baseline defect reproduction: dragging one selected row must move the batch. */
export async function verifyLayerWindowMultiDrag({ page, tool }) {
  const nodes = Array.from({ length: 2000 }, (_, i) => ({
    ...createRectNode({ x: i % 50 * 24, y: Math.floor(i / 50) * 24, width: 18, height: 18, fill: "#ff0000" }),
    id: `large-${i}`, name: `Layer${i}`,
  }));
  await page.evaluate(nodes => {
    const engine = window.__vooEditor;
    engine.selectExactly([]);
    engine.setDoc({ ...engine.getDocument(), isCanvasRoot: true, nodes });
  }, nodes);
  const list = page.locator("[data-layers-list]");
  await page.waitForFunction(() => document.querySelector("[data-windowed-layers]"));
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.locator("#layer-row-large-0").waitFor({ state: "visible" });
  const geometry = () => page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => ({
    id: node.id, parentId: node.parentId, x: node.x, y: node.y, width: node.width, height: node.height,
  })));
  const before = await geometry();
  await page.locator('#layer-row-large-0 button[title="Rename layer"]').click();
  await page.locator('#layer-row-large-1 button[title="Rename layer"]').click({ modifiers: ["ControlOrMeta"] });
  await page.waitForFunction(() => window.__vooEditor.getSelectedIds().length === 2);
  const source = await page.locator('#layer-row-large-0 button[title="Rename layer"]').boundingBox();
  const target = await page.locator("#layer-row-large-3").boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  try { await page.mouse.move(source.x + source.width / 2, target.y + 1, { steps: 12 }); }
  finally { await page.mouse.up(); }
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.findIndex(node => node.id === "large-0") !== 0);
  const reordered = await geometry();
  assert.deepEqual(reordered.slice(0, 4).map(node => node.id), ["large-2", "large-3", "large-0", "large-1"]);
  assert.deepEqual([...reordered].sort((a, b) => a.id.localeCompare(b.id)), [...before].sort((a, b) => a.id.localeCompare(b.id)));
  assert.deepEqual(await page.evaluate(() => [...window.__vooEditor.getSelectedIds()].sort()), ["large-0", "large-1"]);
  await tool("undo");
  assert.deepEqual(await geometry(), before);
  await tool("redo");
  assert.deepEqual(await geometry(), reordered);
}
