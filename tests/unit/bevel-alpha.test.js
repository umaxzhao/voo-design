import { describe, expect, it } from "vitest";
import { bevelAlphaMap } from "../../src/canvas/editor/bevel-alpha.js";
describe("bevel alpha silhouette", () => {
  const width = 20,
    height = 20;
  const alpha = new Uint8Array(width * height);
  for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) alpha[y * width + x] = 255;
  const effect = {
    size: 3,
    depth: 80,
    angle: 0,
    softness: 0
  };
  const render = patch => bevelAlphaMap(alpha, width, height, {
    ...effect,
    ...patch
  });
  it("keeps transparent holes and exterior pixels transparent", () => {
    const result = render();
    for (let i = 0; i < alpha.length; i++) if (!alpha[i]) expect(result[i * 4 + 3]).toBe(0);
    expect(result.some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
  });
  it("changes the rim with size, strength and softness", () => {
    expect(render({
      size: 7
    })).not.toEqual(render());
    expect(render({
      depth: 20
    })).not.toEqual(render());
    expect(render({
      softness: 100
    })).not.toEqual(render());
    expect(render({
      size: 0
    }).some(Boolean)).toBe(false);
    expect(render({
      depth: 0
    }).some(Boolean)).toBe(false);
  });
  it("reverses highlight and shadow when the light direction reverses", () => {
    const top = (2 * width + 10) * 4;
    expect(render()[top]).toBe(255);
    expect(render({
      angle: 180
    })[top]).toBe(0);
  });
});
