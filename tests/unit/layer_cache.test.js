import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginLayerCacheInteraction,
  createLayerCache,
  endLayerCacheInteraction,
  isLayerCacheable,
} from "../../src/canvas/editor/layer_cache.js";

function fakeStageCtx(transform) {
  const ctx = {
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, ...transform },
    blits: [],
    getTransform: () => ({ ...ctx.transform }),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn((surface, x, y) => ctx.blits.push({ surface, x, y })),
  };
  return ctx;
}

function fakeSurfaceFactory() {
  const created = [];
  const createSurface = (width, height) => {
    const surfaceCtx = { setTransform: vi.fn() };
    const surface = { width, height, ctx: surfaceCtx, getContext: () => surfaceCtx };
    created.push(surface);
    return surface;
  };
  return { created, createSurface };
}

function shadowedRect(overrides = {}) {
  return {
    id: "r1",
    kind: "rect",
    visible: true,
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    effects: { shadow: { enabled: true, blur: 8, offsetX: 4, offsetY: 4 } },
    ...overrides,
  };
}

/** Runs one stage frame: begin, then paint each node through the cache. */
function frame(cache, ctx, nodes, paints) {
  cache.beginFrame(ctx);
  return nodes.map((node) =>
    cache.paint(ctx, node, (target) => paints.push({ id: node.id, target })),
  );
}

afterEach(() => endLayerCacheInteraction());

describe("isLayerCacheable", () => {
  it("accepts self-contained shapes with expensive effects", () => {
    expect(isLayerCacheable(shadowedRect())).toBe(true);
    expect(isLayerCacheable(shadowedRect({ kind: "ellipse" }))).toBe(true);
    expect(isLayerCacheable(shadowedRect({ kind: "path", effects: null, layerBlur: 4 }))).toBe(
      true,
    );
  });

  it("skips nodes that are cheap to paint directly", () => {
    expect(isLayerCacheable(shadowedRect({ effects: null }))).toBe(false);
    expect(
      isLayerCacheable(shadowedRect({ effects: { shadow: { enabled: false, blur: 8 } } })),
    ).toBe(false);
  });

  it("skips nodes whose pixels depend on what is under them or on loading data", () => {
    expect(isLayerCacheable(shadowedRect({ blendMode: "multiply" }))).toBe(false);
    expect(isLayerCacheable(shadowedRect({ backgroundBlur: 10 }))).toBe(false);
    expect(isLayerCacheable(shadowedRect({ clipTo: "base" }))).toBe(false);
    expect(isLayerCacheable(shadowedRect({ maskBase: true }))).toBe(false);
    expect(isLayerCacheable(shadowedRect({ kind: "image" }))).toBe(false);
    expect(isLayerCacheable(shadowedRect({ kind: "text" }))).toBe(false);
    expect(isLayerCacheable(shadowedRect({ visible: false }))).toBe(false);
  });
});

describe("createLayerCache.paint", () => {
  it("paints directly on first sight, builds once stable, then blits", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const ctx = fakeStageCtx({ a: 2, d: 2, e: 30, f: 40 });
    const node = shadowedRect();
    const paints = [];

    expect(frame(cache, ctx, [node], paints)).toEqual([false]);
    expect(created).toHaveLength(0);

    expect(frame(cache, ctx, [node], paints)).toEqual([true]);
    expect(created).toHaveLength(1);
    expect(paints).toHaveLength(1);
    expect(paints[0].target).toBe(created[0].ctx);

    expect(frame(cache, ctx, [node], paints)).toEqual([true]);
    expect(frame(cache, ctx, [node], paints)).toEqual([true]);
    // No more node paints: later frames only blit the surface.
    expect(paints).toHaveLength(1);
    expect(ctx.blits).toHaveLength(3);
    expect(new Set(ctx.blits.map((b) => b.surface))).toEqual(new Set([created[0]]));
    expect(cache.stats()).toMatchObject({ entries: 1, builds: 1, hits: 2 });
  });

  it("sizes the surface to cover the node plus its shadow in device pixels", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const ctx = fakeStageCtx({ a: 2, d: 2, e: 0, f: 0 });
    const node = shadowedRect();
    frame(cache, ctx, [node], []);
    frame(cache, ctx, [node], []);

    // Shadow reach: 2 * 8 + 4 = 20 device px = 10 world units at scale 2.
    // World x: 0..120 -> device 0..240, plus a 1px guard on each side.
    const surface = created[0];
    expect(surface.width).toBe(242);
    expect(surface.height).toBe(2 * (50 + 20) + 2);
    expect(surface.ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 1, -19);
    expect(ctx.blits[0]).toMatchObject({ x: -1, y: 19 });
  });

  it("rebuilds after the node is edited", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const ctx = fakeStageCtx();
    const node = shadowedRect();
    const paints = [];
    frame(cache, ctx, [node], paints);
    frame(cache, ctx, [node], paints);

    const edited = { ...node, width: 140 };
    expect(frame(cache, ctx, [edited], paints)).toEqual([false]);
    expect(cache.stats().entries).toBe(0);
    expect(frame(cache, ctx, [edited], paints)).toEqual([true]);
    expect(created).toHaveLength(2);
    expect(created[1].width).toBeGreaterThan(created[0].width);
  });

  it("never builds for a node that changes on every frame (the dragged layer)", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const ctx = fakeStageCtx();
    for (let i = 0; i < 10; i += 1) {
      expect(frame(cache, ctx, [shadowedRect({ x: i })], [])).toEqual([false]);
    }
    expect(created).toHaveLength(0);
  });

  it("does not build while the zoom changes, and resumes once it holds", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const node = shadowedRect();
    for (let i = 0; i < 5; i += 1) {
      const ctx = fakeStageCtx({ a: 1 + i * 0.1, d: 1 + i * 0.1 });
      expect(frame(cache, ctx, [node], [])).toEqual([false]);
    }
    expect(created).toHaveLength(0);
    const held = fakeStageCtx({ a: 1.4, d: 1.4 });
    expect(frame(cache, held, [node], [])).toEqual([true]);
    expect(created).toHaveLength(1);
  });

  it("reuses a surface at a whole-pixel pan offset at any time", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const node = shadowedRect();
    const ctx = fakeStageCtx({ e: 10.25, f: 5.5 });
    frame(cache, ctx, [node], []);
    frame(cache, ctx, [node], []);
    const first = ctx.blits[0];

    ctx.transform.e = 47.25;
    ctx.transform.f = -12.5;
    expect(frame(cache, ctx, [node], [])).toEqual([true]);
    expect(created).toHaveLength(1);
    expect(ctx.blits[1].x - first.x).toBe(37);
    expect(ctx.blits[1].y - first.y).toBe(-18);
  });

  it("reuses an off-phase surface only while the view is moving", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const node = shadowedRect();
    const ctx = fakeStageCtx({ e: 0, f: 0 });
    frame(cache, ctx, [node], []);
    frame(cache, ctx, [node], []);

    beginLayerCacheInteraction();
    ctx.transform.e = 12.4;
    expect(frame(cache, ctx, [node], [])).toEqual([true]);
    expect(created).toHaveLength(1);
    expect(Number.isInteger(ctx.blits[1].x)).toBe(true);

    // Settled at a sub-pixel phase: the exact surface is rebuilt.
    endLayerCacheInteraction();
    expect(frame(cache, ctx, [node], [])).toEqual([true]);
    expect(created).toHaveLength(2);
    expect(created[1].ctx.setTransform.mock.calls[0][4] % 1).toBeCloseTo(0.4, 5);
  });

  it("stays out of the way under a rotated or skewed stage transform", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const ctx = fakeStageCtx({ a: 0.7, b: 0.7, c: -0.7, d: 0.7 });
    const node = shadowedRect();
    expect(frame(cache, ctx, [node], [])).toEqual([false]);
    expect(frame(cache, ctx, [node], [])).toEqual([false]);
    expect(frame(cache, { drawImage() {} }, [node], [])).toEqual([false]);
    expect(created).toHaveLength(0);
  });

  it("caps surface builds per frame to keep the first stable frame short", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface, maxBuildsPerFrame: 3 });
    const ctx = fakeStageCtx();
    const nodes = Array.from({ length: 7 }, (_, i) => shadowedRect({ id: `r${i}`, x: i * 200 }));
    frame(cache, ctx, nodes, []);
    expect(frame(cache, ctx, nodes, []).filter(Boolean)).toHaveLength(3);
    expect(frame(cache, ctx, nodes, []).filter(Boolean)).toHaveLength(6);
    expect(frame(cache, ctx, nodes, []).filter(Boolean)).toHaveLength(7);
    expect(created).toHaveLength(7);
  });

  it("refuses surfaces too large to be worth caching", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface });
    const ctx = fakeStageCtx({ a: 40, d: 40 });
    const node = shadowedRect({ width: 500, height: 500 });
    frame(cache, ctx, [node], []);
    expect(frame(cache, ctx, [node], [])).toEqual([false]);
    expect(created).toHaveLength(0);
  });
});

describe("createLayerCache LRU budget", () => {
  it("evicts the least recently used surface past maxEntries", () => {
    const { created, createSurface } = fakeSurfaceFactory();
    const cache = createLayerCache({ createSurface, maxEntries: 2 });
    const ctx = fakeStageCtx();
    const a = shadowedRect({ id: "a" });
    const b = shadowedRect({ id: "b" });
    const c = shadowedRect({ id: "c" });
    frame(cache, ctx, [a, b], []);
    frame(cache, ctx, [a, b], []);
    // Touch "a" so "b" becomes the oldest entry.
    frame(cache, ctx, [a], []);
    frame(cache, ctx, [a, c], []);
    frame(cache, ctx, [a, c], []);

    expect(cache.stats()).toMatchObject({ entries: 2, evictions: 1 });
    expect(cache.get(a, 1)).not.toBeNull();
    expect(cache.get(c, 1)).not.toBeNull();
    expect(cache.get(b, 1)).toBeNull();
    // The evicted surface released its backing store.
    expect(created[1]).toMatchObject({ width: 0, height: 0 });
  });

  it("evicts past maxBytes", () => {
    const cache = createLayerCache({ maxBytes: 1000 });
    const surface = (w, h) => ({ width: w, height: h });
    cache.set(shadowedRect({ id: "a" }), surface(10, 10), 1);
    cache.set(shadowedRect({ id: "b" }), surface(10, 10), 1);
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 800 });
    cache.set(shadowedRect({ id: "c" }), surface(10, 10), 1);
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 800 });
  });
});

describe("createLayerCache get/set/invalidate", () => {
  it("keys surfaces by node object, zoom and dpr", () => {
    const cache = createLayerCache();
    const node = shadowedRect();
    const surface = { width: 4, height: 4 };
    cache.set(node, surface, 0.5, 2);
    expect(cache.get(node, 0.5, 2)).toBe(surface);
    expect(cache.get(node, 1, 1)).toBe(surface);
    expect(cache.get(node, 0.5, 1)).toBeNull();
    expect(cache.get({ ...node }, 0.5, 2)).toBeNull();
  });

  it("invalidates one node or everything", () => {
    const cache = createLayerCache();
    const a = shadowedRect({ id: "a" });
    const b = shadowedRect({ id: "b" });
    cache.set(a, { width: 2, height: 2 }, 1);
    cache.set(b, { width: 2, height: 2 }, 1);
    cache.invalidate("a");
    expect(cache.get(a, 1)).toBeNull();
    expect(cache.get(b, 1)).not.toBeNull();
    cache.clear();
    expect(cache.stats()).toMatchObject({ entries: 0, bytes: 0 });
  });
});
