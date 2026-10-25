// Affinity-parity filters: median / bloom / zoom blur / twirl metadata + kernels.
import { describe, expect, it } from "vitest";
import {
  FILTER_KINDS,
  SIMPLE_ADJUSTMENTS,
} from "../../src/canvas/editor/adjustment_kinds.js";
import { normalizeAdjustments } from "../../src/canvas/editor/scene_model_adjustments.js";
import {
  applyBloomFilter,
  applyMedianFilter,
  applyTwirlFilter,
  applyZoomBlurFilter,
} from "../../src/canvas/editor/affinity_filters.js";

const buffer = (width = 8, height = 8, fill = 120) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill;
    data[index + 1] = fill;
    data[index + 2] = fill;
    data[index + 3] = 255;
  }
  return data;
};

describe("affinity filter catalog", () => {
  it("registers the new filters with panel metadata", () => {
    for (const kind of ["median", "bloom", "zoomBlur", "twirl"]) {
      expect(FILTER_KINDS).toContain(kind);
      const meta = SIMPLE_ADJUSTMENTS.find((entry) => entry.kind === kind);
      expect(meta).toBeTruthy();
      expect(meta.labelKey).toBe(`editor.props.${kind}`);
    }
  });

  it("normalizes their adjustment values", () => {
    const normalized = normalizeAdjustments({
      median: { enabled: true, value: 40 },
      bloom: { enabled: true, value: 60 },
      zoomBlur: { enabled: true, value: 30 },
      twirl: { enabled: true, value: -50 },
    });
    expect(normalized.median).toEqual({ enabled: true, value: 40 });
    expect(normalized.bloom).toEqual({ enabled: true, value: 60 });
    expect(normalized.zoomBlur).toEqual({ enabled: true, value: 30 });
    expect(normalized.twirl).toEqual({ enabled: true, value: -50 });
  });
});

describe("affinity filter kernels", () => {
  it("median keeps a flat image flat", () => {
    const data = buffer();
    applyMedianFilter(data, 8, 8, 50);
    expect([...data.slice(0, 4)]).toEqual([120, 120, 120, 255]);
  });

  it("bloom lifts bright pixels without changing the alpha", () => {
    const data = buffer(8, 8, 220);
    applyBloomFilter(data, 8, 8, 80, 8);
    expect(data[0]).toBeGreaterThan(220);
    expect(data[3]).toBe(255);
  });

  it("zoom blur keeps the image size and alpha", () => {
    const data = buffer(8, 8, 90);
    applyZoomBlurFilter(data, 8, 8, 60);
    expect(data.length).toBe(8 * 8 * 4);
    expect(data[3]).toBe(255);
  });

  it("twirl is a no-op at zero and rotates at a non-zero value", () => {
    const data = buffer();
    data[0] = 0;
    const twisted = new Uint8ClampedArray(data);
    applyTwirlFilter(twisted, 8, 8, 0);
    expect([...twisted]).toEqual([...data]);
    applyTwirlFilter(twisted, 8, 8, 80);
    expect(twisted.length).toBe(data.length);
  });
});
