import assert from "node:assert/strict";

/** An imported baseline picture must not be treated as a new external result. */
export async function verifyExternalImageHistory(page, id) {
  const before = await page.evaluate(id => {
    const e = window.__vooEditor;
    const session = e.captureDocumentSession();
    const image = e.getNode(id);
    const original = e.appendImageLayers;
    const pending = new Set();
    window.__externalHistory = { session, original, calls: 0, pending };
    e.appendImageLayers = function (...args) {
      window.__externalHistory.calls++;
      const promise = original.apply(this, args);
      pending.add(promise);
      promise.finally(() => pending.delete(promise));
      return promise;
    };
    for (let i = 0; i < 55; i++) e.updateNode(id, { x: image.x + i });
    e.selectExactly([id]);
    document.activeElement?.blur();
    return { count: e.getDocument().nodes.length, x: e.getNode(id).x,
      pixels: e.exportNodePng(id), history: e.getHistoryEntries().length };
  }, id);
  const settle = () => page.evaluate(async () => {
    for (let i = 0; i < 2; i++) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all([...window.__externalHistory.pending]);
    }
  });
  try {
    assert.equal(before.history, 50);
    await page.keyboard.press("Backspace");
    await page.waitForFunction(id => !window.__vooEditor.getNode(id), id);
    await settle();
    assert.equal(await page.evaluate(() => window.__externalHistory.calls), 0,
      "An existing baseline image must not be re-ingested after deletion");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), before.count - 1);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(id => Boolean(window.__vooEditor.getNode(id)), id);
    await settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.canRedo()), true);
    assert.equal(await page.evaluate(id => window.__vooEditor.getNode(id).x, id), before.x);
    assert.equal(await page.evaluate(id => window.__vooEditor.exportNodePng(id), id), before.pixels);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.waitForFunction(id => !window.__vooEditor.getNode(id), id);
    await settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), before.count - 1);
    assert.equal(await page.evaluate(() => window.__externalHistory.calls), 0);
  } finally {
    await page.evaluate(() => {
      const e = window.__vooEditor, state = window.__externalHistory;
      e.appendImageLayers = state.original;
      e.restoreDocumentSession(state.session);
      delete window.__externalHistory;
    });
  }
  return "cold imported image: 50-entry history, real delete/undo/redo, exact pixels and zero baseline re-ingestion";
}

/** Deliver through the actual store subscription, then delete/undo/redo it. */
export async function verifyNewExternalImage(page, id) {
  const delivery = await page.evaluate(async id => {
    const e = window.__vooEditor, store = window.__vooStore;
    const source = store.nodes.find(node => node.data?.editorDoc?.nodes?.some(layer => layer.id === id)) ??
      store.nodes.find(node => node.data?.editorDoc?.canvasId === e.getDocument().canvasId);
    if (!source) throw new Error("External image source page is required");
    const session = e.captureDocumentSession();
    const prepared = await e.prepareImageInsertion(e.exportNodePng(id));
    window.__externalDelivery = { session, source };
    const node = { ...e.getNode(id), id: "new-external-image", imageId: prepared.imageId, src: null };
    store.updateNodeData(source.id, { editorDoc: { ...source.data.editorDoc,
      nodes: [...source.data.editorDoc.nodes, node] } });
    return { imageId: prepared.imageId, count: e.getDocument().nodes.length };
  }, id);
  try {
    await page.waitForFunction(imageId => window.__vooEditor.getDocument().nodes.some(node => node.imageId === imageId), delivery.imageId);
    const result = await page.evaluate(imageId => {
      const nodes = window.__vooEditor.getDocument().nodes;
      return { ids: nodes.filter(node => node.imageId === imageId).map(node => node.id), count: nodes.length };
    }, delivery.imageId);
    assert.equal(result.ids.length, 1);
    assert.equal(result.count, delivery.count + 1);
    await verifyExternalImageHistory(page, result.ids[0]);
  } finally {
    await page.evaluate(() => {
      const { session, source } = window.__externalDelivery;
      window.__vooEditor.restoreDocumentSession(session);
      window.__vooStore.updateNodeData(source.id, { editorDoc: source.data.editorDoc });
      delete window.__externalDelivery;
    });
  }
  return "new store-delivered image appears once and preserves delete/undo/redo";
}
