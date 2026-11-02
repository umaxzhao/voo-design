import { describe, expect, it } from "vitest";

import {
  SCENE_GUIDES,
  getSceneGuide,
  sceneGuidePromptBlock,
} from "../../src/canvas/agent/design_quality/scene_guides.js";

const GUIDE_KEYS = [
  "landing",
  "mobile",
  "web",
  "slides",
  "dashboard",
  "poster",
  "xiaohongshu",
  "banner",
  "other",
];
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
  it("defines exactly the nine supported scenes", () => {
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

    const poster = SCENE_GUIDES.poster;
    expect(guideText(poster, "structure")).toContain("1080×1440");
    expect(guideText(poster, "structure")).toContain("1080×1920");
    expect(guideText(poster, "structure")).toContain("时间/地点/门票");
    expect(guideText(poster, "structure")).toMatch(/50-60%/);
    expect(guideText(poster, "typography")).toContain("10-14%");
    expect(guideText(poster, "typography")).toContain("108-150px");
    expect(guideText(poster, "content")).toContain("扫码购票");

    const xiaohongshu = SCENE_GUIDES.xiaohongshu;
    expect(guideText(xiaohongshu, "structure")).toContain("1080×1440");
    expect(guideText(xiaohongshu, "structure")).toContain("3:4");
    expect(guideText(xiaohongshu, "structure")).toContain("期数");
    expect(guideText(xiaohongshu, "structure")).toContain("标签胶囊");
    expect(guideText(xiaohongshu, "structure")).toContain("作者水印");
    expect(guideText(xiaohongshu, "typography")).toContain("80-104px");
    expect(guideText(xiaohongshu, "typography")).toContain("1.6-1.8");
    expect(guideText(xiaohongshu, "layout")).toMatch(/≥40%/);
    expect(guideText(xiaohongshu, "content")).toContain("收藏");

    const bannerScene = SCENE_GUIDES.banner;
    expect(guideText(bannerScene, "structure")).toContain("1920×480");
    expect(guideText(bannerScene, "structure")).toContain("1200×400");
    expect(guideText(bannerScene, "structure")).toContain("60/40");
    expect(guideText(bannerScene, "structure")).toMatch(/≥48px/);
    expect(guideText(bannerScene, "typography")).toContain("56-72px");
    expect(guideText(bannerScene, "layout")).toMatch(/≥80px/);
    expect(guideText(bannerScene, "content")).toContain("满 300 减 50");

    const other = SCENE_GUIDES.other;
    expect(guideText(other, "layout")).toContain("安全边距");
    expect(guideText(other, "content")).toContain("lorem ipsum");
    expect(guideText(other, "structure")).toContain("品牌手册");
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
      ["poster", "poster"],
      ["posters", "poster"],
      ["event poster", "poster"],
      ["movie poster", "poster"],
      ["flyer", "poster"],
      ["海报", "poster"],
      ["活动海报", "poster"],
      ["展讯海报", "poster"],
      ["单页海报", "poster"],
      ["宣传海报", "poster"],
      ["帮我做一张活动海报", "poster"],
      ["xiaohongshu", "xiaohongshu"],
      ["redbook", "xiaohongshu"],
      ["xhs", "xiaohongshu"],
      ["feed card", "xiaohongshu"],
      ["social card", "xiaohongshu"],
      ["knowledge card", "xiaohongshu"],
      ["小红书", "xiaohongshu"],
      ["小红书卡片", "xiaohongshu"],
      ["种草卡", "xiaohongshu"],
      ["知识卡片", "xiaohongshu"],
      ["图文笔记", "xiaohongshu"],
      ["干货卡片", "xiaohongshu"],
      ["图文卡", "xiaohongshu"],
      ["做一套小红书图文笔记", "xiaohongshu"],
      ["banner", "banner"],
      ["web banner", "banner"],
      ["marketing banner", "banner"],
      ["header banner", "banner"],
      ["hero banner", "banner"],
      ["横幅", "banner"],
      ["通栏", "banner"],
      ["电商横幅", "banner"],
      ["品宣横幅", "banner"],
      ["活动横幅", "banner"],
      ["营销横幅", "banner"],
      ["首图", "banner"],
      ["设计一张电商横幅", "banner"],
      ["other", "other"],
      ["其他", "other"],
      ["社媒", "other"],
      ["品牌手册", "other"],
      ["brandbook", "other"],
      ["vi", "other"],
      ["freeform", "other"],
    ];
    for (const [input, expected] of cases) {
      expect(getSceneGuide(input)?.id, `input: ${input}`).toBe(expected);
    }
  });

  it("routes poster, xiaohongshu and banner away from the freeform fallback", () => {
    // These used to be `other` aliases; each now owns a dedicated contract.
    for (const input of ["海报", "poster", "flyer", "banner", "横幅", "小红书", "知识卡片", "电商横幅"]) {
      expect(getSceneGuide(input)?.id, `input: ${input}`).not.toBe("other");
    }
    // Freeform stays available for genuinely free-form deliverables.
    for (const input of ["brandbook", "vi", "general", "freeform", "品牌手册", "自由版式"]) {
      expect(getSceneGuide(input)?.id, `input: ${input}`).toBe("other");
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
    expect(sceneGuidePromptBlock("活动海报")).toContain("Poster / 活动海报");
    expect(sceneGuidePromptBlock("活动海报")).not.toContain("Other / 自由版式");
    expect(sceneGuidePromptBlock("小红书卡片")).toContain("Xiaohongshu Card / 小红书卡片");
    expect(sceneGuidePromptBlock("小红书卡片")).not.toContain("Other / 自由版式");
    expect(sceneGuidePromptBlock("电商横幅")).toContain("Banner / 电商横幅");
    expect(sceneGuidePromptBlock("电商横幅")).not.toContain("Other / 自由版式");
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
