// Polyfill window & CustomEvent & Element for Node.js test environment if absent
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OnboardingGuide from "../../src/canvas/components/onboarding/OnboardingGuide.jsx";
import { OnboardingStepProgress } from "../../src/canvas/components/onboarding/onboarding_step_progress.jsx";
import StepAgentSelect from "../../src/canvas/components/onboarding/step_agent_select.jsx";
import StepLocalDetect from "../../src/canvas/components/onboarding/step_local_detect.jsx";
import StepReady from "../../src/canvas/components/onboarding/step_ready.jsx";
import {
  GUIDE_STEPS,
  isOnboardingCompleted,
  markOnboardingCompleted,
  resetOnboarding,
} from "../../src/canvas/components/onboarding/onboarding_state.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";

describe("Onboarding Guide & Local CLI Setup", () => {
  beforeEach(() => {
    resetOnboarding();
  });

  it("renders OnboardingStepProgress with progress bar and correct step count", () => {
    const html = renderToStaticMarkup(
      <OnboardingStepProgress stepIndex={0} steps={GUIDE_STEPS} label="Step 1 of 3" />
    );

    expect(html).toContain('data-testid="onboarding-step-indicator"');
    expect(html).toContain('data-step-count="3"');
    expect(html).toContain('aria-valuenow="1"');
  });

  it("renders StepAgentSelect with Claude Code as recommended default", () => {
    const html = renderToStaticMarkup(
      <StepAgentSelect selectedAgent="claude" onSelectAgent={() => {}} />
    );

    expect(html).toContain('data-testid="onboarding-agent-option-claude"');
    expect(html).toContain('data-testid="onboarding-agent-option-codex"');
    expect(html).toContain('data-testid="onboarding-agent-option-antigravity"');
    expect(html).toContain("Claude Code");
    expect(html).toContain("默认推荐");
  });

  it("renders StepLocalDetect with transport details and test button", () => {
    const html = renderToStaticMarkup(
      <StepLocalDetect selectedAgent="claude" />
    );

    expect(html).toContain("没有安装");
    expect(html).toContain('data-testid="onboarding-test-btn"');
    expect(html).toContain("npm install -g @anthropic-ai/claude-code");
  });

  it("renders StepReady with success badge and summary", () => {
    const html = renderToStaticMarkup(
      <StepReady selectedAgent="claude" />
    );

    expect(html).toContain("智能体");
    expect(html).toContain("Claude Code");
    expect(html).toContain("本地磁盘");
  });

  it("renders OnboardingGuide modal when open is true", () => {
    const html = renderToStaticMarkup(
      <OnboardingGuide open={true} onClose={() => {}} />
    );

    expect(html).toContain('data-testid="onboarding-guide-modal"');
    expect(html).toContain('data-testid="onboarding-art"');
    expect(html).toContain('data-testid="onboarding-close-btn"');
    expect(html).toContain('data-testid="onboarding-next-btn"');
    expect(html).toContain('data-testid="onboarding-skip-btn"');
    expect(html).toContain("稍后配置 (跳过)");
  });

  it("does not render OnboardingGuide when open is false", () => {
    const html = renderToStaticMarkup(
      <OnboardingGuide open={false} onClose={() => {}} />
    );

    expect(html).toBe("");
  });

  it("correctly tracks and updates onboarding completed state in settings", () => {
    expect(isOnboardingCompleted()).toBe(false);

    markOnboardingCompleted("2.1.0");
    expect(isOnboardingCompleted()).toBe(true);

    resetOnboarding();
    expect(isOnboardingCompleted()).toBe(false);
  });
});
