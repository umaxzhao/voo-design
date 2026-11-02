// UF25: Dodge/Burn with Protect tones must be a no-op at zero exposure, and the
// tone protection must never move a pixel in the opposite direction of the stroke.
import { describe, expect, it } from "vitest";
import { stampRetouch } from "../../src/canvas/editor/editor_paint_retouch.js";

/** Minimal 2D canvas double: stores RGBA bytes and exposes getImageData/putImageData. */
function makeCanvas(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixelAt(x, y), (y * width + x) * 4);
    }
  }
  const context = {
    getImageData(left, top, w, h) {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const from = ((top + y) * width + (left + x)) * 4;
          out.set(data.subarray(from, from + 4), (y * w + x) * 4);
        }
      }
      return { width: w, height: h, data: out };
    },
    putImageData(image, left, top) {
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const to = ((top + y) * width + (left + x)) * 4;
          data.set(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4), to);
        }
      }
    },
  };
  return { width, height, data, getContext: () => context };
}

const uniform = (value) => () => [value, value, value, 255];

/** Dodge/Burn stroke over the canvas centre; exposure and strength are both set so either field resolves. */
const stroke = (mode, patch) => ({
  mode,
  exposure: 1,
  strength: 1,
  flow: 1,
  opacity: 1,
  hardness: 1,
  tonalRange: "midtones",
  protectLuminosity: true,
  ...patch,
});

const CENTRE = { x: 5, y: 5, diameter: 8, coverage: 1 };

function run(canvas, paintEdit) {
  stampRetouch(canvas, CENTRE.x, CENTRE.y, CENTRE.diameter, CENTRE.coverage, paintEdit);
  return canvas;
}

describe("UF25 dodge protect tones", () => {
  it("leaves every RGBA byte unchanged at zero exposure with Protect tones on", () => {
    const pixelAt = (x, y) => [(x * 29 + y * 17) % 256, (x * 7 + y * 53) % 256, (x * 91 + y * 3) % 256, (x * 11 + y * 5) % 256];
    const canvas = makeCanvas(11, 11, pixelAt);
    const before = new Uint8ClampedArray(canvas.data);
    run(canvas, stroke("dodge", { exposure: 0, strength: 0, flow: 1 }));
    expect(canvas.data).toEqual(before);
  });

  it("leaves a bright 239 channel unchanged at zero exposure with Protect tones on", () => {
    const canvas = makeCanvas(11, 11, uniform(239));
    run(canvas, stroke("dodge", { exposure: 0, strength: 0 }));
    expect(canvas.data.every((byte, index) => index % 4 === 3 || byte === 239)).toBe(true);
  });

  it("brightens midtones with positive exposure", () => {
    const canvas = makeCanvas(11, 11, uniform(100));
    run(canvas, stroke("dodge", { protectLuminosity: false }));
    const centre = (5 * 11 + 5) * 4;
    expect(canvas.data[centre]).toBeGreaterThan(100);
  });

  it("with Protect tones on, caps brightening at 235 but never darkens an already bright pixel", () => {
    const canvas = makeCanvas(11, 11, uniform(239));
    run(canvas, stroke("dodge", { protectLuminosity: true }));
    const centre = (5 * 11 + 5) * 4;
    expect(canvas.data[centre]).toBe(239);
    expect(canvas.data[centre + 3]).toBe(255);
  });

  it("with Protect tones off, positive exposure is allowed to push a 239 channel brighter", () => {
    const canvas = makeCanvas(11, 11, uniform(239));
    run(canvas, stroke("dodge", { protectLuminosity: false }));
    const centre = (5 * 11 + 5) * 4;
    expect(canvas.data[centre]).toBeGreaterThan(239);
  });

  it("with Protect tones on, caps a dodged midtone at 235", () => {
    const canvas = makeCanvas(11, 11, uniform(200));
    run(canvas, stroke("dodge", { protectLuminosity: true }));
    const centre = (5 * 11 + 5) * 4;
    expect(canvas.data[centre]).toBeGreaterThan(200);
    expect(canvas.data[centre]).toBeLessThanOrEqual(235);
  });

  it("burn with Protect tones on never lifts a dark pixel above its original value", () => {
    const canvas = makeCanvas(11, 11, uniform(10));
    run(canvas, stroke("burn", { protectLuminosity: true }));
    const centre = (5 * 11 + 5) * 4;
    expect(canvas.data[centre]).toBeLessThanOrEqual(10);
  });

  it("burn with zero exposure keeps a dark pixel unchanged with Protect tones on", () => {
    const canvas = makeCanvas(11, 11, uniform(10));
    run(canvas, stroke("burn", { exposure: 0, strength: 0, protectLuminosity: true }));
    const centre = (5 * 11 + 5) * 4;
    expect(canvas.data[centre]).toBe(10);
  });
});
