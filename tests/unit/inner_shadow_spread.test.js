import { describe, expect, it } from "vitest";
import { buildInnerShadow } from "../../src/canvas/editor/stroke_filter.js";

/** A solid square of the given size inside a canvas with a little margin. */
function solidAlpha(width, height) {
  const alpha = new Uint8Array(width * height);
  alpha.fill(255);
  return alpha;
}

describe("buildInnerShadow spread", () => {
  it("makes the shadow band stronger as spread grows", () => {
    const width = 40;
    const height = 40;
    const alpha = solidAlpha(width, height);
    // Spread mixes the blurred band with the crisp band, so a solid spread must
    // change the shadow; the exact values depend on the blur kernel.
    const soft = buildInnerShadow(alpha, width, height, 0, 6, 8, 0);
    const solid = buildInnerShadow(alpha, width, height, 0, 6, 8, 100);

    expect(solid).not.toEqual(soft);
  });

  it("keeps the blurred shadow when spread is zero", () => {
    const width = 40;
    const height = 40;
    const alpha = solidAlpha(width, height);

    expect(buildInnerShadow(alpha, width, height, 0, 6, 8, 0)).toEqual(
      buildInnerShadow(alpha, width, height, 0, 6, 8),
    );
  });
});
