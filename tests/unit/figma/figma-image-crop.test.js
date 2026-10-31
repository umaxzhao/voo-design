import { describe, expect, it } from "vitest";
import { figmaImagePaint } from "../../../src/canvas/figma/figma-image-paint.js";
import { imagePaintMatrix } from "../../../src/canvas/editor/image-paint-layout.js";

describe("Figma image paint semantics", () => {
  it("keeps native manual crops while ignoring inactive crop matrices on Fill", () => {
    const transform = { m00: .5, m01: 0, m02: .25, m10: 0, m11: .5, m12: .25 };
    const crop = figmaImagePaint({ imageScaleMode: "STRETCH", transform });
    expect(crop).toEqual({ imageScaleMode: "crop", imageTransform: [.5, 0, 0, .5, .25, .25] });
    expect(figmaImagePaint({ imageScaleMode: "FILL", transform })).toEqual({ imageScaleMode: "fill" });
    expect(imagePaintMatrix({ x: 10, y: 20, width: 100, height: 100, ...crop }, 200, 200))
      .toEqual([1, -0, -0, 1, -40, -30]);
  });

  it("uses image aspect ratio for Fill/Fit and respects tile scale", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(imagePaintMatrix({ ...box, imageScaleMode: "fill" }, 200, 100)).toEqual([1, 0, 0, 1, -50, 0]);
    expect(imagePaintMatrix({ ...box, imageScaleMode: "fit" }, 200, 100)).toEqual([.5, 0, 0, .5, 0, 25]);
    expect(figmaImagePaint({ imageScaleMode: "TILE", scale: .5 })).toEqual({ imageScaleMode: "tile", imageTileScale: .5 });
  });
});
