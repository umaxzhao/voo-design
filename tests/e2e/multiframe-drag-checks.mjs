import assert from "node:assert/strict";
import { frame, shape, nestedObjectsFixture } from "./nested-objects-fixture.mjs";

/** Preserve explicit multi-Frame selection across every pointer move entry. */
export async function checkMultiFrameDrag(page, checks) {
  const f = nestedObjectsFixture(page, "multiframe-drag");
  await page.evaluate(() => { window.__multiFrameSession = window.__vooEditor.captureDocumentSession(); });
  const modifier = await page.evaluate(() => /Mac/.test(navigator.platform) ? "Meta" : "Control");
  const selection = () => page.evaluate(() => window.__vooEditor.getSelectedIds());
  const historyIndex = () => page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
  const seed = async (order = ["host", "peer"], lock = null) => {
    await f.seed([frame("host", 40, 40, 300, 280),
      shape("child", "host", 110, 110, lock ? { [lock]: true } : {}),
      frame("peer", 420, 40, 280, 280), shape("peer-child", "peer", 470, 110)], []);
    const panel = page.getByTestId("editor-layers-panel");
    await panel.locator(`#layer-row-${order[0]}`).click();
    await panel.locator(`#layer-row-${order[1]}`).click({ modifiers: [modifier] });
    await f.settle();
    assert.deepEqual(new Set(await selection()), new Set(order));
    return { doc: await f.snapshot(), index: await historyIndex() };
  };
  const startPoint = async surface => {
    if (surface !== "title") return f.client(surface === "body" ? { x: 140, y: 135 } : { x: 120, y: 42 });
    const box = await page.locator('[data-testid="editor-canvas-frame-label"][data-frame-id="host"]').boundingBox();
    assert.ok(box);
    return { x: box.x + 25, y: box.y + box.height / 2 };
  };
  const begin = async surface => {
    const start = await startPoint(surface);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 8 });
    await f.settle();
  };
  const moved = async before => {
    const after = await f.snapshot();
    for (const node of after.nodes) {
      const old = before.nodes.find(source => source.id === node.id);
      assert.deepEqual([node.x - old.x, node.y - old.y], [60, 40], `${node.id} travels with the complete selection`);
      assert.equal(node.parentId, old.parentId);
    }
    assert.deepEqual(new Set(await selection()), new Set(["host", "peer"]));
    assert.equal(await f.pixel({ x: 190, y: 170 }), "#ff0000");
    assert.equal(await f.pixel({ x: 550, y: 170 }), "#ff0000");
    await f.hierarchy();
  };
  try {
    for (const order of [["host", "peer"], ["peer", "host"]]) for (const surface of ["body", "title", "edge"]) {
      const before = await seed(order);
      await begin(surface); await page.mouse.up(); await f.settle();
      await moved(before.doc);
      assert.equal(await historyIndex(), before.index + 1);
      await f.history(before.doc);
      checks.push(`multi-Frame ${order.join("/")}/${surface}: complete subtree/pixels/selection and single undo/redo`);
    }
    for (const surface of ["body", "title"]) for (const cancel of ["Escape", "pointercancel", "blur"]) {
      const before = await seed();
      await begin(surface); await moved(before.doc);
      if (cancel === "Escape") await page.keyboard.press("Escape");
      else if (cancel === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else await page.evaluate(() => {
        const stage = [...document.querySelectorAll("[data-editor-artboard] *")].find(el => el.hasPointerCapture?.(1));
        if (!stage) throw new Error("The multi-Frame drag must capture the real pointer");
        stage.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
      });
      await page.mouse.up(); await f.settle();
      assert.deepEqual(await f.snapshot(), before.doc);
      assert.deepEqual(new Set(await selection()), new Set(["host", "peer"]));
      assert.equal(await historyIndex(), before.index);
      checks.push(`multi-Frame ${surface}/${cancel}: actual move cancels geometry, selection and history atomically`);
    }
    for (const lock of ["locked", "lockPosition"]) {
      const before = await seed(undefined, lock);
      await begin("title"); await page.mouse.up(); await f.settle();
      assert.deepEqual(await f.snapshot(), before.doc);
      assert.equal(await historyIndex(), before.index);
      checks.push(`multi-Frame ${lock} descendant: no partial subtree movement or history`);
    }
    const deepBefore = await seed(), point = await startPoint("body");
    await page.keyboard.down(modifier); await begin("body"); await page.mouse.up(); await page.keyboard.up(modifier);
    await f.settle();
    assert.deepEqual(await selection(), ["child"]);
    for (const node of (await f.snapshot()).nodes) {
      const old = deepBefore.doc.nodes.find(source => source.id === node.id);
      assert.deepEqual(node, node.id === "child" ? { ...old, x: old.x + 60, y: old.y + 40 } : old);
    }
    await f.history(deepBefore.doc);
    checks.push("multi-Frame Ctrl/Meta deep drag still targets the individual child");
    const clickBefore = await seed();
    await page.mouse.click(point.x, point.y); await f.settle();
    assert.deepEqual(await selection(), ["child"]);
    assert.deepEqual(await f.snapshot(), clickBefore.doc);
    assert.equal(await historyIndex(), clickBefore.index);
    checks.push("multi-Frame plain click selects the child without a document or history edit");
  } finally {
    await page.keyboard.up(modifier); await page.mouse.up();
    await page.evaluate(() => {
      window.__vooEditor.cancelActiveGesture?.();
      window.__vooEditor.restoreDocumentSession(window.__multiFrameSession);
      delete window.__multiFrameSession;
    });
  }
}
