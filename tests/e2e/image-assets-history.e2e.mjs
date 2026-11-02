import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "asset-history");
  const source = () => page.evaluate(() => window.__vooEditor.exportNodePng(window.__vooEditor.getSelectedId()));
  await audit.record("full-history-retains-image-pixels-through-keyboard-delete-undo-redo", async () => {
    const node = await audit.seed();
    const original = await audit.pixels(node.id);
    const position = await page.evaluate(id => {
      const e = window.__vooEditor;
      for (let i = 0; i < 55; i += 1) e.updateNode(id, { x: 100 + i });
      return { x: e.getNode(id).x, entries: e.getHistoryEntries().length };
    }, node.id);
    assert.equal(position.entries, 50);
    assert.deepEqual(await audit.pixels(node.id), original);
    await page.evaluate(id => {
      document.activeElement?.blur();
      window.__vooEditor.selectExactly([id]);
    }, node.id);
    await page.keyboard.press("Backspace");
    await page.waitForFunction(id => !window.__vooEditor.getNode(id), node.id);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(id => Boolean(window.__vooEditor.getNode(id)), node.id);
    assert.equal(await page.evaluate(id => window.__vooEditor.getNode(id).x, node.id), position.x);
    assert.deepEqual(await audit.pixels(node.id), original);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.waitForFunction(id => !window.__vooEditor.getNode(id), node.id);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(id => Boolean(window.__vooEditor.getNode(id)), node.id);
    assert.deepEqual(await audit.pixels(node.id), original);
    return { historyCapacity: 50, geometryEdits: 55, keyboardDeleteUndoRedo: true, exactImagePixels: true };
  });
  await audit.record("pending-insert-preserves-later-edit", async () => {
    await audit.seed();
    const url = await source();
    let release;
    const ready = new Promise(resolve => {
      release = resolve;
    });
    await page.route("**/audit-delayed-image.png", async route => {
      await ready;
      await route.fulfill({
        contentType: "image/png",
        body: Buffer.from(url.split(",")[1], "base64")
      });
    });
    await page.evaluate(() => {
      window.__auditPendingInsert = window.__vooEditor.insertImage(`${location.origin}/audit-delayed-image.png`);
    });
    await tool("create_shape", {
      kind: "rect",
      name: "Later edit",
      x: 10,
      y: 10,
      width: 30,
      height: 20
    });
    release();
    const inserted = await page.evaluate(() => window.__auditPendingInsert);
    assert.ok(inserted.id);
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.some(n => n.name === "Later edit")), true);
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.some(n => n.name === "Later edit")), true);
    assert.equal(await page.evaluate(id => Boolean(window.__vooEditor.getNode(id)), inserted.id), false);
    return {
      concurrentEditRetained: true,
      undoIsolated: true
    };
  });
  await audit.record("stock-batch-undo-and-partial-failure", async () => {
    await audit.seed();
    const url = await source();
    const before = await page.evaluate(() => window.__vooEditor.serialise());
    // Deterministic provider response; all image decoding, storage and history are real.
    const result = await page.evaluate(async url => {
      const {
        stockImage
      } = await import("/src/canvas/agent/canvas_tools_assets.js");
      return stockImage({
        query: "fixture",
        count: 3
      }, {
        fetch: async () => ({
          ok: true,
          json: async () => ({
            results: [{
              url,
              title: "A",
              creator: "Fixture",
              license: "cc0"
            }, {
              url: "data:image/png;base64,invalid",
              title: "Broken"
            }, {
              url,
              title: "B",
              creator: "Fixture",
              license: "cc0"
            }]
          })
        })
      });
    }, url);
    assert.equal(result.layerIds.length, 2);
    assert.equal(result.attributions.length, 2);
    assert.equal(result.warnings.length, 1);
    for (const id of result.layerIds) assert.ok((await audit.pixels(id)).painted > 0);
    await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), before);
    return {
      twoRenderedImages: true,
      failureReported: true,
      oneUndo: true,
      upstream: "fixture"
    };
  });
  audit.finish();
});
