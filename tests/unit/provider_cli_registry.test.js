import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_CODEX_MODEL,
  CLAUDE_MODELS,
  CODEX_MODELS,
} from "../../src/shared/agent-defaults.js";
import {
  CLI_AGENTS,
  getVisibleCliAgents,
  isAntigravityOptedIn,
  setAntigravityOptedIn,
  isCliAgentConnected,
  cliConnectionReason,
  CLI_TRANSPORT,
} from "../../src/shared/cli-agents.js";
import {
  CLI_TEXT_MODELS,
  CLI_TEXT_MODEL_ID,
  API_MEDIA_TYPE,
  REMOTE_JOB_STATUS,
} from "../../src/shared/providers.js";
import {
  parseCliModelId,
  getProviderConfig,
  submitProviderJob,
  fetchProviderJob,
  streamProviderJob,
  canonicalizeCliModelId,
} from "../../src/shared/providers/provider_cli.js";
import { resetWebCliBridge } from "../../src/canvas/components/agent-panel/local_cli_bridge.js";

describe("Provider CLI Registry & Local Agent Defaults", () => {
  beforeEach(() => {
    resetWebCliBridge();
    delete globalThis.window;
  });

  afterEach(() => {
    resetWebCliBridge();
    delete globalThis.window;
  });

  describe("1. Agent Defaults & Claude Code Selection", () => {
    it("defaults to Claude Opus as primary agent model", () => {
      expect(DEFAULT_AGENT_MODEL).toBe("claude:claude-opus-5-5");
      expect(DEFAULT_CODEX_MODEL).toBe("gpt-6-astra");
    });

    it("lists Claude Code as a supported CLI agent with its install command", () => {
      const agent = CLI_AGENTS.find((a) => a.id === "claude");
      expect(agent).toBeDefined();
      expect(agent.displayName).toBe("Claude Code");
      expect(agent.supported).toBe(true);
      expect(agent.installCmd).toContain("@anthropic-ai/claude-code");
    });

    it("exports comprehensive Claude model definitions", () => {
      const ids = CLAUDE_MODELS.map((m) => m.id);
      expect(ids).toContain("claude-opus-5-5");
      expect(ids).toContain("opus");
      expect(ids).toContain("sonnet");
      expect(ids).toContain("haiku");
      expect(ids).toContain("best");
      expect(ids).toContain("default");
    });
  });

  describe("2. CLI_TEXT_MODELS Catalog Expansion", () => {
    it("CLI_TEXT_MODELS includes Claude Code, Codex, and Antigravity models", () => {
      const modelIds = CLI_TEXT_MODELS.map((m) => m.id);
      expect(modelIds).toContain("claude:claude-opus-5-5");
      expect(modelIds).toContain("claude:sonnet");
      expect(modelIds).toContain("codex:gpt-6-astra");
      expect(modelIds).toContain("antigravity:gemini-2.5-pro");
      expect(modelIds).toContain("antigravity:claude-3-7-sonnet");
    });

    it("CLI_TEXT_MODEL_ID matches DEFAULT_AGENT_MODEL", () => {
      expect(CLI_TEXT_MODEL_ID).toBe(DEFAULT_AGENT_MODEL);
      expect(CLI_TEXT_MODEL_ID).toBe("claude:claude-opus-5-5");
    });
  });

  describe("3. Antigravity CLI Support & Experimental Opt-in Gating", () => {
    it("antigravity is supported with its install command and default model", () => {
      const agy = CLI_AGENTS.find((a) => a.id === "antigravity");
      expect(agy).toBeDefined();
      expect(agy.supported).toBe(true);
      expect(agy.defaultModel).toBe("gemini-3.8-flash-high");
      expect(agy.installCmd).toContain("@google/antigravity-cli");
    });

    it("shows Antigravity by default and keeps it visible when opted in", () => {
      // 1. Default: visible
      const defaultVisible = getVisibleCliAgents(false);
      expect(defaultVisible.some((a) => a.id === "antigravity")).toBe(true);
      expect(defaultVisible.some((a) => a.id === "claude")).toBe(true);
      expect(defaultVisible.some((a) => a.id === "codex")).toBe(true);

      // 2. Opted in
      const optedInVisible = getVisibleCliAgents(true);
      expect(optedInVisible.some((a) => a.id === "antigravity")).toBe(true);
    });

    it("validates connection reason accurately based on transport and status", () => {
      const claude = CLI_AGENTS.find((a) => a.id === "claude");

      // No transport
      expect(cliConnectionReason(claude, null, CLI_TRANSPORT.NONE)).toBe(
        "agent.connection.desktopOnly",
      );

      // Not installed
      expect(
        cliConnectionReason(
          claude,
          { installed: false },
          CLI_TRANSPORT.RUNNABLE,
        ),
      ).toBe("agent.connection.notInstalled");

      // Unauthenticated
      expect(
        cliConnectionReason(
          claude,
          { installed: true, authenticated: false, ready: false },
          CLI_TRANSPORT.RUNNABLE,
        ),
      ).toBe("agent.connection.loginRequired");

      // Ready and connected
      expect(
        cliConnectionReason(
          claude,
          { installed: true, authenticated: true, ready: true },
          CLI_TRANSPORT.RUNNABLE,
        ),
      ).toBeNull();

      expect(
        isCliAgentConnected(
          claude,
          { installed: true, authenticated: true, ready: true },
          CLI_TRANSPORT.RUNNABLE,
        ),
      ).toBe(true);
    });
  });

  describe("4. Model ID Parsing & Canonicalization", () => {
    it("parses CLI model strings into cliId and model", () => {
      expect(parseCliModelId("claude:claude-opus-5-5")).toEqual({
        cliId: "claude",
        model: "claude-opus-5-5",
      });
      expect(parseCliModelId("codex:gpt-6-astra")).toEqual({
        cliId: "codex",
        model: "gpt-6-astra",
      });
      expect(parseCliModelId("antigravity:gemini-2.5-pro")).toEqual({
        cliId: "antigravity",
        model: "gemini-2.5-pro",
      });
    });

    it("rejects non-prefixed ordinary model identifiers", () => {
      expect(parseCliModelId("gpt-4o")).toEqual({
        cliId: null,
        model: null,
      });
      expect(parseCliModelId("")).toEqual({
        cliId: null,
        model: null,
      });
    });

    it("canonicalizes legacy model names to opus-5-5", () => {
      expect(canonicalizeCliModelId("claude:claude-opus-5")).toBe("claude:claude-opus-5-5");
      expect(canonicalizeCliModelId("opus-5")).toBe("claude-opus-5-5");
      expect(canonicalizeCliModelId("claude-opus-5-5")).toBe("claude-opus-5-5");
    });
  });

  describe("5. Provider Configuration & Honest Availability Reporting", () => {
    it("reports configured: false when no bridge is present", async () => {
      const config = await getProviderConfig();
      expect(config.configured).toBe(false);
      expect(config.error).toBe("cli.desktopOnly");
    });

    it("reports configured: true when bridge is available", async () => {
      globalThis.window = {
        vooDesktop: {
          localCli: {
            checkAll: async () => ({ claude: { ready: true } }),
          },
        },
      };

      const config = await getProviderConfig();
      expect(config.configured).toBe(true);
      expect(config.error).toBeNull();
    });
  });

  describe("6. Job Submission, Fetch & Streaming Execution", () => {
    it("rejects non-text media types", async () => {
      await expect(
        submitProviderJob({ mediaType: API_MEDIA_TYPE.IMAGE }),
      ).rejects.toThrow("cli.textOnly");
    });

    it("submits and executes CLI text job through the runText channel", async () => {
      globalThis.window = {
        vooDesktop: {
          localCli: {
            runText: async (cliId, { prompt }) => ({
              ok: true,
              text: `Generated response to: ${prompt}`,
            }),
          },
        },
      };

      const submitRes = await submitProviderJob({
        mediaType: API_MEDIA_TYPE.TEXT,
        request: {
          model: "claude:claude-opus-5-5",
          prompt: "Generate wireframe nodes",
        },
      });

      expect(submitRes.status).toBe(REMOTE_JOB_STATUS.PROCESSING);
      expect(submitRes.taskId).toBeDefined();

      const fetchRes = await fetchProviderJob({ taskId: submitRes.taskId });
      expect(fetchRes.status).toBe(REMOTE_JOB_STATUS.COMPLETED);
      expect(fetchRes.text).toBe("Generated response to: Generate wireframe nodes");
    });
  });
});
