import { describe, it, expect, vi, afterEach } from "vitest";
import { isCliAgentModel, streamCliStep } from "../../src/canvas/agent/cli_agent_step.js";

function setBridge(localCli) {
  globalThis.window = { vooDesktop: { localCli: { onText: () => () => {}, ...localCli } } };
}

describe("isCliAgentModel", () => {
  it("accepts the three CLI agents", () => {
    expect(isCliAgentModel("claude:claude-opus-5-5")).toBe(true);
    expect(isCliAgentModel("codex:gpt-6-astra")).toBe(true);
    expect(isCliAgentModel("antigravity:")).toBe(true);
  });

  it("rejects HTTP model ids and unknown CLIs", () => {
    expect(isCliAgentModel("gpt-4o")).toBe(false);
    expect(isCliAgentModel("opencode:some-model")).toBe(false);
    expect(isCliAgentModel("")).toBe(false);
  });
});

describe("streamCliStep", () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it.each(["codex:gpt-6-astra", "claude:sonnet"])("returns tool receipts to the same native session across model steps: %s", async (model) => {
    const advance = vi.fn()
      .mockResolvedValueOnce({ ok: true, sessionId: "native-session", done: false, text: "Working.",
        toolCalls: [{ id: "tool-1", function: { name: "create_frame", arguments: "{}" } }] })
      .mockResolvedValueOnce({ ok: true, sessionId: "native-session", done: true, text: "Working.Done." });
    setBridge({ advance, cancel: vi.fn() });
    const signal = new AbortController().signal;
    const options = { config: { model }, tools: [], signal };
    await streamCliStep({ ...options, messages: [{ role: "user", content: "make a frame" }] });
    const messages = [{ role: "tool", tool_call_id: "tool-1", content: '{"ok":true}' }];
    const result = await streamCliStep({ ...options, messages });
    expect(advance.mock.calls[1][0].sessionId).toBe("native-session");
    expect(advance.mock.calls[1][0].messages).toEqual(messages);
    expect(result.text).toBe("Done.");
    // A completed turn must not leak its native session into another turn.
    advance.mockResolvedValueOnce({ ok: true, done: true, text: "Fresh." });
    await streamCliStep({ ...options, messages: [] });
    expect(advance.mock.calls[2][0].sessionId).toBeUndefined();
  });

  it("returns streamed text and the tool intents the CLI reported", async () => {
    setBridge({
      advance: async (opts) => ({
        ok: true,
        threadId: opts.threadId,
        done: false,
        text: "Making a frame.",
        toolCalls: [{ index: 0, id: "call_1", type: "function", function: { name: "create_frame", arguments: '{"width":400}' } }],
      }),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
    });
    const seen = [];
    const step = await streamCliStep({
      config: { model: "claude:claude-opus-5-5" },
      messages: [{ role: "user", content: "make a frame" }],
      tools: [],
      signal: new AbortController().signal,
      onText: (t) => seen.push(t),
    });
    expect(step.text).toBe("Making a frame.");
    expect(seen.join("")).toBe("Making a frame.");
    expect(step.toolCalls).toEqual([{ id: "call_1", name: "create_frame", arguments: '{"width":400}' }]);
  });

  it("returns no tool calls when the turn ends in plain text", async () => {
    setBridge({
      advance: async (opts) => ({ ok: true, threadId: opts.threadId, done: true, text: "Done." }),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
    });
    const step = await streamCliStep({
      config: { model: "codex:gpt-6-astra" },
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      signal: new AbortController().signal,
    });
    expect(step.text).toBe("Done.");
    expect(step.toolCalls).toEqual([]);
  });
});
