import { describe, it, expect } from "vitest";
import {
  DEFAULT_STYLE_ID,
  buildGenerationIntent,
  buildGenerationPrompt,
  generationBadgeText,
  generationContextText,
  referenceImageContext,
  sizeOptions,
  styleOptions,
} from "../../src/canvas/components/welcome_dashboard/generation_intent.js";
import { AI_GEN_TYPES } from "../../src/canvas/components/welcome_dashboard/welcome_constants.js";
import { STYLE_KITS } from "../../src/canvas/agent/design_quality/style_kits.js";

const t = (key) => key;
const landing = AI_GEN_TYPES[0];

describe("welcome generation intent", () => {
  it("exposes every shipped style kit as a picker option", () => {
    const options = styleOptions();
    expect(options).toHaveLength(Object.keys(STYLE_KITS).length);
    expect(options.map((option) => option.id)).toEqual(Object.keys(STYLE_KITS));
    for (const option of options) {
      expect(option.name).toBeTruthy();
      expect(option.mood).toBeTruthy();
      expect(option.swatch).toHaveLength(3);
    }
    expect(options.some((option) => option.id === "linear")).toBe(true);
  });

  it("offers unique canvas sizes derived from the generation presets", () => {
    const sizes = sizeOptions();
    const ids = sizes.map((size) => size.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(`${landing.width}x${landing.height}`);
    expect(sizes.every((size) => size.width > 0 && size.height > 0)).toBe(true);
  });

  it("assembles the user prompt, scene guidance and explicit style tokens", () => {
    const prompt = buildGenerationPrompt({ preset: landing, prompt: "做一个咖啡品牌落地页", styleId: "linear", t });
    expect(prompt).toContain("做一个咖啡品牌落地页");
    expect(prompt).toContain("Creation guide — welcome.pills.landing");
    expect(prompt).toContain("welcome.guide.landing");
    expect(prompt).toContain("Style — Linear Dark");
    expect(prompt).toContain(STYLE_KITS.linear.palette.accent);
  });

  it("omits the style block when the user keeps automatic styling", () => {
    const prompt = buildGenerationPrompt({ preset: landing, prompt: "dashboard", styleId: DEFAULT_STYLE_ID, t });
    expect(prompt).not.toContain("Style —");
  });

  it("builds a one-shot intent with frame, model, badge and references", () => {
    const intent = buildGenerationIntent({
      preset: landing,
      prompt: "做一个咖啡品牌落地页",
      styleId: "linear",
      modelId: "claude:claude-opus-5-5",
      size: { width: 1920, height: 1080 },
      attachments: [
        { kind: "image", name: "ref.png", dataUrl: "data:image/png;base64,xx" },
        { kind: "file", name: "brief.pen" },
      ],
      t,
      now: () => 123,
    });
    expect(intent.kind).toBe("landing");
    expect(intent.frame).toEqual({ width: 1920, height: 1080 });
    expect(intent.styleId).toBe("linear");
    expect(intent.styleName).toBe("Linear Dark");
    expect(intent.modelId).toBe("claude:claude-opus-5-5");
    expect(intent.referenceCount).toBe(1);
    expect(intent.attachments).toHaveLength(2);
    expect(intent.origin).toBe("welcome");
    expect(intent.createdAt).toBe(123);
    expect(intent.badge).toContain("Linear Dark");
    expect(intent.badge).toContain("1920×1080");
    expect(intent.prompt).toContain("Creation guide");
  });

  it("carries the variant count into the intent and context", () => {
    const intent = buildGenerationIntent({ preset: landing, prompt: "landing page", candidates: 3, t });
    expect(intent.candidates).toBe(3);
    expect(intent.badge).toContain("3×");
    expect(generationContextText(intent)).toContain("candidates=3");
  });

  it("clamps the variant count to 1-3", () => {
    expect(buildGenerationIntent({ preset: landing, prompt: "x", candidates: 9, t }).candidates).toBe(3);
    expect(buildGenerationIntent({ preset: landing, prompt: "x", candidates: 0, t }).candidates).toBe(1);
  });

  it("defaults to the preset frame and the auto style", () => {
    const intent = buildGenerationIntent({ preset: landing, prompt: "landing page", t });
    expect(intent.frame).toEqual({ width: landing.width, height: landing.height });
    expect(intent.styleId).toBe(DEFAULT_STYLE_ID);
    expect(intent.styleName).toBe("");
    expect(intent.referenceCount).toBe(0);
  });

  it("resolves automatic canvas size from the currently selected design type", () => {
    for (const preset of AI_GEN_TYPES) {
      const intent = buildGenerationIntent({ preset, prompt: "design", size: null, t });
      expect(intent.frame).toEqual({ width: preset.width, height: preset.height });
    }
  });

  it("keeps user reference images out of the document while describing their use", () => {
    expect(referenceImageContext([
      { kind: "image", name: "poster.png", dataUrl: "data:image/png;base64,xx" },
      { kind: "file", name: "brief.pen" },
    ])).toContain("poster.png");
    expect(referenceImageContext([{ kind: "file", name: "brief.pen" }])).toBe("");
  });

  it("serialises structural context for the agent turn", () => {
    const intent = buildGenerationIntent({
      preset: landing,
      prompt: "landing page",
      styleId: "linear",
      modelId: "claude:claude-opus-5-5",
      size: { width: 1440, height: 900 },
      attachments: [{ kind: "image", name: "a.png", dataUrl: "data:image/png;base64,xx" }],
      t,
    });
    expect(generationContextText(intent)).toBe(
      "[Generation] kind=landing frame=1440x900 style=linear model=claude:claude-opus-5-5 references=1",
    );
    expect(generationBadgeText(intent, "Claude Code · Opus 5.5")).toContain("Claude Code · Opus 5.5");
  });
});
