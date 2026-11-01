import assert from "node:assert/strict";

export async function verifyDocumentDirtyState(page, tool) {
  const measured = await page.evaluate(() => {
    const e = window.__vooEditor;
    const rect = (id, x, patch = {}) => ({ id, kind: "rect", visible: true, x, y: 0,
      width: 20, height: 20, fill: "#ff5500", ...patch });
    e.selectExactly([]);
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: true, crop: null,
      nodes: [rect("dirty-frame", 0, { kind: "group", isFrame: true, width: 100, height: 50,
        autoLayout: { direction: "horizontal" } }), rect("dirty-child", 0, { parentId: "dirty-frame" }),
      ...Array.from({ length: 1000 }, (_, i) => rect(`dirty-${i}`, 200 + i))] });
    e.markApplied();
    const applied = e.getAppliedDoc();
    const original = JSON.stringify;
    let fullSerializations = 0;
    JSON.stringify = function (value, ...args) {
      if (value?.nodes?.length === 1002) fullSerializations++;
      return original.call(this, value, ...args);
    };
    const states = [];
    try {
      for (let i = 0; i < 8; i++) {
        e.updateNode("dirty-0", { x: 201 + i }); states.push(e.isDirty());
      }
      e.updateNode("dirty-0", { x: 200 }); states.push(e.isDirty());
    } finally { JSON.stringify = original; }
    return { states, fullSerializations, baselineUnchanged: e.getAppliedDoc() === applied };
  });
  assert.deepEqual(measured.states, [...Array(8).fill(true), false]);
  assert.equal(measured.fullSerializations, 0, "Dirty checks must not serialize all 1002 nodes during isolated engine edits");
  assert.equal(measured.baselineUnchanged, true);
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly(["dirty-0"]); e.markApplied(); document.activeElement?.blur();
  });
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.__vooEditor.getNode("dirty-0").x === 201);
  assert.equal(await page.evaluate(() => window.__vooEditor.isDirty()), true);
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(() => window.__vooEditor.getNode("dirty-0").x === 200);
  assert.equal(await page.evaluate(() => window.__vooEditor.isDirty()), false);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForFunction(() => window.__vooEditor.getNode("dirty-0").x === 201);
  assert.equal(await page.evaluate(() => window.__vooEditor.isDirty()), true);
  await tool("mutate_layer_style", { layerId: "dirty-0", patch: { fill: "#3388ff" } });
  assert.equal(await page.evaluate(() => window.__vooEditor.isDirty()), true);
  await page.evaluate(() => window.__vooEditor.markApplied());
  assert.equal(await page.evaluate(() => window.__vooEditor.isDirty()), false);
  const session = await page.evaluate(() => {
    const e = window.__vooEditor; const saved = e.getAppliedDoc();
    const session = e.captureDocumentSession();
    e.updateNode("dirty-0", { x: 220 });
    const dirty = e.isDirty(); e.restoreDocumentSession(session);
    return { dirty, restoredClean: !e.isDirty(), baselineEqual: saved === e.getAppliedDoc() };
  });
  assert.deepEqual(session, { dirty: true, restoredClean: true, baselineEqual: true });
  return "saved/edited/manually restored/keyboard history/Agent/session dirty states; zero full snapshots across isolated one-node edits";
}
