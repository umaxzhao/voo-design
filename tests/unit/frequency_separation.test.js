import { describe, expect, it } from "vitest";
import {
  buildFrequencySeparationLayerTree,
  createFrequencySeparationPixels,
} from "../../src/canvas/editor/frequency_separation.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";

describe("Frequency Separation", () => {
  it("validates dimensions, source length, and radius", () => {
    expect(() => createFrequencySeparationPixels(new Uint8Array(4), 1, 1, 0)).toThrow(RangeError);
    expect(() => createFrequencySeparationPixels(new Uint8Array(4), 1, 1, 101)).toThrow(RangeError);
    expect(() => createFrequencySeparationPixels(new Uint8Array(4), 2, 1, 4)).toThrow(RangeError);
  });

  it("produces low and linear-light high pixels that reconstruct the input", () => {
    const input = new Uint8ClampedArray([
      20, 40, 60, 255, 80, 100, 120, 255, 140, 160, 180, 255,
    ]);
    const { low, high } = createFrequencySeparationPixels(input, 3, 1, 1);
    expect(Array.from(low)).toEqual([
      62, 82, 102, 255, 80, 100, 120, 255, 98, 118, 138, 255,
    ]);
    for (let i = 0; i < input.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const reconstructed = low[i + channel] + 2 * high[i + channel] - 256;
        expect(Math.abs(reconstructed - input[i + channel])).toBeLessThanOrEqual(1);
      }
      expect(high[i + 3]).toBe(input[i + 3]);
    }
  });

  it("stores the grouped layer tree as one history step", () => {
    const source = { id: "source", kind: "image", x: 4, y: 8, width: 3, height: 1, visible: true };
    const { group, low, high } = buildFrequencySeparationLayerTree(source, "low-image", "high-image");
    expect(group.kind).toBe("group");
    expect(low.parentId).toBe(group.id);
    expect(high.parentId).toBe(group.id);
    expect(low.imageId).toBe("low-image");
    expect(high.imageId).toBe("high-image");
    expect(high.blendMode).toBe("linear-light");
    const before = { nodes: [source] };
    const after = { nodes: [
      { ...source, visible: false },
      group,
      low,
      high,
    ] };
    const history = createHistory();
    history.reset(before);
    history.push(after, "editor.history.entry.frequencySeparation");
    expect(history.undo()).toEqual(before);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toEqual(after);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });
});
