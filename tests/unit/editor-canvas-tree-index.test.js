import { expect, it } from "vitest";
import { buildVisibleTreeItems } from "../../src/canvas/components/editor_canvas_tree_items.js";
it("indexes child presence once while preserving visible tree order and parent semantics", () => {
  let parentReads = 0;
  const rows = Array.from({
    length: 2000
  }, (_, index) => ({
    node: {
      id: `node-${index}`,
      kind: index === 0 ? "group" : "rect",
      get parentId() {
        parentReads++;
        return index === 1 ? "node-0" : null;
      }
    },
    index,
    depth: index === 1 ? 1 : 0
  }));
  const items = buildVisibleTreeItems({
    activeRows: rows
  });
  expect(items).toHaveLength(rows.length);
  expect(items[0]).toMatchObject({
    layerId: "node-0",
    hasChildren: true,
    isExpanded: true
  });
  expect(items[1]).toMatchObject({
    layerId: "node-1",
    parentId: "node-0",
    depth: 1
  });
  expect(items.at(-1).hasChildren).toBe(false);
  expect(parentReads).toBeLessThanOrEqual(rows.length * 2);
});
