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
  getModelDisplayParts,
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
      expect(ids).toContain("claude:claude-sonnet-5-5");
      expect(ids).toContain("claude:claude-haiku-5-5");
    });

    it("includes required models in Codex group", () => {
      const codexGroup = CLI_MODEL_GROUPS.find((g) => g.cliId === "codex");
      expect(codexGroup).toBeDefined();
      const ids = codexGroup.models.map((m) => m.id);
      expect(ids).toContain("codex:gpt-6-astra");
      expect(ids).not.toContain("codex:gpt-5.6-terra");
    });

    it("includes required models in Antigravity group", () => {
      const agyGroup = CLI_MODEL_GROUPS.find((g) => g.cliId === "antigravity");
      expect(agyGroup).toBeDefined();
      const ids = agyGroup.models.map((m) => m.id);
      expect(ids).toContain("antigravity:gemini-3.8-flash-high");
      expect(ids).toContain("antigravity:claude-sonnet-5-5-high");
      expect(ids).toContain("antigravity:claude-opus-5-5-high");
      expect(ids).toContain("antigravity:gpt-oss-120b-medium");
      expect(ids).not.toContain("antigravity:claude-sonnet-4-6");
      expect(ids).not.toContain("antigravity:gemini-2.5-pro");
    });
  });

  describe("2. getModelDisplayLabel formatting", () => {
    it("formats known Claude models cleanly", () => {
      const label = getModelDisplayLabel("claude:claude-opus-5-5");
      expect(label).toBe("Opus 5.5");
    });

    it("formats known Codex models cleanly", () => {
      const label = getModelDisplayLabel("codex:gpt-6-astra");
      expect(label).toBe("GPT-6 Astra");
    });

    it("formats known Antigravity models cleanly", () => {
      const label = getModelDisplayLabel("antigravity:gemini-3.8-flash-high");
      expect(label).toBe("3.8 FlashHigh");
    });

    it("gracefully falls back for unknown prefixes", () => {
      const label = getModelDisplayLabel("custom:special-v1");
      expect(label).toBe("special-v1");
    });

    it("separates platform icon metadata from adjacent model and tier text", () => {
      expect(
        getModelDisplayParts("antigravity:gemini-3.8-flash-medium"),
      ).toMatchObject({
        providerId: "antigravity-cli",
        platformName: "Antigravity",
        modelName: "3.8 Flash",
        tier: "Medium",
      });
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
      expect(getSetting(AGENT_SETTING.MODEL)).toBe(
        "antigravity:gemini-3.8-flash-high",
      );
    });

    it("keeps the only model selector in the bottom composer", () => {
      setSetting(AGENT_SETTING.MODEL, "claude:claude-opus-5-5");
      const html = renderToStaticMarkup(
        <CanvasAgentPanel onClose={() => {}} />,
      );

      expect(html).not.toContain('data-testid="agent-model-pill"');
      expect(html).toContain("Claude Code Opus 5.5");
      expect(html.match(/voo-ai-fab-icon/g)).toHaveLength(1);

      expect(html).toContain('data-testid="agent-composer-model-pill"');
      expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(1);
    });

    it("renders with chosen model when setting is changed", () => {
      setSetting(AGENT_SETTING.MODEL, "antigravity:gemini-3.8-flash-high");
      const html = renderToStaticMarkup(
        <CanvasAgentPanel onClose={() => {}} />,
      );

      expect(html).toContain("3.8 FlashHigh");
      expect(html).toContain("brand-icons/antigravity.svg");
    });
  });
});
