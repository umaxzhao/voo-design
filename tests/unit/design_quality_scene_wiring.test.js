import { describe, it, expect } from "vitest";
import { buildDesignQualityPrompt } from "../../src/canvas/agent/design_quality/prompt.js";
import { STYLE_KITS } from "../../src/canvas/agent/design_quality/style_kits.js";
import { SCENE_GUIDES } from "../../src/canvas/agent/design_quality/scene_guides.js";

describe("scene guide wiring in the design quality prompt", () => {
  it("injects the matching scene guide for a structural generation kind", () => {
    const prompt = buildDesignQualityPrompt({
      userText: "build a landing page",
      kit: STYLE_KITS.linear,
      sceneKind: "landing",
    });
    expect(prompt).toContain(`=== Scene guide: ${SCENE_GUIDES.landing.name} ===`);
    expect(prompt).toContain("[Structure]");
    expect(prompt).toContain("[Quality checks]");
  });

  it("keeps the guide out of the prompt when no kind is supplied", () => {
    const prompt = buildDesignQualityPrompt({ userText: "build a landing page", kit: STYLE_KITS.linear });
    expect(prompt).not.toContain("=== Scene guide:");
  });

  it("accepts natural language kinds with aliases", () => {
    const prompt = buildDesignQualityPrompt({
      userText: "帮我做一个移动应用",
      kit: STYLE_KITS.linear,
      sceneKind: "移动应用",
    });
    expect(prompt).toContain(`=== Scene guide: ${SCENE_GUIDES.mobile.name} ===`);
  });

  it("uses the explicit style kit over the prompt-based pick", () => {
    const prompt = buildDesignQualityPrompt({
      userText: "build a finance dashboard",
      kit: STYLE_KITS["dribbble-saas"],
      sceneKind: "dashboard",
    });
    expect(prompt).toContain(STYLE_KITS["dribbble-saas"].name);
    expect(prompt).toContain(STYLE_KITS["dribbble-saas"].palette.accent);
  });
});
