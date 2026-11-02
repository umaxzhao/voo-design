import assert from "node:assert/strict";
import { frame, shape, nestedObjectsFixture } from "./nested-objects-fixture.mjs";

/** Real tree/keyboard and the public engine API must share relative stacking units. */
export async function checkLayerOrderContracts(page, checks) {
  const f = nestedObjectsFixture(page, "layer-order-contracts");
  const modifier = await page.evaluate(() => /Mac/.test(navigator.platform) ? "Meta" : "Control");
  const order = async () => (await f.snapshot()).nodes.map(node => node.id);
  const index = () => page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
  const row = id => page.getByTestId("editor-layers-panel").locator(`#layer-row-${id}`);
  await page.evaluate(() => { window.__layerOrderSession = window.__vooEditor.captureDocumentSession(); });
  const select = async ids => {
    await row(ids[0]).click();
    for (const id of ids.slice(1)) await row(id).click({ modifiers: [modifier] });
    assert.deepEqual(new Set(await page.evaluate(() => window.__vooEditor.getSelectedIds())), new Set(ids));
  };
  try {
    for (const direction of [1, -1]) for (const ids of [["base", "clip"], ["clip", "base"]]) {
      const masks = [shape("base", null, 100, 100, { width: 140, height: 140, maskBase: true }),
        shape("clip", null, 100, 100, { width: 140, height: 140, fill: "#00ff00", clipTo: "base" })];
      const one = shape("one", null, 100, 100, { width: 140, height: 140, fill: "#0000ff" });
      const two = shape("two", null, 100, 100, { width: 140, height: 140, fill: "#ffff00" });
      await f.seed(direction === 1 ? [...masks, one, two] : [one, two, ...masks], []);
      await select(ids); const before = await f.snapshot(), historyIndex = await index();
      await page.keyboard.press(direction === 1 ? "]" : "["); await f.settle();
      assert.deepEqual(await order(), ["one", "base", "clip", "two"]);
      assert.equal(await f.pixel({ x: 160, y: 160 }), "#ffff00");
      assert.equal((await f.node("clip")).clipTo, "base");
      for (const old of before.nodes) assert.deepEqual(await f.node(old.id), old, "Ordering must not edit geometry or references");
      assert.deepEqual(new Set(await page.evaluate(() => window.__vooEditor.getSelectedIds())), new Set(ids));
      assert.equal(await index(), historyIndex + 1);
      await f.hierarchy(); await f.history(before);
      checks.push(`relative mask ${direction}/${ids.join("/")}: one stack step, actual pixel, selection and one complete undo/redo`);
    }
    for (const kind of ["frame", "group"]) for (const direction of [1, -1]) {
      await f.seed([frame("host", 40, 40, 400, 360, { isFrame: kind === "frame", locked: true }),
        shape("a", "host", 100, 100), shape("b", "host", 100, 100, { fill: "#0000ff" })], []);
      // Exact tree selection can expose children inside a locked container.
      // Group rows select the group unit; use the public exact selection for a child.
      const id = direction === 1 ? "a" : "b";
      if (kind === "frame") await select([id]);
      else await page.evaluate(id => window.__vooEditor.selectExactly([id]), id);
      await f.focus(); const before = await f.snapshot(), historyIndex = await index();
      await page.keyboard.press(direction === 1 ? "]" : "["); await f.settle();
      assert.deepEqual(await f.snapshot(), before);
      assert.equal(await f.pixel({ x: 120, y: 120 }), "#0000ff");
      assert.equal(await index(), historyIndex);
      checks.push(`locked ${kind}/${direction}: child shortcut cannot change order, pixels or history`);
    }
    for (const direction of [1, -1]) {
      const block = [frame("host", 40, 40, 400, 360), shape("child", "host", 100, 100)];
      const other = shape("other", null, 100, 100, { fill: "#0000ff" });
      await f.seed(direction === 1 ? [...block, other] : [other, ...block], []);
      const before = await f.snapshot(), historyIndex = await index();
      await page.evaluate(direction => window.__vooEditor.reorderNode("host", direction), direction); await f.settle();
      assert.deepEqual(await order(), direction === 1 ? ["other", "host", "child"] : ["host", "child", "other"]);
      assert.equal(await f.pixel({ x: 120, y: 120 }), direction === 1 ? "#ff0000" : "#0000ff");
      assert.equal(await index(), historyIndex + 1);
      await f.hierarchy(); await f.history(before);
      checks.push(`single-node relative API/${direction}: Frame subtree stays contiguous, matching pixels and one undo/redo`);
    }
  } finally {
    await page.evaluate(() => {
      window.__vooEditor.restoreDocumentSession(window.__layerOrderSession);
      delete window.__layerOrderSession;
    });
  }
}
