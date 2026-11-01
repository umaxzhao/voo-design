import assert from "node:assert/strict";

/** Newly integrated tools must mutate a real document and keep one-step history. */
export function integrationAgentCases({ call, doc, node, page }) {
  const previewState = () => page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    return useDesignStore.getState().streamingPreview;
  });
  return {
    stream_layout: async () => {
      assert.equal((await call("stream_layout", { clear: true })).status, "cleared");
      const before = await doc();
      const html = '<div style="width:80px;height:50px;background:#ff00ff">Stream audit</div>';
      try {
        const preview = await call("stream_layout", { html });
        assert.equal(preview.status, "streaming");
        assert.equal(preview.preview, false);
        assert.equal(await previewState(), null);
        const partial = await doc();
        assert.ok(partial.nodes.length > before.nodes.length, "Native layers arrive before final");
        assert.deepEqual(partial.nodes.filter(layer => before.nodes.some(old => old.id === layer.id)), before.nodes);
        const placedIds = partial.nodes.filter(layer => !before.nodes.some(old => old.id === layer.id)).map(layer => layer.id);
        const result = await call("stream_layout", { final: true });
        assert.equal(result.status, "committed");
        assert.ok(result.nodeCount > 0);
        const after = await doc();
        assert.ok(after.nodes.some(layer => layer.text?.includes("Stream audit")));
        assert.deepEqual(after.nodes.filter(layer => placedIds.includes(layer.id)).map(layer => layer.id), placedIds);
        await call("undo");
        assert.deepEqual((await doc()).nodes, before.nodes);
        await call("redo");
        assert.deepEqual((await doc()).nodes, after.nodes);
      } finally { await call("stream_layout", { clear: true }); }
    },
    resize_document: async () => {
      const before = await doc();
      const dimensions = { width: before.width + 120, height: before.height + 80 };
      const result = await call("resize_document", dimensions);
      assert.equal(result.ok, true);
      const after = await doc();
      assert.equal(after.width, dimensions.width);
      assert.equal(after.height, dimensions.height);
      await call("undo");
      assert.deepEqual(await doc(), before);
      await call("redo");
      assert.deepEqual(await doc(), after);
    },
    resize_document: async () => {
      const before = await doc();
      const resized = await call("resize_document", { width: 800, height: 600 });
      assert.equal(resized.ok, true);
      assert.deepEqual([resized.width, resized.height], [800, 600]);
      const after = await doc();
      assert.deepEqual([after.width, after.height], [800, 600]);
      assert.equal(after.nodes.length, before.nodes.length, "Resizing the canvas cannot drop artwork");
      await call("undo");
      assert.deepEqual([(await doc()).width, (await doc()).height], [before.width, before.height]);
      await call("redo");
      assert.deepEqual([(await doc()).width, (await doc()).height], [800, 600]);
    },
    set_code_connect: async () => {
      const before = await node("a");
      const mapping = { componentName: "AuditButton", importPath: "@audit/components" };
      const result = await call("set_code_connect", { layerId: "a", ...mapping });
      assert.equal(result.ok, true);
      assert.deepEqual((await node("a")).codeConnect, mapping);
      await call("undo");
      assert.deepEqual(await node("a"), before);
      await call("redo");
      assert.deepEqual((await node("a")).codeConnect, mapping);
    },
  };
}
