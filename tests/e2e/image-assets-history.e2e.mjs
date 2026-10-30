import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "asset-history");
  const source = () => page.evaluate(() => window.__vooEditor.exportNodePng(window.__vooEditor.getSelectedId()));
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
