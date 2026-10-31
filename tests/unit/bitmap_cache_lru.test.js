import { describe, expect, it, vi } from "vitest";
import {
  BITMAP_BYTE_BUDGET_MAX,
  calculateBitmapBytes,
  createBitmapCache,
  estimateImageBytes,
} from "../../src/canvas/editor/bitmap_cache.js";

function fakeImage(width, height) {
  return { width, height, naturalWidth: width, naturalHeight: height };
}

describe("byte-budgeted bitmap cache", () => {
  it("exports calculateBitmapBytes as the contract alias of estimateImageBytes", () => {
    const image = fakeImage(64, 32);
    expect(calculateBitmapBytes).toBe(estimateImageBytes);
    expect(calculateBitmapBytes(image)).toBe(64 * 32 * 4);
    expect(BITMAP_BYTE_BUDGET_MAX).toBe(256 * 1024 * 1024);
  });

  it("evicts oldest unpinned entries when over the byte budget and calls onEvict", () => {
    const evicted = [];
    const cache = createBitmapCache({
      maxEntries: 32,
      maxBytes: 800,
      onEvict: (image) => evicted.push(image),
    });

    const a = fakeImage(10, 10); // 400 bytes
    const b = fakeImage(10, 10);
    const c = fakeImage(10, 10);

    cache.put({ imageId: "a" }, a);
    cache.put({ imageId: "b" }, b);
    expect(cache.stats()).toMatchObject({ size: 2, totalBytes: 800 });

    cache.put({ imageId: "c" }, c);
    const stats = cache.stats();
    expect(stats.size).toBe(2);
    expect(stats.totalBytes).toBe(800);
    expect(evicted).toEqual([a]);
    // Avoid cache.get() on a missing key — that kicks off an IndexedDB load.
    expect(cache.get({ imageId: "b" })).toBe(b);
    expect(cache.get({ imageId: "c" })).toBe(c);
  });

  it("never evicts pinned keys even when over budget", () => {
    const evicted = [];
    const cache = createBitmapCache({
      maxEntries: 32,
      maxBytes: 800,
      onEvict: (image) => evicted.push(image),
    });

    const a = fakeImage(10, 10);
    const b = fakeImage(10, 10);
    const c = fakeImage(10, 10);
    cache.put({ imageId: "a" }, a);
    cache.put({ imageId: "b" }, b);
    cache.setPinnedKeys(["a"]);

    cache.put({ imageId: "c" }, c);

    expect(evicted).toEqual([b]);
    expect(cache.get({ imageId: "a" })).toBe(a);
    expect(cache.get({ imageId: "c" })).toBe(c);
  });

  it("evicts previously pinned keys after the pin set shrinks", () => {
    const evicted = [];
    const cache = createBitmapCache({
      maxEntries: 32,
      maxBytes: 400,
      onEvict: (image) => evicted.push(image),
    });

    const a = fakeImage(10, 10);
    const b = fakeImage(10, 10);
    cache.put({ imageId: "a" }, a);
    // Pin both before inserting b so the over-budget pair can coexist.
    cache.setPinnedKeys(["a", "b"]);
    cache.put({ imageId: "b" }, b);
    expect(cache.stats().size).toBe(2);

    cache.setPinnedKeys(["b"]);
    expect(evicted).toEqual([a]);
    expect(cache.stats()).toMatchObject({ size: 1, pinnedCount: 1 });
  });

  it("zeroes the byte accounting and entry count after dispose", () => {
    const evicted = [];
    const cache = createBitmapCache({ maxEntries: 32, onEvict: (image) => evicted.push(image) });
    const a = fakeImage(10, 10);
    const b = fakeImage(20, 20);
    cache.put({ imageId: "a" }, a);
    cache.put({ imageId: "b" }, b);
    expect(cache.stats().totalBytes).toBeGreaterThan(0);

    cache.dispose();

    // Diagnostics must not keep reporting bytes that were already released.
    expect(cache.stats()).toMatchObject({ size: 0, totalBytes: 0 });
    expect(evicted).toEqual(expect.arrayContaining([a, b]));
  });
});
