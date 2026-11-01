import { expect, it } from "vitest";
import { artworkWorldHitRegions, artworkHitPath } from "../../src/canvas/editor/free-artwork-hit-regions.js";

const rect = (id, x, y, width, height, extra = {}) => ({ id, kind: "rect", visible: true, x, y, width, height, ...extra });

it("removes only ancestor-covered descendants, retaining negative overflow and gaps", () => {
  const frame = rect("frame", 0, 0, 200, 100, { kind: "group", isFrame: true, clipContent: false });
  const children = Array.from({ length: 1000 }, (_, i) => rect(`child-${i}`, i % 100, i % 50, 20, 20, { parentId: frame.id }));
  const doc = { nodes: [frame, ...children, rect("overflow", -80, -30, 60, 40, { parentId: frame.id }),
    rect("separate", 400, 100, 20, 20)] };
  const result = artworkWorldHitRegions(doc);
  expect(result).toEqual([{ left: 0, top: 0, right: 200, bottom: 100 },
    { left: -80, top: -30, right: -20, bottom: 10 }, { left: 400, top: 100, right: 420, bottom: 120 }]);
  expect(artworkWorldHitRegions(doc)).toBe(result);
  const contains = (boxes, x, y) => boxes.some(b => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
  for (let x = -100; x < 450; x += 5) for (let y = -50; y < 150; y += 5) {
    const original = doc.nodes.some(n => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height);
    expect(contains(result, x, y)).toBe(original);
  }
  expect(artworkHitPath(doc, { stageWidth: 500, stageHeight: 300,
    viewport: { zoom: 2, panX: 200, panY: 100 } })).toContain("M32 32H168V128H32Z");
});

it("invalidates immutable geometry edits and respects hidden and clipped subtrees", () => {
  const frame = rect("frame", 0, 0, 100, 100, { kind: "group", isFrame: true });
  const outside = rect("outside", -80, -80, 20, 20, { parentId: frame.id });
  const doc = { nodes: [frame, outside] };
  expect(artworkWorldHitRegions(doc)).toEqual([{ left: 0, top: 0, right: 100, bottom: 100 }]);
  expect(artworkWorldHitRegions({ nodes: [{ ...frame, visible: false }, outside] })).toEqual([]);
  expect(artworkWorldHitRegions({ nodes: [{ ...frame, x: 200 }, outside] }))
    .toEqual([{ left: 200, top: 0, right: 300, bottom: 100 }]);
});

it("keeps a hit region when malformed ancestry forms a cycle", () => {
  const a = rect("a", 0, 0, 20, 20, { parentId: "b" });
  const b = rect("b", 0, 0, 20, 20, { parentId: "a" });
  expect(artworkWorldHitRegions({ nodes: [a, b] })).toHaveLength(2);
});
