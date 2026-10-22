import { describe, it, expect } from "vitest";
import {
  CULL_MARGIN_WORLD_PX,
  cullableNodeIds,
  isBoxOffscreen,
  visibleWorldRect,
  buildSpatialIndex,
  visibleNodeIds,
  nodeVisualAABB,
  nodeScreenEffectPad,
  maxScreenEffectPad,
  cullMarginWorld,
  syncSpatialIndex,
  attachSpatialIndex,
} from "../../src/canvas/editor/viewport_culling.js";

const VIEW = { panX: 0, panY: 0, zoom: 1 };

describe("visibleWorldRect", () => {
  it("maps the screen into world space at zoom 1 with the margin", () => {
    const rect = visibleWorldRect(VIEW, 800, 600, 0);
    expect(rect).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 600 });
  });

  it("accounts for pan and zoom", () => {
    const rect = visibleWorldRect({ panX: -200, panY: 100, zoom: 2 }, 800, 600, 0);
    expect(rect.minX).toBe(100);
    expect(rect.minY).toBe(-50);
    expect(rect.maxX).toBe(500);
    expect(rect.maxY).toBe(250);
  });

  it("grows by the default margin on every side", () => {
    const rect = visibleWorldRect(VIEW, 800, 600);
    expect(rect.minX).toBe(-CULL_MARGIN_WORLD_PX);
    expect(rect.maxY).toBe(600 + CULL_MARGIN_WORLD_PX);
  });
});

describe("isBoxOffscreen", () => {
  const visible = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("keeps boxes that overlap the rectangle", () => {
    expect(isBoxOffscreen({ x: 50, y: 50, width: 10, height: 10 }, visible)).toBe(false);
  });

  it("drops boxes entirely to one side", () => {
    expect(isBoxOffscreen({ x: 200, y: 0, width: 10, height: 10 }, visible)).toBe(true);
    expect(isBoxOffscreen({ x: 0, y: -50, width: 10, height: 10 }, visible)).toBe(true);
  });

  it("keeps a box that only touches the edge", () => {
    expect(isBoxOffscreen({ x: 100, y: 0, width: 10, height: 10 }, visible)).toBe(false);
    expect(isBoxOffscreen({ x: -10, y: 0, width: 10, height: 10 }, visible)).toBe(false);
  });
});

describe("cullableNodeIds", () => {
  it("includes plain self-contained nodes", () => {
    const doc = { nodes: [{ id: "a", kind: "rect" }, { id: "b", kind: "image" }] };
    expect([...cullableNodeIds(doc)].sort()).toEqual(["a", "b"]);
  });

  it("never culls adjustment, boolean or group nodes", () => {
    const doc = {
      nodes: [
        { id: "adj", kind: "adjustment" },
        { id: "bool", kind: "boolean" },
        { id: "grp", kind: "group" },
        { id: "plain", kind: "rect" },
      ],
    };
    expect([...cullableNodeIds(doc)]).toEqual(["plain"]);
  });

  it("keeps a clip base and its clipped layers out of culling", () => {
    const doc = {
      nodes: [
        { id: "base", kind: "image" },
        { id: "mask", kind: "rect", clipTo: "base" },
        { id: "other", kind: "rect" },
      ],
    };
    expect([...cullableNodeIds(doc)]).toEqual(["other"]);
  });

  it("lets nodes with effects be culled, since their visual bounds cover the paint", () => {
    const doc = {
      nodes: [
        { id: "arr", kind: "rect", effects: [{ type: "drop-shadow", blur: 4 }] },
        { id: "obj", kind: "rect", effects: { shadow: { enabled: true, blur: 8 } } },
      ],
    };
    expect([...cullableNodeIds(doc)].sort()).toEqual(["arr", "obj"]);
  });
});

describe("nodeVisualAABB", () => {
  const base = { id: "n", kind: "rect", x: 100, y: 100, width: 50, height: 50 };

  it("equals the geometric box when nothing paints outside it", () => {
    expect(nodeVisualAABB(base)).toEqual({ x: 100, y: 100, width: 50, height: 50 });
  });

  it("grows by the drop shadow's blur, spread and offset (object effects)", () => {
    const box = nodeVisualAABB({
      ...base,
      effects: { shadow: { enabled: true, blur: 10, spread: 3, offsetX: 7, offsetY: -12 } },
    });
    // 2 * blur + spread + max |offset| = 20 + 3 + 12
    expect(box).toEqual({ x: 65, y: 65, width: 120, height: 120 });
  });

  it("ignores disabled effects", () => {
    const box = nodeVisualAABB({
      ...base,
      effects: { shadow: { enabled: false, blur: 40 }, glow: { enabled: false, blur: 40 } },
    });
    expect(box.width).toBe(50);
  });

  it("covers outer glow, text shadow, layer blur and strokes", () => {
    expect(
      nodeVisualAABB({ ...base, effects: { glow: { enabled: true, blur: 12, spread: 4 } } }).x,
    ).toBe(100 - 28);
    expect(
      nodeVisualAABB({ ...base, shadow: { enabled: true, blur: 5, offsetX: 2, offsetY: 9 } }).x,
    ).toBe(100 - 19);
    expect(nodeVisualAABB({ ...base, layerBlur: 6 }).x).toBe(100 - 18);
    expect(nodeVisualAABB({ ...base, stroke: "#fff", strokeWidth: 4 }).x).toBe(96);
    expect(
      nodeVisualAABB({ ...base, effects: { stroke: { enabled: true, width: 9 } } }).x,
    ).toBe(91);
  });

  it("still understands array-shaped effects", () => {
    const box = nodeVisualAABB({
      ...base,
      effects: [
        { type: "drop-shadow", blur: 5, offset: { x: 3, y: 1 } },
        { type: "layer-blur", blur: 2 },
      ],
    });
    // shadow 2*5 + 3 = 13, blur 3 * 2 = 6
    expect(box.x).toBe(100 - 19);
  });
});

describe("zoom-aware shadow margin", () => {
  const doc = {
    nodes: [
      { id: "plain", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
      {
        id: "shadowed",
        kind: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        effects: { shadow: { enabled: true, blur: 50, offsetX: 100, offsetY: 0 } },
      },
    ],
  };

  it("measures canvas shadows in device pixels", () => {
    expect(nodeScreenEffectPad(doc.nodes[0])).toBe(0);
    expect(nodeScreenEffectPad(doc.nodes[1])).toBe(200);
    expect(maxScreenEffectPad(doc)).toBe(200);
  });

  it("widens the world margin as the view zooms out", () => {
    expect(cullMarginWorld(doc, 1, 1)).toBe(CULL_MARGIN_WORLD_PX + 200);
    expect(cullMarginWorld(doc, 0.1, 2)).toBe(CULL_MARGIN_WORLD_PX + 1000);
    expect(cullMarginWorld({ nodes: [doc.nodes[0]] }, 0.1, 1)).toBe(CULL_MARGIN_WORLD_PX);
  });

  it("keeps a node whose shadow reaches into view at low zoom", () => {
    const nodes = [
      {
        id: "edge",
        kind: "rect",
        x: -3000,
        y: 0,
        width: 10,
        height: 10,
        // 400 device px of reach is 4000 world px at zoom 0.1.
        effects: { shadow: { enabled: true, blur: 100, offsetX: 200, offsetY: 0 } },
      },
    ];
    const viewport = { panX: 0, panY: 0, zoom: 0.1 };
    const rect = visibleWorldRect(viewport, 800, 600, cullMarginWorld({ nodes }, 0.1, 1));
    const visible = visibleNodeIds({ nodes }, rect, buildSpatialIndex(nodes));
    expect(visible.has("edge")).toBe(true);
  });
});

describe("visibleNodeIds with SpatialIndex", () => {
  it("filters out-of-frustum cullable nodes while preserving visible ones", () => {
    const doc = {
      nodes: [
        { id: "visible-1", kind: "rect", x: 50, y: 50, width: 50, height: 50 },
        { id: "visible-2", kind: "image", x: 150, y: 150, width: 100, height: 100 },
        { id: "offscreen-far", kind: "rect", x: 2000, y: 2000, width: 50, height: 50 },
      ],
    };
    const spatialIndex = buildSpatialIndex(doc.nodes);
    expect(spatialIndex.size).toBe(3);

    const visibleRect = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
    const visible = visibleNodeIds(doc, visibleRect, spatialIndex);

    expect(visible.has("visible-1")).toBe(true);
    expect(visible.has("visible-2")).toBe(true);
    expect(visible.has("offscreen-far")).toBe(false);
  });

  it("always preserves non-cullable nodes even if their bounds are outside visible rect", () => {
    const doc = {
      nodes: [
        { id: "adj", kind: "adjustment", x: 3000, y: 3000, width: 100, height: 100 },
        { id: "grp", kind: "group", x: 3500, y: 3500, width: 100, height: 100 },
        { id: "shadowed", kind: "rect", x: 4000, y: 4000, width: 50, height: 50, effects: { shadow: { enabled: true, blur: 8 } } },
        { id: "plain-offscreen", kind: "rect", x: 5000, y: 5000, width: 50, height: 50 },
      ],
    };
    const spatialIndex = buildSpatialIndex(doc.nodes);
    const visibleRect = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
    const visible = visibleNodeIds(doc, visibleRect, spatialIndex);

    expect(visible.has("adj")).toBe(true);
    expect(visible.has("grp")).toBe(true);
    expect(visible.has("shadowed")).toBe(false);
    expect(visible.has("plain-offscreen")).toBe(false);
  });

  it("returns all node IDs when visibleRect is null", () => {
    const doc = {
      nodes: [
        { id: "a", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
        { id: "b", kind: "rect", x: 500, y: 500, width: 10, height: 10 },
      ],
    };
    const visible = visibleNodeIds(doc, null);
    expect(visible.size).toBe(2);
    expect(visible.has("a")).toBe(true);
    expect(visible.has("b")).toBe(true);
  });
});

function grid(count, size = 20, step = 50) {
  const cols = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    kind: "rect",
    x: (i % cols) * step,
    y: Math.floor(i / cols) * step,
    width: size,
    height: size,
  }));
}

function bruteForceIds(nodes, rect) {
  return nodes
    .filter((n) => {
      const b = nodeVisualAABB(n);
      return !(
        b.x + b.width <= rect.minX ||
        b.x >= rect.maxX ||
        b.y + b.height <= rect.minY ||
        b.y >= rect.maxY
      );
    })
    .map((n) => n.id)
    .sort();
}

function searchIds(index, rect) {
  return index
    .search(rect)
    .map((item) => item.id)
    .sort();
}

describe("syncSpatialIndex", () => {
  it("returns the same index untouched when the node list is unchanged", () => {
    const nodes = grid(100);
    const index = buildSpatialIndex(nodes);
    expect(syncSpatialIndex(index, nodes)).toBe(index);
  });

  it("builds a fresh index when there is none", () => {
    const nodes = grid(10);
    const index = syncSpatialIndex(null, nodes);
    expect(index.size).toBe(10);
  });

  it("moves an edited node in place instead of rebuilding", () => {
    const nodes = grid(400);
    const index = buildSpatialIndex(nodes);
    const moved = { ...nodes[0], x: 5000, y: 5000 };
    const next = [moved, ...nodes.slice(1)];

    const synced = syncSpatialIndex(index, next);
    expect(synced).toBe(index);
    expect(synced.size).toBe(400);
    expect(searchIds(synced, { minX: -1, minY: -1, maxX: 10, maxY: 10 })).toEqual([]);
    expect(
      searchIds(synced, { minX: 4990, minY: 4990, maxX: 5030, maxY: 5030 }),
    ).toEqual(["n0"]);
    expect(synced.search({ minX: 4990, minY: 4990, maxX: 5030, maxY: 5030 })[0].node).toBe(moved);
  });

  it("handles additions and removals", () => {
    const nodes = grid(200);
    const index = buildSpatialIndex(nodes);
    const added = { id: "fresh", kind: "rect", x: -500, y: -500, width: 10, height: 10 };
    const next = [...nodes.slice(5), added];

    const synced = syncSpatialIndex(index, next);
    expect(synced.size).toBe(196);
    expect(searchIds(synced, { minX: -510, minY: -510, maxX: -480, maxY: -480 })).toEqual([
      "fresh",
    ]);
    const all = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };
    expect(searchIds(synced, all)).toEqual(next.map((n) => n.id).sort());
  });

  it("falls back to a bulk rebuild when most nodes changed", () => {
    const nodes = grid(200);
    const index = buildSpatialIndex(nodes);
    const next = nodes.map((n) => ({ ...n, x: n.x + 3 }));
    const synced = syncSpatialIndex(index, next);
    expect(synced).not.toBe(index);
    const rect = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
    expect(searchIds(synced, rect)).toEqual(bruteForceIds(next, rect));
  });

  it("matches a brute-force scan over a long random edit session", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let nodes = grid(1000);
    let index = buildSpatialIndex(nodes);
    let nextId = 1000;
    for (let step = 0; step < 300; step += 1) {
      const roll = rand();
      if (roll < 0.6) {
        const i = Math.floor(rand() * nodes.length);
        nodes = nodes.map((n, j) =>
          j === i ? { ...n, x: rand() * 3000, y: rand() * 3000, width: 5 + rand() * 80 } : n,
        );
      } else if (roll < 0.8) {
        nodes = [
          ...nodes,
          { id: `n${nextId++}`, kind: "rect", x: rand() * 3000, y: rand() * 3000, width: 15, height: 15 },
        ];
      } else if (nodes.length > 1) {
        const i = Math.floor(rand() * nodes.length);
        nodes = nodes.filter((_, j) => j !== i);
      }
      index = syncSpatialIndex(index, nodes);
    }
    expect(index.size).toBe(nodes.length);
    for (let q = 0; q < 25; q += 1) {
      const x = rand() * 3000;
      const y = rand() * 3000;
      const rect = { minX: x, minY: y, maxX: x + 400, maxY: y + 300 };
      expect(searchIds(index, rect)).toEqual(bruteForceIds(nodes, rect));
    }
  });
});

describe("attachSpatialIndex", () => {
  it("does not leak the index into spread copies of the document", () => {
    const doc = { nodes: grid(3) };
    const index = buildSpatialIndex(doc.nodes);
    attachSpatialIndex(doc, index);
    expect(doc.spatialIndex).toBe(index);
    expect(Object.keys(doc)).not.toContain("spatialIndex");
    const edited = { ...doc, nodes: [] };
    expect(edited.spatialIndex).toBeUndefined();
  });

  it("can detach the index again", () => {
    const doc = { nodes: [] };
    attachSpatialIndex(doc, buildSpatialIndex([]));
    attachSpatialIndex(doc, null);
    expect(doc.spatialIndex).toBeNull();
  });
});
