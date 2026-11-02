import assert from "node:assert/strict";

/** Document tools must change the active document and retain one-step history. */
export function documentAgentCases({ call, doc }) {
  return {
    resize_document: async () => {
      const before = await doc();
      const size = (document) => ({
        width: document.width,
        height: document.height,
      });
      await call("resize_document", { width: 800, height: 500 });
      const after = await doc();
      assert.deepEqual(size(after), { width: 800, height: 500 });
      const centered = (document) =>
        document.nodes.map(({ x, y, ...layer }) => ({
          ...layer,
          x: x - document.width / 2,
          y: y - document.height / 2,
        }));
      assert.deepEqual(
        centered(after),
        centered(before),
        "Canvas resize preserves artwork around its center without scaling or reparenting",
      );
      await call("undo");
      assert.deepEqual(
        await doc(),
        before,
        "One undo restores the complete document",
      );
      await call("redo");
      assert.deepEqual(
        await doc(),
        after,
        "One redo restores the resized document",
      );
    },
  };
}
