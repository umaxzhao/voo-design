import { describe, expect, it, afterEach } from "vitest";
import { DISPLAY_MAX_SIDE, downscaleForDisplay } from "../../src/canvas/editor/bitmap_cache.js";

function fakeImage(width, height) {
  return { naturalWidth: width, naturalHeight: height, width, height };
}

function installCanvasDouble(drawn) {
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args) => drawn.push(args),
      }),
    }),
  };
}

afterEach(() => {
  delete globalThis.document;
});

describe("downscaleForDisplay", () => {
  it("keeps pictures within the display limit as they are", () => {
    const image = fakeImage(1024, 768);

    expect(downscaleForDisplay(image)).toBe(image);
  });

  it("draws a picture above the limit onto a canvas at the limit's longest side", () => {
    const drawn = [];
    installCanvasDouble(drawn);
    const image = fakeImage(4096, 2048);

    const result = downscaleForDisplay(image);

    expect(result).not.toBe(image);
    expect(result.width).toBe(DISPLAY_MAX_SIDE);
    expect(result.height).toBe(DISPLAY_MAX_SIDE / 2);
    expect(drawn).toEqual([[image, 0, 0, DISPLAY_MAX_SIDE, DISPLAY_MAX_SIDE / 2]]);
  });
});
