import { describe, expect, it } from "vitest";

import {
  DESIGN_TOKENS,
  contrastRatio,
  nearestTypeSize,
  snapToGrid,
} from "../../src/canvas/agent/design_quality/tokens.js";
import { STYLE_KITS, pickStyleKit } from "../../src/canvas/agent/design_quality/style_kits.js";
import { EXEMPLARS, pickExemplars } from "../../src/canvas/agent/design_quality/exemplars.js";
import { buildDesignQualityPrompt } from "../../src/canvas/agent/design_quality/prompt.js";
import {
  formatIssuesForModel,
  runCritiqueLoop,
} from "../../src/canvas/agent/design_quality/critique_loop.js";
import { lintDesign } from "../../src/canvas/agent/design_quality/lint.js";
import * as designQuality from "../../src/canvas/agent/design_quality/index.js";
import { runAgentTurn, SYSTEM_PROMPT } from "../../src/canvas/agent/canvas_agent.js";

describe("design quality tokens", () => {
  it("exposes the shared token contract", () => {
    expect([...DESIGN_TOKENS.spacing]).toEqual([0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128]);
    expect([...DESIGN_TOKENS.typeScale]).toEqual([12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72]);
    for (const palette of [DESIGN_TOKENS.palettes.light, DESIGN_TOKENS.palettes.dark]) {
      for (const key of ["bg", "surface", "surfaceAlt", "border", "text", "textMuted", "accent", "accentText", "success", "warning", "danger"]) {
        expect(typeof palette[key]).toBe("string");
      }
    }
    expect(DESIGN_TOKENS.shadows.sm).toEqual({
      css: "0 1px 2px rgba(0,0,0,0.18)",
      x: 0,
      y: 1,
      blur: 2,
      spread: 0,
      color: "rgba(0,0,0,0.18)",
    });
  });

  it("snaps to the 4px grid and picks nearest type sizes", () => {
    expect(snapToGrid(6)).toBe(8);
    expect(snapToGrid(13)).toBe(12);
    expect(snapToGrid(25, 8)).toBe(24);
    expect(nearestTypeSize(15)).toBe(14);
    expect(nearestTypeSize(45)).toBe(48);
    expect(nearestTypeSize(16)).toBe(16);
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#777777", "#ffffff")).toBeGreaterThan(4);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(5);
    expect(contrastRatio("rgba(0,0,0,0.5)", "#fff")).toBeCloseTo(21, 0);
  });
});

describe("style kits", () => {
  const REQUIRED_KITS = ["linear", "glass", "editorial", "enterprise-admin", "dribbble-saas"];

  it("defines one coherent kit per id", () => {
    for (const id of REQUIRED_KITS) {
      const kit = STYLE_KITS[id];
      expect(kit).toBeTruthy();
      expect(kit.id).toBe(id);
      expect(typeof kit.name).toBe("string");
      expect(typeof kit.mood).toBe("string");
      for (const key of ["bg", "surface", "surfaceAlt", "border", "text", "textMuted", "accent", "accentText", "success", "warning", "danger"]) {
        expect(typeof kit.palette[key]).toBe("string");
      }
      expect(Object.keys(kit.fonts).sort()).toEqual(["body", "display", "mono"]);
      expect(kit.typeScale.length).toBeGreaterThan(2);
      expect(typeof kit.radius).toBe("object");
      expect(["sm", "md", "lg", "full"].every((r) => r in kit.radius)).toBe(true);
      expect(kit.shadow.sm.css).toMatch(/rgba\(|none/);
      expect(typeof kit.spacingDensity).toBe("string");
      expect(kit.layoutPatterns.length).toBeGreaterThan(0);
      expect(kit.dos.length).toBeGreaterThan(0);
      expect(kit.donts.length).toBeGreaterThan(0);
    }
  });

  it("picks kits from user text and falls back deterministically", () => {
    expect(pickStyleKit("build an admin analytics dashboard with tables and KPI cards").id).toBe("enterprise-admin");
    expect(pickStyleKit("a blog article page with elegant serif typography").id).toBe("editorial");
    expect(pickStyleKit("frosted glass weather widget with blurred backdrop").id).toBe("glass");
    expect(pickStyleKit("dark developer tool for code review issues").id).toBe("linear");
    expect(pickStyleKit("dribbble style product shot, bento showcase with hero metric").id).toBe("dribbble-saas");
    expect(pickStyleKit("make me something nice").id).toBe("linear");
    expect(pickStyleKit("").id).toBe("linear");
    expect(pickStyleKit(undefined).id).toBe("linear");
  });
});

describe("exemplars", () => {
  it("describes layouts as text recipes across kits and kinds", () => {
    expect(EXEMPLARS.length).toBeGreaterThanOrEqual(7);
    const kinds = new Set(EXEMPLARS.map((e) => e.kind));
    for (const kind of ["dashboard", "login", "pricing", "landing", "mobile", "settings", "editorial"]) {
      expect(kinds.has(kind)).toBe(true);
    }
    for (const exemplar of EXEMPLARS) {
      expect(exemplar.id && exemplar.kit && STYLE_KITS[exemplar.kit]).toBeTruthy();
      expect(exemplar.description.length).toBeGreaterThan(80);
      expect(exemplar.structure.length).toBeGreaterThan(20);
    }
  });

  it("returns the requested number of exemplars, matched or default", () => {
    expect(pickExemplars("dashboard", 2)).toHaveLength(2);
    expect(pickExemplars("dashboard", 1)[0].kind).toBe("dashboard");
    const onText = pickExemplars("dark bento showcase landing page", 3);
    expect(onText).toHaveLength(3);
    expect(onText[0].kit).toBe("dribbble-saas");
    const fallback = pickExemplars("", 3);
    expect(fallback).toHaveLength(3);
    expect(new Set(fallback.map((e) => e.id)).size).toBe(3);
    expect(pickExemplars("anything", 0)).toEqual([]);
  });
});

describe("critique loop stub contract", () => {
  it("lintDesign returns the contract shape", () => {
    const result = lintDesign({ nodes: [] });
    expect(typeof result.score).toBe("number");
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.metrics).toBe("object");
  });

  it("formatIssuesForModel + runCritiqueLoop cooperate", async () => {
    let score = 60;
    const loop = await runCritiqueLoop({
      lint: () => ({ score, issues: score < 85 ? [{ rule: "x", severity: "warn", nodeIds: [], message: "m" }] : [] }),
      fix: async () => {
        score = 90;
      },
      maxRounds: 3,
      threshold: 85,
    });
    expect(loop.rounds.length).toBeGreaterThanOrEqual(2);
    expect(loop.final.score).toBe(90);
    expect(formatIssuesForModel({ issues: [] })).toBe("");
    expect(formatIssuesForModel({ issues: [{ rule: "r", severity: "error", nodeIds: ["n1"], message: "oops" }] })).toContain("error");
  });
});

describe("buildDesignQualityPrompt", () => {
  it("instructs complete bulk creation with direct kit styling", () => {
    const prompt = buildDesignQualityPrompt({ userText: "dashboard" });
    expect(prompt).toContain("complete screen with build_layout in 1-3 calls");
    expect(prompt).toContain("every section, real copy, and all text");
    expect(prompt).toContain("colours and fonts directly from the style kit tokens");
    expect(prompt).toContain("Avoid hand-drawn path illustrations");
    expect(prompt).toContain("capture_canvas once");
  });

  it("picks the dashboard recipe from the request within the active kit", () => {
    const prompt = buildDesignQualityPrompt({ userText: "Build a dashboard", kit: STYLE_KITS["dribbble-saas"] });
    expect(prompt).toContain(EXEMPLARS.find((e) => e.id === "analytics-dark-shot").description);
    expect(pickExemplars("Build a dashboard", 4, "dribbble-saas")[0].id).toBe("analytics-dark-shot");
  });

  it("picks the pricing recipe from the request", () => {
    const prompt = buildDesignQualityPrompt({ userText: "Build a pricing page", kit: STYLE_KITS["dribbble-saas"] });
    expect(prompt).toContain(EXEMPLARS.find((e) => e.id === "pricing-tiers").description);
    expect(pickExemplars("Build a pricing page", 4, "dribbble-saas")[0].id).toBe("pricing-tiers");
  });

  it("labels at most one cross-kit recipe and includes only its structure", () => {
    for (const kit of Object.values(STYLE_KITS)) {
      for (const userText of ["dashboard", "pricing", "", "unmatched request"]) {
        const selected = pickExemplars(userText, 4, kit.id);
        const foreign = selected.filter((e) => e.kit !== kit.id);
        expect(foreign.length).toBeLessThanOrEqual(1);
        expect(selected.filter((e) => e.kit === kit.id)).toHaveLength(
          Math.min(4, EXEMPLARS.filter((e) => e.kit === kit.id).length),
        );
        const prompt = buildDesignQualityPrompt({ userText, kit });
        for (const e of foreign) {
          expect(e.structureOnly).toBe(true);
          expect(prompt).toContain(`(${e.kit}; structure only, restyle with the active kit) ${e.structure}`);
          expect(prompt).not.toContain(e.description);
        }
        // The recipe list now may be followed by a scene-guide block (user-text
        // activation), so scope the recipe assertions to the recipe section.
        const recipesSection = prompt
          .split("[Exemplar recipes — follow the nearest one]\n")[1]
          .split("\n=== Scene guide:")[0];
        const recipes = recipesSection.split("\n").filter((line) => line.trim().length > 0);
        for (const recipe of recipes) {
          expect(recipe.includes(`(${kit.id})`) || recipe.includes("structure only, restyle with the active kit")).toBe(true);
        }
      }
    }
  });

  it("embeds the kit block, rules and exemplars", () => {
    const promptText = buildDesignQualityPrompt({
      userText: "analytics dashboard with KPI cards",
      kit: pickStyleKit("analytics dashboard with KPI cards"),
    });
    expect(promptText.length).toBeGreaterThan(500);
    expect(promptText).toContain("Design quality");
    expect(promptText).toContain("Enterprise Admin");
    expect(promptText).toContain("Anti-AI-smell");
    expect(promptText).toContain("Exemplar recipes");
  });

  it("falls back to picking the kit from user text", () => {
    const promptText = buildDesignQualityPrompt({ userText: "editorial magazine article" });
    expect(promptText).toContain("Editorial Print");
    expect(promptText).toContain("ONE kit");
  });

  it("injects the scene guide named by an explicit sceneKind", () => {
    const prompt = buildDesignQualityPrompt({ userText: "make something sharp", sceneKind: "poster" });
    expect(prompt).toContain("=== Scene guide: Poster / 活动海报 ===");
    expect(prompt).toContain("主标题字号 = 画布宽 10-14%");
  });

  it("activates a scene guide from the natural-language request when sceneKind is absent", () => {
    for (const [userText, sceneName] of [
      ["帮我设计活动海报", "Poster / 活动海报"],
      ["做个小红书卡片", "Xiaohongshu Card / 小红书卡片"],
      ["设计一张电商横幅", "Banner / 电商横幅"],
      ["做一个落地页", "Landing Page / 落地页"],
    ]) {
      const prompt = buildDesignQualityPrompt({ userText });
      expect(prompt, `userText: ${userText}`).toContain(`=== Scene guide: ${sceneName} ===`);
    }
  });

  it("prefers an explicit sceneKind over the words in the request", () => {
    const prompt = buildDesignQualityPrompt({ userText: "帮我设计活动海报", sceneKind: "xiaohongshu" });
    expect(prompt).toContain("=== Scene guide: Xiaohongshu Card / 小红书卡片 ===");
    expect(prompt).not.toContain("Poster / 活动海报");
  });

  it("injects no scene guide when neither sceneKind nor the request names a scene", () => {
    for (const input of [{ userText: "把按钮变蓝" }, { userText: "" }, {}]) {
      expect(buildDesignQualityPrompt(input)).not.toContain("=== Scene guide:");
    }
  });
});

describe("design_quality index surface", () => {
  it("re-exports the whole contract", () => {
    for (const key of [
      "DESIGN_TOKENS",
      "snapToGrid",
      "nearestTypeSize",
      "contrastRatio",
      "STYLE_KITS",
      "pickStyleKit",
      "lintDesign",
      "formatIssuesForModel",
      "runCritiqueLoop",
      "buildDesignQualityPrompt",
      "EXEMPLARS",
      "pickExemplars",
    ]) {
      expect(designQuality[key]).toBeTruthy();
    }
  });
});

describe("canvas agent design quality hook", () => {
  it("appends the design quality prompt to the system message", async () => {
    let seen;
    const streamStep = async ({ messages }) => {
      seen = messages;
      return { text: "done", toolCalls: [] };
    };
    await runAgentTurn({
      config: {},
      history: [],
      userText: "Build an admin dashboard with KPI cards",
      tools: [],
      executeTool: async () => ({}),
      streamStep,
    });
    const system = seen[0].content ?? "";
    expect(system.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(system).toContain("=== Design quality (follow strictly) ===");
    expect(system).toContain("Enterprise Admin");
    expect(system).toContain("Design quality: honor the Design quality block");
  });

  it("executes multiple calls within one model step", async () => {
    const executed = [];
    let steps = 0;
    await runAgentTurn({ config: {}, history: [], userText: "Build a screen", tools: [], maxSteps: 2,
      executeTool: async (name, args) => { executed.push({ name, args }); return {}; },
      streamStep: async () => ++steps === 1
        ? { text: "", toolCalls: [1, 2, 3].map(i => ({ id: `c${i}`, name: "build_layout", arguments: JSON.stringify({ nodes: [], section: i }) })) }
        : { text: "done", toolCalls: [] },
    });
    expect(steps).toBe(2);
    expect(executed.map(call => call.args.section)).toEqual([1, 2, 3]);
  });

  it("keeps bulk creation and multiple tool calls available in the baseline", async () => {
    const original = globalThis.__VOO_DESIGN_QUALITY_OFF__;
    globalThis.__VOO_DESIGN_QUALITY_OFF__ = true;
    let system;
    try {
      await runAgentTurn({ config: {}, history: [], userText: "dashboard", tools: [],
        executeTool: async () => ({}),
        streamStep: async ({ messages }) => {
          system = messages[0].content;
          return { text: "done", toolCalls: [] };
        },
      });
      expect(system).toContain("Use build_layout to efficiently create many layers");
      expect(system).toContain("multiple tool calls in a single step");
      expect(system).not.toContain("complete screen with build_layout in 1-3 calls");
      expect(system).not.toContain("=== Design quality (follow strictly) ===");
    } finally {
      if (original === undefined) delete globalThis.__VOO_DESIGN_QUALITY_OFF__;
      else globalThis.__VOO_DESIGN_QUALITY_OFF__ = original;
    }
  });

  it("keeps style notes and blends both prompts", async () => {
    let seen;
    const streamStep = async ({ messages }) => {
      seen = messages;
      return { text: "done", toolCalls: [] };
    };
    await runAgentTurn({
      config: {},
      history: [],
      userText: "frosted glass settings page",
      tools: [],
      executeTool: async () => ({}),
      streamStep,
      styleNote: "prefer rounded corners",
    });
    const system = seen[0].content ?? "";
    expect(system).toContain("Style notes from the user: prefer rounded corners");
    expect(system).toContain("Frosted Glass");
    expect(system).toContain("=== Design quality (follow strictly) ===");
  });
});
