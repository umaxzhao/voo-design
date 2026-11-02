// Glass effect: normalization and the tint/highlight overlay pass.
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeEffects, normalizeGlass } from "../../src/canvas/editor/scene_model_text_effects.js";
import { drawGlassOverlay } from "../../src/canvas/editor/render_figma_effects.js";

class MockPath2D {
  constructor() {
    this.calls = [];
  }
  rect(...args) {
    this.calls.push(["rect", ...args]);
  }
  roundRect(...args) {
    this.calls.push(["roundRect", ...args]);
  }
  ellipse(...args) {
    this.calls.push(["ellipse", ...args]);
  }
}

afterEach(() => vi.unstubAllGlobals());

const node = {
  id: "g1",
  kind: "rect",
  x: 10,
  y: 20,
  width: 200,
  height: 120,
  cornerRadius: 12,
};

describe("glass effect", () => {
  it("normalizes glass parameters", () => {
    const glass = normalizeGlass({ enabled: true, blur: 30, tint: "#ff0000", opacity: 40, highlight: 60, angle: 90 });
    expect(glass).toMatchObject({ enabled: true, blur: 30, tint: "#ff0000", opacity: 40, highlight: 60, angle: 90 });
    const effects = normalizeEffects({ glass: { enabled: true } });
    expect(effects.glass).toMatchObject({ blur: 20, tint: "#ffffff", opacity: 25 });
  });

  it("tints and outlines the silhouette", () => {
    vi.stubGlobal("Path2D", MockPath2D);
    const gradient = { addColorStop: vi.fn() };
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      stroke: vi.fn(),
      getTransform: () => ({ a: 1, b: 0 }),
      createLinearGradient: vi.fn(() => gradient),
      set globalAlpha(value) {},
      set fillStyle(value) {},
      set strokeStyle(value) {},
      set lineWidth(value) {},
    };
    drawGlassOverlay(ctx, node, normalizeGlass({ enabled: true, opacity: 30, highlight: 50 }));
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.fillRect).toHaveBeenCalledTimes(2); // tint + sheen
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(gradient.addColorStop).toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    vi.stubGlobal("Path2D", MockPath2D);
    const ctx = { save: vi.fn() };
    drawGlassOverlay(ctx, node, { enabled: false });
    expect(ctx.save).not.toHaveBeenCalled();
  });
});
