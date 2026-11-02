import { describe, expect, it } from "vitest";
import { objectStrokeMask } from "../../src/canvas/editor/object-stroke-mask.js";
describe("object stroke connected foreground", () => {
  const mask = new Uint8Array([255, 255, 0, 255, 255, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255]);
  it("selects an entire touched component from a straight scribble without filling holes", () => {
    const result = objectStrokeMask(mask, 5, 3, [{
      x: 0,
      y: 0
    }, {
      x: 0,
      y: 2
    }]);
    expect([...result]).toEqual([255, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 0, 0, 0]);
  });
  it("does not select an object when a stroke touches only the background", () => {
    expect(objectStrokeMask(mask, 5, 3, [{
      x: 2,
      y: 0
    }, {
      x: 2,
      y: 2
    }]).some(Boolean)).toBe(false);
  });
  it("samples the segments between sparse pointer events and includes both touched objects", () => {
    expect(objectStrokeMask(mask, 5, 3, [{
      x: 0,
      y: 0
    }, {
      x: 4,
      y: 0
    }])).toEqual(mask);
  });
  it("rejects a malformed matte rather than selecting arbitrary pixels", () => {
    expect(() => objectStrokeMask(mask, 3, 3, [])).toThrow(RangeError);
  });
});
