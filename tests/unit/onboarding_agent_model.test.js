import { describe, it, expect } from "vitest";
import { applyAgentModel, AGENT_DEFAULT_MODELS } from "../../src/canvas/components/onboarding/onboarding_agent_model.js";
import { getSetting } from "../../src/shared/settings.js";
import { AGENT_SETTING } from "../../src/canvas/agent/canvas_tools.js";

describe("onboarding agent model", () => {
  it("selects the Claude Code CLI model for claude", () => {
    applyAgentModel("claude");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.claude);
  });

  it("switches to the Codex CLI model for codex", () => {
    applyAgentModel("codex");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe("codex:gpt-6-astra");
  });

  it("selects the Antigravity model for antigravity", () => {
    applyAgentModel("antigravity");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe("antigravity:gemini-3.8-flash-high");
  });

  it("falls back to Claude for an unknown agent id", () => {
    applyAgentModel("unknown");
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(AGENT_DEFAULT_MODELS.claude);
  });
});
