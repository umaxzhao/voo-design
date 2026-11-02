import { describe, it, expect } from "vitest";
import { cloneStampImage } from "../../src/canvas/editor/local_inpaint.js";

/**
 * In-memory canvas stub: getImageData/putImageData share a backing store so
 * cloneStampImage can sample and write real pixels under node (no jsdom).
 */
function makeCanvas(w, h, fill = [0, 0, 0, 255]) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = fill[0];
    buf[i + 1] = fill[1];
    buf[i + 2] = fill[2];
    buf[i + 3] = fill[3];
  }
  const ctx = {
    getImageData(x, y, sw, sh) {
      const out = new Uint8ClampedArray(sw * sh * 4);
      for (let row = 0; row < sh; row += 1) {
        for (let col = 0; col < sw; col += 1) {
          const sx = x + col;
          const sy = y + row;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const si = (sy * w + sx) * 4;
          const di = (row * sw + col) * 4;
          out[di] = buf[si];
          out[di + 1] = buf[si + 1];
          out[di + 2] = buf[si + 2];
          out[di + 3] = buf[si + 3];
        }
      }
      return { data: out, width: sw, height: sh };
    },
    putImageData(imageData, dx, dy) {
      const { data, width: sw, height: sh } = imageData;
      for (let row = 0; row < sh; row += 1) {
        for (let col = 0; col < sw; col += 1) {
          const tx = dx + col;
          const ty = dy + row;
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          const si = (row * sw + col) * 4;
          const di = (ty * w + tx) * 4;
          buf[di] = data[si];
          buf[di + 1] = data[si + 1];
          buf[di + 2] = data[si + 2];
          buf[di + 3] = data[si + 3];
        }
      }
    },
    _buf: buf,
  };
  return {
    width: w,
    height: h,
    getContext: () => ctx,
    toDataURL: () => {
      let hex = "";
      for (let i = 0; i < Math.min(64, buf.length); i += 1) {
        hex += buf[i].toString(16).padStart(2, "0");
      }
      return `data:image/png;base64,${hex}`;
    },
    _ctx: ctx,
  };
}

function seedBlock(canvas, x0, y0, x1, y1, rgb) {
  const buf = canvas._ctx._buf;
  const w = canvas.width;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4;
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
      buf[i + 3] = 255;
    }
  }
}

describe("cloneStampImage", () => {
  it("returns a data URL string for a valid stamp", () => {
    const canvas = makeCanvas(100, 100, [200, 100, 50, 255]);
    const result = cloneStampImage(canvas, [{ x: 50, y: 50 }], 0, 0, 24, 1, 1, 1, null);
    expect(typeof result).toBe("string");
    expect(result.startsWith("data:")).toBe(true);
  });

  it("applies hardness=0 soft falloff without throwing", () => {
    const canvas = makeCanvas(100, 100, [10, 20, 30, 255]);
    const result = cloneStampImage(canvas, [{ x: 50, y: 50 }], 0, 0, 24, 0, 1, 1, null);
    expect(typeof result).toBe("string");
  });

  it("respects opacity < 1 without throwing", () => {
    const canvas = makeCanvas(100, 100, [255, 0, 0, 255]);
    const result = cloneStampImage(canvas, [{ x: 50, y: 50 }], 10, 0, 10, 0.5, 0.5, 1, null);
    expect(typeof result).toBe("string");
  });

  it("flow=0.5 paints less than flow=1 (pixel buffer differs)", () => {
    const canvas1 = makeCanvas(100, 100, [0, 0, 0, 255]);
    seedBlock(canvas1, 40, 40, 60, 60, [255, 255, 255]);
    const canvas2 = makeCanvas(100, 100, [0, 0, 0, 255]);
    seedBlock(canvas2, 40, 40, 60, 60, [255, 255, 255]);
    const pts = [{ x: 70, y: 70 }];
    cloneStampImage(canvas1, pts, -20, -20, 10, 1, 1, 1, null);
    cloneStampImage(canvas2, pts, -20, -20, 10, 1, 1, 0.5, null);
    // Center of dab at (70,70) should be brighter with flow=1
    const i = (70 * 100 + 70) * 4;
    expect(canvas1._ctx._buf[i]).toBeGreaterThan(canvas2._ctx._buf[i]);
  });

  it("defaults flow to 1 when omitted", () => {
    const canvas = makeCanvas(100, 100, [128, 128, 128, 255]);
    const result = cloneStampImage(canvas, [{ x: 50, y: 50 }], 0, 0, 10, 0.5, 1);
    expect(typeof result).toBe("string");
  });

  it("skips out-of-bounds source samples (no wrap)", () => {
    const canvas = makeCanvas(100, 100, [40, 40, 40, 255]);
    const before = Uint8ClampedArray.from(canvas._ctx._buf);
    const result = cloneStampImage(canvas, [{ x: 5, y: 5 }], 200, 200, 10, 1, 1, 1, null);
    expect(typeof result).toBe("string");
    const after = canvas._ctx._buf;
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 12; x += 1) {
        const i = (y * 100 + x) * 4;
        expect(after[i]).toBe(before[i]);
        expect(after[i + 1]).toBe(before[i + 1]);
        expect(after[i + 2]).toBe(before[i + 2]);
      }
    }
  });

  it("copies source pixels into the destination dab", () => {
    const canvas = makeCanvas(100, 100, [0, 0, 0, 255]);
    seedBlock(canvas, 10, 10, 30, 30, [200, 50, 25]);
    // Stamp at (50,50) sampling from (20,20) via dx=-30, dy=-30
    cloneStampImage(canvas, [{ x: 50, y: 50 }], -30, -30, 8, 1, 1, 1, null);
    const i = (50 * 100 + 50) * 4;
    expect(canvas._ctx._buf[i]).toBe(200);
    expect(canvas._ctx._buf[i + 1]).toBe(50);
    expect(canvas._ctx._buf[i + 2]).toBe(25);
  });
});
