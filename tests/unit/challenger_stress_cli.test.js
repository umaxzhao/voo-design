import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseCliModelId,
  canonicalizeCliModelId,
} from "../../src/shared/providers/provider_cli.js";
import {
  CLI_AGENTS,
  getVisibleCliAgents,
  VISIBLE_CLI_AGENTS,
  isAntigravityOptedIn,
  setAntigravityOptedIn,
  ANTIGRAVITY_OPT_IN_KEY,
  CLI_TRANSPORT,
} from "../../src/shared/cli-agents.js";
import {
  CLI_TEXT_MODELS,
  CLI_TEXT_MODEL_ID,
} from "../../src/shared/providers.js";
import {
  DEFAULT_AGENT_MODEL,
} from "../../src/shared/agent-defaults.js";
import {
  streamCodexCompletion,
  closeCodexSession,
} from "../../src/canvas/components/agent-panel/codex_transport.js";
import { resetWebCliBridge } from "../../src/canvas/components/agent-panel/local_cli_bridge.js";
import {
  findCliBinary,
  checkCliAuth,
  checkCliStatus,
  checkAllCliStatus,
  clearCliBinaryCache,
  CLI_DEFINITIONS,
} from "../../electron/local_backend_bridge.js";

/** Text carried by one OpenAI-style chunk from the CLI transport. */
const textOf = (chunk) => chunk.choices?.[0]?.delta?.content ?? "";
/** The final chunk carries finish_reason "stop" when the turn completed. */
const isDone = (chunk) => chunk.choices?.[0]?.finish_reason === "stop";

describe("Adversarial Stress Testing: Challenger M1 CLI 2", () => {
  beforeEach(() => {
    resetWebCliBridge();
    clearCliBinaryCache();
    delete globalThis.window;
  });

  afterEach(() => {
    resetWebCliBridge();
    clearCliBinaryCache();
    delete globalThis.window;
  });

  // =========================================================================
  // 1. parseCliModelId & Registry Stress Testing
  // =========================================================================
  describe("1. parseCliModelId Edge Cases & Adversarial Inputs", () => {
    it("handles empty, null, undefined, and non-string inputs safely without throwing", () => {
      expect(parseCliModelId("")).toEqual({ cliId: null, model: null });
      expect(parseCliModelId(null)).toEqual({ cliId: null, model: null });
      expect(parseCliModelId(undefined)).toEqual({ cliId: null, model: null });
      expect(parseCliModelId("   ")).toEqual({ cliId: null, model: null });
      expect(parseCliModelId(123)).toEqual({ cliId: null, model: null });
      expect(parseCliModelId(true)).toEqual({ cliId: null, model: null });
      expect(parseCliModelId({})).toEqual({ cliId: null, model: null });
      expect(parseCliModelId([])).toEqual({ cliId: null, model: null });
    });

    it("handles bare model IDs without colons as non-CLI models", () => {
      expect(parseCliModelId("gpt-4o")).toEqual({ cliId: null, model: null });
      expect(parseCliModelId("claude-opus-5-5")).toEqual({ cliId: null, model: null });
      expect(parseCliModelId("deepseek-chat")).toEqual({ cliId: null, model: null });
    });

    it("handles leading, trailing, and isolated colons", () => {
      // Leading colon: no cliId
      expect(parseCliModelId(":model")).toEqual({ cliId: null, model: null });
      expect(parseCliModelId("::")).toEqual({ cliId: null, model: null });
      expect(parseCliModelId(":::")).toEqual({ cliId: null, model: null });

      // Trailing colon: cliId present, but model is empty string -> null
      expect(parseCliModelId("claude:")).toEqual({ cliId: "claude", model: null });
      expect(parseCliModelId("codex:")).toEqual({ cliId: "codex", model: null });
      expect(parseCliModelId("antigravity:")).toEqual({ cliId: "antigravity", model: null });
    });

    it("preserves multiple colons within model identifier without truncation", () => {
      expect(parseCliModelId("claude:claude-opus-5-5:preview:v2")).toEqual({
        cliId: "claude",
        model: "claude-opus-5-5:preview:v2",
      });
      expect(parseCliModelId("antigravity:gemini:custom:snapshot")).toEqual({
        cliId: "antigravity",
        model: "gemini:custom:snapshot",
      });
      expect(parseCliModelId("codex:org:project:model-id")).toEqual({
        cliId: "codex",
        model: "org:project:model-id",
      });
    });

    it("parses unknown CLI identifiers neutrally without throwing", () => {
      expect(parseCliModelId("unknown_cli:some_model")).toEqual({
        cliId: "unknown_cli",
        model: "some_model",
      });
      expect(parseCliModelId("ollama:llama3")).toEqual({
        cliId: "ollama",
        model: "llama3",
      });
    });

    it("canonicalizes legacy opus-5 model variations correctly", () => {
      expect(canonicalizeCliModelId("claude:claude-opus-5")).toBe("claude:claude-opus-5-5");
      expect(canonicalizeCliModelId("claude:opus-5")).toBe("claude:claude-opus-5-5");
      expect(canonicalizeCliModelId("opus-5")).toBe("claude-opus-5-5");
      expect(canonicalizeCliModelId("claude-opus-5")).toBe("claude-opus-5-5");
      expect(canonicalizeCliModelId("claude:claude-opus-5-5")).toBe("claude:claude-opus-5-5");
      expect(canonicalizeCliModelId("other-model")).toBe("other-model");
      expect(canonicalizeCliModelId("")).toBe("");
      expect(canonicalizeCliModelId(null)).toBeNull();
    });
  });

  // =========================================================================
  // 1b. Antigravity Opt-in Flags & Visibility
  // =========================================================================
  describe("1b. Antigravity Opt-in Flags & Registry Integrity", () => {
    it("keeps Antigravity visible through the VISIBLE_CLI_AGENTS proxy regardless of the opt-in flag", () => {
      setAntigravityOptedIn(false);
      expect(isAntigravityOptedIn()).toBe(false);

      expect(getVisibleCliAgents().map((a) => a.id)).toContain("antigravity");
      expect([...VISIBLE_CLI_AGENTS].map((a) => a.id)).toContain("antigravity");

      setAntigravityOptedIn(true);
      expect(isAntigravityOptedIn()).toBe(true);

      expect(getVisibleCliAgents().map((a) => a.id)).toContain("antigravity");
      expect([...VISIBLE_CLI_AGENTS].map((a) => a.id)).toContain("antigravity");

      // Reset
      setAntigravityOptedIn(false);
    });

    it("verifies CLI_TEXT_MODELS includes valid prefixes matching CLI_AGENTS", () => {
      const agentIds = new Set(CLI_AGENTS.map((a) => a.id));
      for (const item of CLI_TEXT_MODELS) {
        const { cliId, model } = parseCliModelId(item.id);
        expect(cliId).not.toBeNull();
        expect(agentIds.has(cliId)).toBe(true);
        expect(model).toBeTruthy();
      }
    });

    it("ensures DEFAULT_AGENT_MODEL is parseable and routes to a valid CLI agent", () => {
      const { cliId, model } = parseCliModelId(DEFAULT_AGENT_MODEL);
      expect(["claude", "codex"]).toContain(cliId);
      expect(typeof model).toBe("string");
    });
  });

  // =========================================================================
  // 2. codex_transport.js Stream Generator Stress Testing
  // =========================================================================
  describe("2. codex_transport.js Stream Generator Lifecycle & Resilience", () => {
    function setupMockWindowBridge(mockBridge) {
      globalThis.window = {
        vooDesktop: {
          localCli: { onText: () => () => {}, ...mockBridge },
        },
      };
    }

    it("rejects immediately if AbortSignal is already aborted before calling streamCodexCompletion", async () => {
      const controller = new AbortController();
      controller.abort();

      const advanceSpy = vi.fn();
      setupMockWindowBridge({
        advance: advanceSpy,
        cancel: vi.fn(),
      });

      const gen = streamCodexCompletion({
        cliId: "claude",
        model: "claude:claude-opus-5-5",
        prompt: "Hello",
        signal: controller.signal,
      });

      await expect(gen.next()).rejects.toThrow("Stopped");
      expect(advanceSpy).not.toHaveBeenCalled();
    });

    it("rejects unsupported CLI models with agent.connection.unsupported", async () => {
      setupMockWindowBridge({
        advance: vi.fn(),
        cancel: vi.fn(),
      });

      const gen = streamCodexCompletion({
        model: "unsupported_cli:some_model",
        prompt: "Hello",
      });

      await expect(gen.next()).rejects.toThrow("agent.connection.unsupported");
    });

    it("rejects bare non-CLI model strings with agent.connection.unsupported", async () => {
      setupMockWindowBridge({
        advance: vi.fn(),
        cancel: vi.fn(),
      });

      const gen = streamCodexCompletion({
        model: "gpt-4o",
        prompt: "Hello",
      });

      await expect(gen.next()).rejects.toThrow("agent.connection.unsupported");
    });

    it("handles multiple incremental text events with matching requestId", async () => {
      let listener = null;
      setupMockWindowBridge({
        advance: async (opts) => {
          // Push text chunks incrementally
          setTimeout(() => {
            listener?.({ requestId: opts.requestId, text: "Chunk 1: Hello " });
            listener?.({ requestId: opts.requestId, text: "Chunk 2: Beautiful " });
            listener?.({ requestId: opts.requestId, text: "Chunk 3: World!" });
          }, 10);

          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                threadId: opts.threadId,
                done: true,
                text: "Chunk 1: Hello Chunk 2: Beautiful Chunk 3: World!",
              });
            }, 30);
          });
        },
        cancel: vi.fn().mockResolvedValue({ ok: true }),
        onText: (fn) => {
          listener = fn;
          return () => {
            listener = null;
          };
        },
      });

      const chunks = [];
      for await (const chunk of streamCodexCompletion({
        model: "claude:claude-opus-5-5",
        prompt: "Write a phrase",
      })) {
        chunks.push(chunk);
      }

      // Must have yielded chunks for each text event + 1 final done chunk
      expect(chunks.length).toBeGreaterThanOrEqual(4);
      const textOnly = chunks.filter((c) => !isDone(c)).map(textOf).join("");
      expect(textOnly).toBe("Chunk 1: Hello Chunk 2: Beautiful Chunk 3: World!");

      const lastChunk = chunks[chunks.length - 1];
      expect(isDone(lastChunk)).toBe(true);
      expect(textOf(lastChunk)).toBe("");
    });

    it("handles cumulative text events using offsets without duplicating text", async () => {
      let listener = null;
      setupMockWindowBridge({
        advance: async (opts) => {
          setTimeout(() => {
            listener?.({ requestId: opts.requestId, text: "Part A", offset: 0 });
            listener?.({ requestId: opts.requestId, text: "Part A + Part B", offset: 0 });
          }, 10);

          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                threadId: opts.threadId,
                done: true,
                text: "Part A + Part B",
              });
            }, 30);
          });
        },
        cancel: vi.fn().mockResolvedValue({ ok: true }),
        onText: (fn) => {
          listener = fn;
          return () => {
            listener = null;
          };
        },
      });

      const chunks = [];
      for await (const chunk of streamCodexCompletion({
        model: "codex:gpt-6-astra",
        prompt: "Generate parts",
      })) {
        chunks.push(chunk);
      }

      const textOnly = chunks.filter((c) => !isDone(c)).map(textOf).join("");
      expect(textOnly).toBe("Part A + Part B");
    });

    it("correctly propagates errors thrown by bridge.advance", async () => {
      setupMockWindowBridge({
        advance: async () => {
          throw new Error("CLI subprocess crashed unexpectedly");
        },
        cancel: vi.fn().mockResolvedValue({ ok: true }),
        onText: () => () => {},
      });

      const gen = streamCodexCompletion({
        model: "claude:claude-opus-5-5",
        prompt: "Crash test",
      });

      await expect(gen.next()).rejects.toThrow("CLI subprocess crashed unexpectedly");
    });

    it("correctly throws when advance returns { ok: false, error: ... }", async () => {
      setupMockWindowBridge({
        advance: async () => {
          return {
            ok: false,
            error: "Rate limit exceeded on provider",
            code: "rate_limit",
          };
        },
        cancel: vi.fn().mockResolvedValue({ ok: true }),
        onText: () => () => {},
      });

      const gen = streamCodexCompletion({
        model: "antigravity:gemini-2.5-pro",
        prompt: "Rate limit test",
      });

      await expect(gen.next()).rejects.toThrow("Rate limit exceeded on provider");
    });

    it("cancels bridge and aborts stream when AbortSignal fires during streaming", async () => {
      const controller = new AbortController();
      let listener = null;
      const cancelSpy = vi.fn().mockResolvedValue({ ok: true });

      setupMockWindowBridge({
        advance: async (opts) => {
          setTimeout(() => {
            listener?.({ requestId: opts.requestId, text: "Starting..." });
          }, 10);
          // Never resolve on its own to simulate long stream
          return new Promise(() => {});
        },
        cancel: cancelSpy,
        onText: (fn) => {
          listener = fn;
          return () => {
            listener = null;
          };
        },
      });

      const gen = streamCodexCompletion({
        model: "claude:claude-opus-5-5",
        prompt: "Abort mid-stream",
        signal: controller.signal,
      });

      // 1. First chunk should succeed
      const first = await gen.next();
      expect(textOf(first.value)).toBe("Starting...");
      expect(isDone(first.value)).toBe(false);

      // 2. Abort while suspended
      setTimeout(() => {
        controller.abort();
      }, 10);

      // 3. Next read should throw AbortError
      await expect(gen.next()).rejects.toThrow("Stopped");
      expect(cancelSpy).toHaveBeenCalled();
    });

    it("cancels bridge when consumer breaks early out of for await...of loop", async () => {
      let listener = null;
      const cancelSpy = vi.fn().mockResolvedValue({ ok: true });

      setupMockWindowBridge({
        advance: async (opts) => {
          setTimeout(() => {
            listener?.({ requestId: opts.requestId, text: "Chunk 1" });
            listener?.({ requestId: opts.requestId, text: "Chunk 2" });
          }, 10);
          return new Promise(() => {});
        },
        cancel: cancelSpy,
        onText: (fn) => {
          listener = fn;
          return () => {
            listener = null;
          };
        },
      });

      for await (const chunk of streamCodexCompletion({
        model: "claude:claude-opus-5-5",
        prompt: "Early break",
      })) {
        if (textOf(chunk)) {
          break; // Early return from loop
        }
      }

      // Generator finally block must trigger cancel
      expect(cancelSpy).toHaveBeenCalled();
    });

    it("handles tool calls in completion result with finish_reason: tool_calls", async () => {
      const mockToolCalls = [
        {
          id: "call_123",
          type: "function",
          function: { name: "create_frame", arguments: '{"width": 400}' },
        },
      ];

      setupMockWindowBridge({
        advance: async (opts) => ({
          ok: true,
          threadId: opts.threadId,
          text: "I will create a frame for you.",
          toolCalls: mockToolCalls,
          done: false, // tool calls pending execution
        }),
        cancel: vi.fn().mockResolvedValue({ ok: true }),
        onText: () => () => {},
      });

      const chunks = [];
      for await (const chunk of streamCodexCompletion({
        model: "claude:claude-opus-5-5",
        prompt: "Create frame",
      })) {
        chunks.push(chunk);
      }

      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.choices[0].delta.tool_calls).toEqual(mockToolCalls);
      expect(finalChunk.choices[0].finish_reason).toBe("tool_calls");
    });
  });

  // =========================================================================
  // 3. findCliBinary & checkCliStatus Stress Testing
  // =========================================================================
  describe("3. findCliBinary & checkCliStatus Environment & Path Boundaries", () => {
    const tempTestDir = path.join(os.tmpdir(), `voo_test_cli_${Date.now()}`);

    beforeEach(() => {
      fs.mkdirSync(tempTestDir, { recursive: true });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch {}
    });

    it("finds binary in custom searchDirs with high precedence", () => {
      const binDir = path.join(tempTestDir, "custom_bin");
      fs.mkdirSync(binDir, { recursive: true });
      const fakeBinary = path.join(binDir, "claude");
      fs.writeFileSync(fakeBinary, "#!/bin/sh\necho 1", { mode: 0o755 });

      const found = findCliBinary(["claude"], {
        searchDirs: [binDir],
        env: { PATH: "", HOME: tempTestDir },
      });

      expect(found).toBe(fakeBinary);
    });

    it("ignores directories that match the binary name", () => {
      const dirNamedClaude = path.join(tempTestDir, "claude");
      fs.mkdirSync(dirNamedClaude, { recursive: true });

      const found = findCliBinary(["claude"], {
        searchDirs: [tempTestDir],
        env: { PATH: "", HOME: tempTestDir },
      });

      expect(found).toBeNull();
    });

    it("finds binary in user HOME subdirectories such as .gemini/antigravity-cli/bin", () => {
      const agyDir = path.join(tempTestDir, ".gemini", "antigravity-cli", "bin");
      fs.mkdirSync(agyDir, { recursive: true });
      const fakeAgy = path.join(agyDir, "agy");
      fs.writeFileSync(fakeAgy, "#!/bin/sh\necho agy", { mode: 0o755 });

      const found = findCliBinary(["agy", "antigravity"], {
        env: { HOME: tempTestDir, PATH: "" },
      });

      expect(found).toBe(fakeAgy);
    });

    it("respects cache TTL and invalidates upon clearCliBinaryCache()", () => {
      const binDir = path.join(tempTestDir, "cache_test");
      fs.mkdirSync(binDir, { recursive: true });
      const fakeBin = path.join(binDir, "codex");

      // 1. Binary does not exist yet -> null cached
      const notFound = findCliBinary(["codex"], {
        searchDirs: [binDir],
        env: { PATH: "", HOME: tempTestDir },
      });
      expect(notFound).toBeNull();

      // 2. Create binary on disk
      fs.writeFileSync(fakeBin, "#!/bin/sh\necho codex", { mode: 0o755 });

      // 3. Immediate search still returns cached null
      const stillNotFound = findCliBinary(["codex"], {
        searchDirs: [binDir],
        env: { PATH: "", HOME: tempTestDir },
      });
      expect(stillNotFound).toBeNull();

      // 4. Invalidate cache -> now finds the binary
      clearCliBinaryCache();
      const nowFound = findCliBinary(["codex"], {
        searchDirs: [binDir],
        env: { PATH: "", HOME: tempTestDir },
      });
      expect(nowFound).toBe(fakeBin);
    });

    it("evaluates checkCliAuth honestly across credential sources", async () => {
      // 1. Codex auth via OPENAI_API_KEY
      const codexEnvAuth = await checkCliAuth("codex", "/fake/codex", {
        env: { OPENAI_API_KEY: "sk-test-123", HOME: tempTestDir },
      });
      expect(codexEnvAuth.authenticated).toBe(true);

      // 2. Codex auth via auth.json tokens
      const codexHome = path.join(tempTestDir, ".codex");
      fs.mkdirSync(codexHome, { recursive: true });
      fs.writeFileSync(
        path.join(codexHome, "auth.json"),
        JSON.stringify({ tokens: { access_token: "tok_abc" } }),
      );

      const codexFileAuth = await checkCliAuth("codex", "/fake/codex", {
        env: { HOME: tempTestDir, CODEX_HOME: codexHome },
      });
      expect(codexFileAuth.authenticated).toBe(true);

      // 3. Codex auth fails on corrupted auth.json without throwing
      fs.writeFileSync(path.join(codexHome, "auth.json"), "{ invalid json");
      const codexCorruptedAuth = await checkCliAuth("codex", "/fake/codex", {
        env: { HOME: tempTestDir, CODEX_HOME: codexHome },
      });
      expect(codexCorruptedAuth.authenticated).toBe(false);

      // 4. Claude auth via ANTHROPIC_API_KEY
      const claudeEnvAuth = await checkCliAuth("claude", "/fake/claude", {
        env: { ANTHROPIC_API_KEY: "sk-ant-test", HOME: tempTestDir },
      });
      expect(claudeEnvAuth.authenticated).toBe(true);

      // 5. Antigravity auth via GEMINI_API_KEY
      const agyEnvAuth = await checkCliAuth("antigravity", "/fake/agy", {
        env: { GEMINI_API_KEY: "gem-test", HOME: tempTestDir },
      });
      expect(agyEnvAuth.authenticated).toBe(true);

      // 6. Antigravity auth via token file
      const geminiDir = path.join(tempTestDir, ".gemini", "antigravity-cli");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(path.join(geminiDir, "antigravity-oauth-token"), "token");

      const agyFileAuth = await checkCliAuth("antigravity", "/fake/agy", {
        env: { HOME: tempTestDir },
      });
      expect(agyFileAuth.authenticated).toBe(true);
    });

    it("returns honest checkCliStatus and checkAllCliStatus structures", async () => {
      // Create a fake claude binary
      const claudeDir = path.join(tempTestDir, "bin");
      fs.mkdirSync(claudeDir, { recursive: true });
      const fakeClaude = path.join(claudeDir, "claude");
      fs.writeFileSync(fakeClaude, "#!/bin/sh\n", { mode: 0o755 });

      // Claude: installed but unauthenticated
      const claudeStatus = await checkCliStatus("claude", {
        searchDirs: [claudeDir],
        env: { HOME: tempTestDir, PATH: "" },
      });
      expect(claudeStatus.installed).toBe(true);
      expect(claudeStatus.authenticated).toBe(false);
      expect(claudeStatus.ready).toBe(false);
      expect(claudeStatus.status).toBe("unauthenticated");
      expect(claudeStatus.binPath).toBe(fakeClaude);

      // Claude: installed and authenticated via env
      const claudeReady = await checkCliStatus("claude", {
        searchDirs: [claudeDir],
        env: { HOME: tempTestDir, PATH: "", ANTHROPIC_API_KEY: "sk-test" },
      });
      expect(claudeReady.ready).toBe(true);
      expect(claudeReady.status).toBe("ready");

      // Antigravity: not installed in this clean temp environment
      const agyStatus = await checkCliStatus("antigravity", {
        env: { HOME: tempTestDir, PATH: "" },
      });
      expect(agyStatus.installed).toBe(false);
      expect(agyStatus.ready).toBe(false);
      expect(agyStatus.status).toBe("not_installed");
      expect(agyStatus.installCmd).toContain("@google/antigravity-cli");

      // Unknown tool
      const unknownStatus = await checkCliStatus("nonexistent_tool");
      expect(unknownStatus.installed).toBe(false);
      expect(unknownStatus.reasonKey).toBe("provider.cli.unknown");

      // checkAllCliStatus returns all tools
      const all = await checkAllCliStatus({
        searchDirs: [claudeDir],
        env: { HOME: tempTestDir, PATH: "" },
      });
      expect(all.claude).toBeDefined();
      expect(all.codex).toBeDefined();
      expect(all.antigravity).toBeDefined();
      expect(all.opencode).toBeDefined();
    });

    it("findCliBinary safely returns null when names is null or empty", () => {
      expect(findCliBinary(null, { env: { HOME: tempTestDir, PATH: "" } })).toBeNull();
      expect(findCliBinary([], { env: { HOME: tempTestDir, PATH: "" } })).toBeNull();
      expect(findCliBinary([""], { env: { HOME: tempTestDir, PATH: "" } })).toBeNull();
    });

    it("checkCliStatus reports not_installed when binPath does not exist on disk", async () => {
      const nonExistentPath = path.join(tempTestDir, "ghost_claude");
      expect(fs.existsSync(nonExistentPath)).toBe(false);

      const status = await checkCliStatus("claude", {
        binPath: nonExistentPath,
        env: { HOME: tempTestDir, ANTHROPIC_API_KEY: "sk-ant-test" },
      });

      expect(status.status).toBe("not_installed");
      expect(status.installed).toBe(false);
      expect(status.ready).toBe(false);
    });
  });

  // =========================================================================
  // 4. Cross-Module Regression: streamLayoutText & codex_transport crash
  // =========================================================================
  describe("4. Cross-Module Regressions & Cancellation Failure Under Stress", () => {
    it("codex_transport completes cleanly without spurious cancel rejections when signal is omitted", async () => {
      globalThis.window = {
        vooDesktop: {
          localCli: {
            advance: async (opts) => ({
              ok: true,
              threadId: opts.threadId,
              text: "Success text",
              done: true,
            }),
            cancel: vi.fn().mockRejectedValue(new Error("Bridge socket disconnect during cleanup")),
            onText: () => () => {},
          },
        },
      };

      const collected = [];
      let caughtError = null;
      try {
        for await (const chunk of streamCodexCompletion({
          model: "claude:claude-opus-5-5",
          prompt: "Clean request without signal",
        })) {
          collected.push(chunk);
        }
      } catch (err) {
        caughtError = err;
      }

      // Verifies the fix: With finished === true, cancelNativeRequest is NOT called, so stream succeeds without error
      expect(collected.some(isDone)).toBe(true);
      expect(caughtError).toBeNull();
    });

    it("streamLayoutText routes Claude Code and Antigravity CLI models to CLI bridge without error", async () => {
      const { streamLayoutText } = await import("../../src/canvas/store/layout_action_helpers.js");

      globalThis.window = {
        vooDesktop: {
          localCli: {
            advance: async (opts) => ({
              ok: true,
              threadId: opts.threadId,
              text: "<html><body>Generated</body></html>",
              done: true,
            }),
            cancel: vi.fn().mockResolvedValue({ ok: true }),
            onText: () => () => {},
          },
        },
      };

      let text = "";
      await streamLayoutText({
        model: DEFAULT_AGENT_MODEL,
        prompt: "Test prompt",
        onChunk: (chunk) => {
          text = chunk.text;
        },
      });

      expect(text).toBe("<html><body>Generated</body></html>");
    });
  });
});

