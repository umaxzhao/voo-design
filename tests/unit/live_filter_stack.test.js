import { describe, it, expect } from "vitest";
import {
  createLiveFilterEntry,
  normalizeLiveFilterStack,
  applyLiveFilterStack,
  LIVE_FILTER_KINDS,
} from "../../src/canvas/editor/live_filter_stack.js";

function solid(w, h, r, g, b, a = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return data;
}

describe("LIVE_FILTER_KINDS", () => {
  it("includes Affinity-style live filter kinds", () => {
    expect(LIVE_FILTER_KINDS).toContain("blur");
    expect(LIVE_FILTER_KINDS).toContain("sharpen");
    expect(LIVE_FILTER_KINDS).toContain("highPass");
    expect(LIVE_FILTER_KINDS).toContain("clarity");
    expect(LIVE_FILTER_KINDS).toContain("motionBlur");
    expect(LIVE_FILTER_KINDS).toContain("sepia");
    expect(LIVE_FILTER_KINDS).toContain("pixelate");
  });
});

describe("createLiveFilterEntry", () => {
  it("creates an entry with defaults", () => {
    const entry = createLiveFilterEntry("blur", { radius: 5 });
    expect(entry.kind).toBe("blur");
    expect(entry.enabled).toBe(true);
    expect(entry.opacity).toBe(1);
    expect(entry.params.radius).toBe(5);
    expect(typeof entry.id).toBe("string");
    expect(entry.id.length).toBeGreaterThan(0);
  });

  it("respects enabled and opacity overrides", () => {
    const entry = createLiveFilterEntry("sepia", {
      amount: 100,
      enabled: false,
      opacity: 0.5,
    });
    expect(entry.enabled).toBe(false);
    expect(entry.opacity).toBe(0.5);
    expect(entry.params.amount).toBe(100);
    expect(entry.params.enabled).toBeUndefined();
  });
});

describe("normalizeLiveFilterStack", () => {
  it("filters unknown kinds and clamps opacity", () => {
    const stack = normalizeLiveFilterStack([
      { kind: "blur", opacity: 2, params: { radius: 3 } },
      { kind: "unknown-filter", params: {} },
      { kind: "sharpen", enabled: false, opacity: -1 },
    ]);
    expect(stack).toHaveLength(2);
    expect(stack[0].kind).toBe("blur");
    expect(stack[0].opacity).toBe(1);
    expect(stack[1].kind).toBe("sharpen");
    expect(stack[1].enabled).toBe(false);
    expect(stack[1].opacity).toBe(0);
  });

  it("returns empty for non-array", () => {
    expect(normalizeLiveFilterStack(null)).toEqual([]);
    expect(normalizeLiveFilterStack(undefined)).toEqual([]);
  });
});

describe("applyLiveFilterStack", () => {
  it("applies blur and preserves buffer length", () => {
    const data = solid(4, 4, 255, 0, 0);
    data[0] = 0;
    data[1] = 0;
    data[2] = 0;
    const stack = [createLiveFilterEntry("blur", { radius: 5 })];
    const result = applyLiveFilterStack(data, 4, 4, stack);
    expect(result.length).toBe(64);
  });

  it("skips disabled entries", () => {
    const data = solid(2, 2, 100, 100, 100);
    const before = Uint8ClampedArray.from(data);
    const stack = [
      createLiveFilterEntry("noise", { amount: 50, enabled: false }),
    ];
    applyLiveFilterStack(data, 2, 2, stack);
    expect(Array.from(data)).toEqual(Array.from(before));
  });

  it("blends with opacity < 1", () => {
    const data = solid(2, 2, 0, 0, 0);
    const stack = [
      createLiveFilterEntry("sepia", { amount: 100, opacity: 0.5 }),
    ];
    applyLiveFilterStack(data, 2, 2, stack);
    // Sepia on black stays near black; opacity blend should not throw
    expect(data.length).toBe(16);
  });

  it("applies pixelate", () => {
    const data = solid(4, 4, 200, 100, 50);
    data[0] = 10;
    data[4] = 240;
    const stack = [createLiveFilterEntry("pixelate", { amount: 50 })];
    const result = applyLiveFilterStack(data, 4, 4, stack);
    expect(result.length).toBe(64);
  });

  it("throws on undersized buffer", () => {
    const data = new Uint8ClampedArray(8);
    const stack = [createLiveFilterEntry("blur", { radius: 1 })];
    expect(() => applyLiveFilterStack(data, 4, 4, stack)).toThrow(/buffer length/);
  });
});
