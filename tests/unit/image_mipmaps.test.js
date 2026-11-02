import { describe, it, expect, vi } from 'vitest';
import { getMipLevel, createMipCache, getMip } from '../../src/canvas/editor/image_mipmaps.js';
import { createBitmapCache } from '../../src/canvas/editor/bitmap_cache.js';
const image = { width: 1024, height: 512 };
const createCanvas = vi.fn((width, height) => ({ width, height, getContext: () => ({ drawImage: vi.fn() }) }));
describe('image mipmaps', () => {
  it('chooses power-of-two levels without overshooting scale or minimum sides', () => {
    expect([1, .5, .49, .25, .1, .001, 0, NaN].map(scale => getMipLevel(image, scale))).toEqual([1, 1, 2, 4, 8, 32, 1, 1]);
    expect(getMipLevel({ width: 10, height: 10 }, .01)).toBe(1);
    expect(getMipLevel(null, .1)).toBe(1);
  });
  it('builds, reuses, and invalidates downscaled canvases', () => {
    createCanvas.mockClear();
    const cache = createMipCache();
    const mip = getMip(cache, image, .25, createCanvas);
    expect(mip).toMatchObject({ width: 256, height: 128 });
    expect(createCanvas).toHaveBeenCalledTimes(2);
    expect(getMip(cache, image, .25, createCanvas)).toBe(mip);
    cache.invalidate(image);
    expect(getMip(cache, image, .25, createCanvas)).not.toBe(mip);
    cache.clear();
    expect(cache.stats().entries).toBe(0);
  });
  it('falls back to originals and invalidates cached display mips on bitmap deletion', () => {
    const originalDocument = globalThis.document;
    globalThis.document = { createElement: () => createCanvas(0, 0) };
    const cache = createBitmapCache();
    try {
      cache.put({ imageId: 'a' }, image);
      const mip = cache.getDisplayBitmap(image, .25);
      expect(mip.width).toBe(256);
      expect(cache.getDisplayBitmap(image, 1)).toBe(image);
      cache.delete('a');
      expect(cache.getDisplayBitmap(image, .25)).not.toBe(mip);
    } finally { cache.dispose(); globalThis.document = originalDocument; }
  });
});
