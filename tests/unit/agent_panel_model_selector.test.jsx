// Polyfill window & CustomEvent & Element for Node.js test environment if absent
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CanvasAgentPanel, {
  CLI_MODEL_GROUPS,
  getModelDisplayLabel,
} from "../../src/canvas/components/canvas_agent_panel.jsx";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { AGENT_SETTING } from "../../src/canvas/agent/canvas_tools.js";

describe("Agent Panel Model Selector & CLI Groups", () => {
  beforeEach(() => {
    // Reset settings
    setSetting(AGENT_SETTING.MODEL, "claude:claude-opus-5-5");
  });

  describe("1. CLI_MODEL_GROUPS specification", () => {
    it("defines 3 major CLI groups: Claude, Codex, and Antigravity", () => {
      const cliIds = CLI_MODEL_GROUPS.map((g) => g.cliId);
      expect(cliIds).toEqual(["claude", "codex", "antigravity"]);
    });

    it("includes required models in Claude Code group", () => {
      const claudeGroup = CLI_MODEL_GROUPS.find((g) => g.cliId === "claude");
      expect(claudeGroup).toBeDefined();
      const ids = claudeGroup.models.map((m) => m.id);
      expect(ids).toContain("claude:claude-opus-5-5");
      expect(ids).toContain("claude:sonnet");
      expect(ids).toContain("claude:haiku");
    });

    it("includes required models in Codex group", () => {
      const codexGroup = CLI_MODEL_GROUPS.find((g) => g.cliId === "codex");
      expect(codexGroup).toBeDefined();
      const ids = codexGroup.models.map((m) => m.id);
      expect(ids).toContain("codex:gpt-6-astra");
      expect(ids).toContain("codex:gpt-5.6-terra");
    });

    it("includes required models in Antigravity group", () => {
      const agyGroup = CLI_MODEL_GROUPS.find((g) => g.cliId === "antigravity");
      expect(agyGroup).toBeDefined();
      const ids = agyGroup.models.map((m) => m.id);
      expect(ids).toContain("antigravity:gemini-3.8-flash-high");
      expect(ids).toContain("antigravity:claude-sonnet-4-6");
      expect(ids).toContain("antigravity:gpt-oss-120b-medium");
    });
  });

  describe("2. getModelDisplayLabel formatting", () => {
    it("formats known Claude models cleanly", () => {
      const label = getModelDisplayLabel("claude:claude-opus-5-5");
      expect(label).toBe("Claude Code · Opus 5.5");
    });

    it("formats known Codex models cleanly", () => {
      const label = getModelDisplayLabel("codex:gpt-6-astra");
      expect(label).toBe("Codex · GPT-6 Astra");
    });

    it("formats known Antigravity models cleanly", () => {
      const label = getModelDisplayLabel("antigravity:gemini-3.8-flash-high");
      expect(label).toBe("Antigravity · 3.8 Flash (High)");
    });

    it("gracefully falls back for unknown prefixes", () => {
      const label = getModelDisplayLabel("custom:special-v1");
      expect(label).toBe("Custom · special-v1");
    });

    it("falls back to Flash if null or empty", () => {
      expect(getModelDisplayLabel(null)).toBe("Flash");
      expect(getModelDisplayLabel("")).toBe("Flash");
    });
  });

  describe("3. Setting persistence & Panel UI Integration", () => {
    it("updates AGENT_SETTING.MODEL when setSetting is called", () => {
      setSetting(AGENT_SETTING.MODEL, "codex:gpt-6-astra");
      expect(getSetting(AGENT_SETTING.MODEL)).toBe("codex:gpt-6-astra");

      setSetting(AGENT_SETTING.MODEL, "antigravity:gemini-3.8-flash-high");
      expect(getSetting(AGENT_SETTING.MODEL)).toBe("antigravity:gemini-3.8-flash-high");
    });

    it("renders CanvasAgentPanel with model selector pill and composer model badge", () => {
      setSetting(AGENT_SETTING.MODEL, "claude:claude-opus-5-5");
      const html = renderToStaticMarkup(<CanvasAgentPanel onClose={() => {}} />);

      // Model pill in header
      expect(html).toContain('data-testid="agent-model-pill"');
      expect(html).toContain("Claude Code · Opus 5.5");

      // Model badge in bottom composer
      expect(html).toContain('data-testid="agent-composer-model-pill"');
    });

    it("renders with chosen model when setting is changed", () => {
      setSetting(AGENT_SETTING.MODEL, "antigravity:gemini-3.8-flash-high");
      const html = renderToStaticMarkup(<CanvasAgentPanel onClose={() => {}} />);

      expect(html).toContain("Antigravity · 3.8 Flash (High)");
    });
  });
});
