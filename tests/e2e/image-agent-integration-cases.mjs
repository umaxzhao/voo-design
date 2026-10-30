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
      const preview = await call("stream_layout", { html });
      assert.equal(preview.status, "streaming");
      assert.equal(await previewState(), html);
      assert.deepEqual((await doc()).nodes, before.nodes, "Streaming previews cannot alter committed artwork");
      const result = await call("stream_layout", { final: true });
      assert.equal(result.status, "committed");
      assert.ok(result.nodeCount > 0);
      const after = await doc();
      assert.ok(after.nodes.length > before.nodes.length);
      assert.ok(after.nodes.some(layer => layer.text?.includes("Stream audit")));
      assert.equal(await previewState(), null);
      await call("undo");
      assert.deepEqual((await doc()).nodes, before.nodes);
      await call("redo");
      assert.deepEqual((await doc()).nodes, after.nodes);
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
