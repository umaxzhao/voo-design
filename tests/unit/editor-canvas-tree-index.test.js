import { expect, it } from "vitest";
import { insertionSlotAt } from "../../src/canvas/editor/layer_order.js";
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
it("maps windowed row gaps back to absolute root or sibling positions", () => {
  const rows = [{
    top: 10,
    height: 30,
    position: 1500
  }, {
    top: 42,
    height: 30,
    position: 1501
  }];
  expect(insertionSlotAt(rows, 10)).toBe(1500);
  expect(insertionSlotAt(rows, 40)).toBe(1501);
  expect(insertionSlotAt(rows, 100)).toBe(1502);
  expect(insertionSlotAt([{
    top: 10,
    height: 30
  }], 100)).toBe(1);
});
