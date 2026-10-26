import { describe, expect, it } from "vitest";

import {
  SCENE_GUIDES,
  getSceneGuide,
  sceneGuidePromptBlock,
} from "../../src/canvas/agent/design_quality/scene_guides.js";

const GUIDE_KEYS = ["landing", "mobile", "web", "slides", "dashboard", "other"];
const GUIDE_SECTIONS = [
  "structure",
  "typography",
  "layout",
  "content",
  "qualityChecks",
  "pitfalls",
];
const PROMPT_SECTIONS = [
  "[Structure]",
  "[Typography]",
  "[Layout]",
  "[Content]",
  "[Quality checks]",
  "[Pitfalls]",
];

// Rule names emitted by design_quality/lint.js — quality checks must map onto them.
const LINT_RULES = [
  "overlap",
  "overflow",
  "misalignment",
  "offGrid",
  "typeScale",
  "contrast",
  "radii",
  "purpleGradient",
  "identicalCards",
  "centerStackedHero",
  "decorativeLines",
  "evenTemplateSpacing",
  "flatHierarchy",
  "noFocal",
];

const guideText = (guide, section) => guide[section].join(" ");
const guideLength = (guide) =>
  [guide.name, guide.whenToUse, ...GUIDE_SECTIONS.flatMap((s) => guide[s])].join("\n").length;

describe("scene guides data contract", () => {
  it("defines exactly the six supported scenes", () => {
    expect(Object.keys(SCENE_GUIDES).sort()).toEqual([...GUIDE_KEYS].sort());
    for (const key of GUIDE_KEYS) {
      expect(SCENE_GUIDES[key]).toBeTruthy();
      expect(SCENE_GUIDES[key].id).toBe(key);
    }
  });

  it("fills every field with executable rules", () => {
    for (const key of GUIDE_KEYS) {
      const guide = SCENE_GUIDES[key];
      expect(typeof guide.name).toBe("string");
      expect(guide.name.length).toBeGreaterThan(0);
      expect(typeof guide.whenToUse).toBe("string");
      expect(guide.whenToUse.length).toBeGreaterThan(8);
      for (const section of GUIDE_SECTIONS) {
        expect(Array.isArray(guide[section])).toBe(true);
        expect(guide[section].length).toBeGreaterThanOrEqual(4);
        expect(guide[section].length).toBeLessThanOrEqual(6);
        for (const rule of guide[section]) {
          expect(typeof rule).toBe("string");
          expect(rule.trim().length).toBeGreaterThan(5);
        }
      }
    }
  });

  it("keeps every guide compact enough for a system prompt (<2000 chars)", () => {
    for (const key of GUIDE_KEYS) {
      expect(guideLength(SCENE_GUIDES[key])).toBeLessThan(2000);
    }
  });

  it("carries concrete, scene-specific contracts", () => {
    const landing = SCENE_GUIDES.landing;
    expect(guideText(landing, "structure")).toMatch(/hero/i);
    expect(guideText(landing, "structure")).toContain("CTA");
    expect(guideText(landing, "structure")).toContain("页脚");
    expect(guideText(landing, "layout")).toContain("禁止居中堆叠");

    const mobile = SCENE_GUIDES.mobile;
    expect(guideText(mobile, "structure")).toContain("393×852");
    expect(guideText(mobile, "structure")).toContain("home indicator");
    expect(guideText(mobile, "structure")).toContain("tab bar");
    expect(guideText(mobile, "layout")).toContain("44×44");

    const web = SCENE_GUIDES.web;
    expect(guideText(web, "structure")).toContain("App shell");
    expect(guideText(web, "structure")).toContain("侧栏");
    expect(guideText(web, "structure")).toContain("表格");

    const slides = SCENE_GUIDES.slides;
    expect(guideText(slides, "structure")).toContain("16:9");
    expect(guideText(slides, "structure")).toContain("结束页");
    expect(guideText(slides, "typography")).toContain("最多 2 行");
    expect(guideText(slides, "content")).toContain("≤3 行");

    const dashboard = SCENE_GUIDES.dashboard;
    expect(guideText(dashboard, "structure")).toContain("KPI");
    expect(guideText(dashboard, "content")).toMatch(/bar/);
    expect(guideText(dashboard, "content")).toMatch(/line/);
    expect(guideText(dashboard, "content")).toMatch(/donut/);
    expect(guideText(dashboard, "content")).toContain("单位");

    const other = SCENE_GUIDES.other;
    expect(guideText(other, "layout")).toContain("安全边距");
    expect(guideText(other, "content")).toContain("lorem ipsum");
  });

  it("maps quality checks onto existing lint rule names", () => {
    const seen = new Set();
    for (const key of GUIDE_KEYS) {
      const checks = guideText(SCENE_GUIDES[key], "qualityChecks");
      const matched = LINT_RULES.filter((rule) => checks.includes(rule));
      expect(matched.length).toBeGreaterThanOrEqual(1);
      for (const rule of matched) seen.add(rule);
    }
    for (const rule of ["overlap", "overflow", "contrast", "typeScale"]) {
      expect(seen.has(rule)).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});

describe("getSceneGuide recognition", () => {
  it("resolves ids, English aliases, Chinese aliases and natural language", () => {
    const cases = [
      ["landing", "landing"],
      ["landing-page", "landing"],
      ["landing page", "landing"],
      ["Landing Page", "landing"],
      ["  landing  ", "landing"],
      ["落地页", "landing"],
      ["官网首页", "landing"],
      ["做一个落地页", "landing"],
      ["mobile", "mobile"],
      ["mobile app", "mobile"],
      ["mobile-app", "mobile"],
      ["MOBILE APP", "mobile"],
      ["移动应用", "mobile"],
      ["移动端", "mobile"],
      ["iPhone 设计", "mobile"],
      ["帮我做一个移动应用", "mobile"],
      ["web", "web"],
      ["Web 应用", "web"],
      ["web app", "web"],
      ["网页", "web"],
      ["后台管理", "web"],
      ["Web 应用界面", "web"],
      ["slides", "slides"],
      ["slide deck", "slides"],
      ["演示文稿", "slides"],
      ["PPT", "slides"],
      ["幻灯片", "slides"],
      ["做一套演示文稿", "slides"],
      ["dashboard", "dashboard"],
      ["数据看板", "dashboard"],
      ["仪表盘", "dashboard"],
      ["KPI 看板", "dashboard"],
      ["设计一个数据看板", "dashboard"],
      ["other", "other"],
      ["其他", "other"],
      ["海报", "other"],
      ["社媒", "other"],
    ];
    for (const [input, expected] of cases) {
      expect(getSceneGuide(input)?.id, `input: ${input}`).toBe(expected);
    }
  });

  it("returns the shared frozen-by-contract guide object for ids", () => {
    expect(getSceneGuide("landing")).toBe(SCENE_GUIDES.landing);
    expect(getSceneGuide("dashboard")).toBe(SCENE_GUIDES.dashboard);
  });

  it("returns null for unknown or empty input instead of falling back to other", () => {
    const unknown = [
      "",
      "   ",
      null,
      undefined,
      42,
      {},
      "logo",
      "帮我画个图标",
      "something random",
      "cobweb",
      "scenarios",
      "constructor",
      "toString",
    ];
    for (const input of unknown) {
      expect(getSceneGuide(input), `input: ${String(input)}`).toBeNull();
    }
  });
});

describe("sceneGuidePromptBlock", () => {
  it("renders a headed block with every section and one line per rule", () => {
    for (const key of GUIDE_KEYS) {
      const guide = SCENE_GUIDES[key];
      const block = sceneGuidePromptBlock(key);
      expect(block.startsWith("=== Scene guide: ")).toBe(true);
      expect(block).toContain(guide.name);
      expect(block).toContain(`When to use: ${guide.whenToUse}`);
      for (const header of PROMPT_SECTIONS) {
        expect(block).toContain(header);
      }
      const ruleLines = block.split("\n").filter((line) => line.startsWith("- "));
      expect(ruleLines).toHaveLength(
        GUIDE_SECTIONS.reduce((sum, section) => sum + guide[section].length, 0),
      );
    }
  });

  it("stays within the prompt budget per scene", () => {
    for (const key of GUIDE_KEYS) {
      const block = sceneGuidePromptBlock(key);
      expect(block.length).toBeGreaterThan(850);
      expect(block.length).toBeLessThan(1600);
    }
  });

  it("keeps the requested scene, not the fallback scene", () => {
    expect(sceneGuidePromptBlock("演示文稿")).toContain("Slides / 演示文稿");
    expect(sceneGuidePromptBlock("演示文稿")).not.toContain("Landing Page");
    expect(sceneGuidePromptBlock("数据看板")).toContain("Dashboard / 数据看板");
    expect(sceneGuidePromptBlock("落地页")).toContain("Landing Page / 落地页");
  });

  it("returns an empty string when the scene is unknown", () => {
    expect(sceneGuidePromptBlock("logo")).toBe("");
    expect(sceneGuidePromptBlock("")).toBe("");
    expect(sceneGuidePromptBlock(null)).toBe("");
    expect(sceneGuidePromptBlock(undefined)).toBe("");
  });

  it("concatenates cleanly after the design quality block", () => {
    const prefix = "=== Design quality (follow strictly) ===\nStyle kit: Linear Dark\n\n";
    const prompt = `${prefix}${sceneGuidePromptBlock("dashboard")}`;
    expect(prompt.startsWith("=== Design quality (follow strictly) ===")).toBe(true);
    expect(prompt).toContain("=== Scene guide: Dashboard / 数据看板 ===");
    expect(prompt).toContain("[Quality checks]");
  });
});
