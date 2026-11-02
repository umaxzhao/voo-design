// Texture effect: catalog registration + normalization defaults.
import { describe, expect, it } from "vitest";
import { EFFECT_KINDS } from "../../src/canvas/editor/adjustment_kinds.js";
import { normalizeEffects, normalizeTexture } from "../../src/canvas/editor/scene_model_text_effects.js";
import { starterEffect } from "../../src/canvas/editor/adjustment_catalog.js";

describe("texture effect", () => {
  it("is registered as a layer effect", () => {
    expect(EFFECT_KINDS).toContain("texture");
    expect(starterEffect("texture")).toMatchObject({ enabled: true, color: "#808080", size: 2 });
  });

  it("normalizes opacity/density into 0..1 and keeps a tint", () => {
    expect(normalizeTexture({ enabled: true, color: "#ff8800", opacity: 0.25, density: 0.6, size: 4, seed: 9 })).toMatchObject({
      enabled: true,
      color: "#ff8800",
      opacity: 0.25,
      density: 0.6,
      size: 4,
      seed: 9,
      blendMode: "overlay",
    });
    const effects = normalizeEffects({ texture: { enabled: true } });
    expect(effects.texture).toMatchObject({ opacity: 0.18, density: 0.5, size: 2 });
  });
});
