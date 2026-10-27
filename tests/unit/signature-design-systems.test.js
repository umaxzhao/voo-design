import { describe, it, expect } from "vitest";
import {
  DESIGN_SYSTEMS,
  buildDesignSystemBrief,
  designSystemColors,
  resolveDesignSystem,
} from "../../src/canvas/design_systems.js";
import { fromDesignSystemPreset } from "../../src/canvas/agent/design_system/from-preset.js";
import { validateDesignSystem } from "../../src/canvas/agent/design_system/schema.js";
import {
  buildGenerationIntent,
  designSystemOptions,
  generationContextText,
} from "../../src/canvas/components/welcome_dashboard/generation_intent.js";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_TEMPLATES,
} from "../../src/canvas/components/community_templates_data.js";

const SIGNATURE_IDS = ["axiom", "void-os", "bloom"];
const t = (key) => key;

describe("signature design systems", () => {
  it("registers the three signature systems with tokens and keywords", () => {
    for (const id of SIGNATURE_IDS) {
      const system = DESIGN_SYSTEMS[id];
      expect(system).toBeTruthy();
      expect(system.labelKey).toBe(`designSystem.${id === "void-os" ? "voidOs" : id}`);
      expect(system.tokens.primitive.colors.brand).toMatch(/^#[0-9A-F]{6}$/i);
      expect(system.keywords.length).toBeGreaterThan(0);
    }
    expect(Object.keys(DESIGN_SYSTEMS)).toEqual(
      expect.arrayContaining(["studio", "wellness", "commerce", "editorial", "analytics", ...SIGNATURE_IDS]),
    );
  });

  it("resolves explicit ids and routes prompts by intent", () => {
    expect(resolveDesignSystem("axiom").id).toBe("axiom");
    expect(resolveDesignSystem("void-os").id).toBe("void-os");
    expect(resolveDesignSystem("bloom").id).toBe("bloom");
    expect(resolveDesignSystem("auto", { prompt: "做一个前卫科技品牌落地页" }).id).toBe("axiom");
    expect(resolveDesignSystem("auto", { prompt: "做一个运维监控终端" }).id).toBe("void-os");
    expect(resolveDesignSystem("auto", { prompt: "潮流可爱的软糖品牌" }).id).toBe("bloom");
    expect(() => resolveDesignSystem("nope")).toThrow();
    expect(() => buildGenerationIntent({ designSystemId: "nope" })).toThrow("unknown-design-system:nope");
  });

  it("adds the per-system art-direction rules to the brief", () => {
    const axiomZh = buildDesignSystemBrief(DESIGN_SYSTEMS.axiom, { locale: "zh" });
    expect(axiomZh).toContain("12 栏");
    expect(axiomZh).toContain("Space Grotesk");
    expect(axiomZh).toContain("IBM Plex Mono");
    expect(axiomZh).toContain("#FF3D00");
    const axiomEn = buildDesignSystemBrief(DESIGN_SYSTEMS.axiom, { locale: "en" });
    expect(axiomEn).toContain("hairline grid");
    const voidBrief = buildDesignSystemBrief(DESIGN_SYSTEMS["void-os"], { locale: "en" });
    expect(voidBrief).toContain("operator console");
    expect(voidBrief).toContain("JetBrains Mono");
    const bloomBrief = buildDesignSystemBrief(DESIGN_SYSTEMS.bloom, { locale: "zh" });
    expect(bloomBrief).toContain("软糖");
    expect(bloomBrief).toContain("Fraunces");
  });

  it("converts all three into valid agent contracts", () => {
    for (const id of SIGNATURE_IDS) {
      const contract = fromDesignSystemPreset(DESIGN_SYSTEMS[id], { locale: "en", name: id.toUpperCase() });
      expect(validateDesignSystem(contract).ok).toBe(true);
      expect(contract.version).toBe(1);
      expect(contract.name).toBe(id.toUpperCase());
      expect(contract.colorMode).toBe(id === "void-os" ? "dark" : "light");
      expect(contract.designMd.length).toBeLessThanOrEqual(4000);
      expect(contract.colors.primary).toBe(designSystemColors(DESIGN_SYSTEMS[id]).action);
    }
  });

  it("exposes the signature systems in the welcome picker", () => {
    const options = designSystemOptions(t);
    expect(options.map((option) => option.id)).toEqual(["auto", ...SIGNATURE_IDS]);
    expect(options[1].label).toBe("designSystem.axiom");
  });

  it("carries the chosen system and its brief into a generation intent", () => {
    const intent = buildGenerationIntent({
      preset: { id: "landing", label: "welcome.pills.landing", guidance: "welcome.guide.landing", width: 1440, height: 900, category: "landing" },
      prompt: "做一个技术产品落地页",
      designSystemId: "axiom",
      styleId: "linear",
      locale: "zh",
      t,
    });
    expect(intent.designSystemId).toBe("axiom");
    expect(intent.styleId).toBe("auto");
    expect(intent.styleName).toBe("designSystem.axiom");
    expect(intent.designSystemContract).toBeTruthy();
    expect(intent.prompt).toContain("Design system — designSystem.axiom");
    expect(intent.prompt).toContain("12 栏");
    expect(intent.prompt).not.toContain("Style —");
    expect(intent.badge).toContain("designSystem.axiom");
    expect(generationContextText(intent)).toContain("designSystem=axiom");
  });

  it("ships one starter template per signature system", () => {
    for (const id of ["axiom-product-landing", "void-os-observability", "bloom-mobile-launch"]) {
      const template = COMMUNITY_TEMPLATES.find((entry) => entry.id === id);
      expect(template).toBeTruthy();
      expect(template.category).toBe("design-systems");
      const doc = template.createDoc();
      expect(doc.nodes.length).toBeGreaterThan(20);
      expect(doc.nodes.every((node) => typeof node.id === "string")).toBe(true);
      if (id === "bloom-mobile-launch") expect(doc.nodes.some((node) => node.cornerRadius > 0)).toBe(true);
    }
  });

  it("keeps the category counts in sync with the template list", () => {
    const all = COMMUNITY_CATEGORIES.find((category) => category.id === "all");
    expect(all.count).toBe(COMMUNITY_TEMPLATES.length);
    for (const category of COMMUNITY_CATEGORIES.filter((entry) => entry.id !== "all")) {
      const actual = COMMUNITY_TEMPLATES.filter((template) => template.category === category.id).length;
      expect(category.count, category.id).toBe(actual);
    }
  });
});
