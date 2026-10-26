// The setup guide must be fully translated: no Chinese in English, original Chinese kept in zh.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OnboardingGuide from "../../src/canvas/components/onboarding/OnboardingGuide.jsx";
import StepWorkspace from "../../src/canvas/components/onboarding/step_workspace.jsx";
import StepAgentSelect from "../../src/canvas/components/onboarding/step_agent_select.jsx";
import StepLocalDetect from "../../src/canvas/components/onboarding/step_local_detect.jsx";
import StepReady from "../../src/canvas/components/onboarding/step_ready.jsx";
import { resetOnboarding } from "../../src/canvas/components/onboarding/onboarding_state.js";
import { loadLocale } from "../../src/shared/i18n.js";
import enDict from "../../src/shared/i18n/onboarding-guide-en.js";
import zhDict from "../../src/shared/i18n/onboarding-guide-zh.js";

const CJK = /[㐀-鿿＀-￯]/;
const ONBOARDING_DIR = path.resolve("src/canvas/components/onboarding");
const WORKSPACE = { path: "Virtual Workspace", type: "web-idb", name: "Virtual Workspace" };
const ZH_TITLES = ["选择智能体", "选择工作区", "检测 CLI", "准备就绪"];

/** Renders the whole guide on a given step by seeding the session draft it resumes from. */
function renderGuideAt(stepIndex) {
  const store = new Map([["voo.onboarding.draft", JSON.stringify({ stepIndex, selectedAgent: "claude" })]]);
  window.sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return renderToStaticMarkup(<OnboardingGuide open onClose={() => {}} />);
}

function renderSteps() {
  return {
    workspace: renderToStaticMarkup(<StepWorkspace workspaceConfig={WORKSPACE} onSelectConfig={() => {}} />),
    agent: renderToStaticMarkup(<StepAgentSelect selectedAgent="claude" onSelectAgent={() => {}} />),
    detect: renderToStaticMarkup(<StepLocalDetect selectedAgent="claude" />),
    ready: renderToStaticMarkup(<StepReady selectedAgent="claude" workspaceConfig={WORKSPACE} />),
  };
}

describe("setup guide i18n", () => {
  beforeAll(() => {
    resetOnboarding();
  });

  afterEach(async () => {
    delete window.sessionStorage;
    await loadLocale("en");
  });

  it("renders every guide step without Chinese characters in English", async () => {
    await loadLocale("en");
    for (let step = 0; step < 4; step += 1) {
      const html = renderGuideAt(step);
      expect(html, `guide step ${step}`).not.toMatch(CJK);
      expect(html, `guide step ${step}`).not.toMatch(/onboardingGuide\./);
    }
    for (const [name, html] of Object.entries(renderSteps())) {
      expect(html, name).not.toMatch(CJK);
      expect(html, name).not.toMatch(/onboardingGuide\.|onboarding\.|firstRun\./);
    }
  });

  it("shows the English titles and buttons in English", async () => {
    await loadLocale("en");
    expect(renderGuideAt(0)).toContain("Choose an agent");
    expect(renderGuideAt(1)).toContain("Choose a workspace");
    expect(renderGuideAt(2)).toContain("Detect CLI");
    const last = renderGuideAt(3);
    expect(last).toContain("Ready to go");
    expect(last).toContain("Enter the canvas");
    expect(last).toContain("Back");
    expect(last).toContain("Set up later (skip)");
  });

  it("keeps the original Chinese titles and buttons in zh", async () => {
    await loadLocale("zh");
    ZH_TITLES.forEach((title, step) => expect(renderGuideAt(step)).toContain(title));
    const last = renderGuideAt(3);
    expect(last).toContain("进入画布工作台");
    expect(last).toContain("上一步");
    expect(last).toContain("稍后配置 (跳过)");
    expect(renderGuideAt(0)).toContain("下一步");
    expect(renderGuideAt(0)).toContain('aria-label="关闭向导"');
    const steps = renderSteps();
    expect(steps.workspace).toContain("沙盒工作区");
    expect(steps.detect).toContain("没有安装？在终端运行：");
    expect(steps.detect).toContain("重新检测");
    expect(steps.ready).toContain("工作区");
    expect(steps.ready).toContain("智能体");
  });

  it("keeps commands literal in both locales", async () => {
    for (const locale of ["en", "zh"]) {
      await loadLocale(locale);
      expect(renderSteps().detect).toContain("npm install -g @anthropic-ai/claude-code");
    }
  });

  // Detection states (ready, not signed in, bridge missing) only render after async checks,
  // so assert them through the dictionaries and the keys the sources reference.
  it("defines every referenced onboardingGuide key in both languages", () => {
    const used = new Set();
    for (const file of fs.readdirSync(ONBOARDING_DIR)) {
      const source = fs.readFileSync(path.join(ONBOARDING_DIR, file), "utf8");
      for (const match of source.matchAll(/["'](onboardingGuide\.[\w.]+)["']/g)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) {
      expect(enDict[key], `en ${key}`).toBeTruthy();
      expect(zhDict[key], `zh ${key}`).toBeTruthy();
    }
    expect(Object.keys(enDict).sort()).toEqual(Object.keys(zhDict).sort());
    expect(Object.keys(enDict).sort()).toEqual([...used].sort());
  });

  it("has no Chinese in any English value and Chinese in every zh value", () => {
    for (const [key, value] of Object.entries(enDict)) expect(value, key).not.toMatch(CJK);
    for (const [key, value] of Object.entries(zhDict)) expect(value, key).toMatch(CJK);
  });
});
