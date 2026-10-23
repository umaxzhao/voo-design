import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createToolTurn } from "../../electron/agent_tool_turn.js";
import { runAgentTurn, SYSTEM_PROMPT } from "../../src/canvas/agent/canvas_agent.js";
import { streamCliStep } from "../../src/canvas/agent/cli_agent_step.js";
import { CANVAS_TOOL_SCHEMAS, executeCanvasTool } from "../../src/canvas/agent/canvas_tools.js";
import { errorText } from "../../src/canvas/error_text.js";

import { loadLocale } from "../../src/shared/i18n.js";
beforeAll(async () => { await loadLocale("en"); });

const brief = "为一场音乐节草拟海报版式";
const setup = ["inspect_layer_tree", "list_variables", "update_plan", "create_variable_collection", ...Array(6).fill("create_variable")];
const options = { config: { model: "claude:claude-opus-5-5" }, history: [], userText: brief, tools: CANVAS_TOOL_SCHEMAS, executeCanvasTool };
afterEach(() => { delete globalThis.window; });

// Exercise the real native MCP pause/receipt handshake and renderer transport,
// replacing only Claude's nondeterministic model decisions and canvas host.
function nativeSequence(names, failure, args = {}) {
  let ended = false;
  const receipts = [];
  const turn = createToolTurn({ onIdleTimeout: () => { throw new Error("unexpected idle timeout"); } });
  const cancel = vi.fn(async () => { ended = true; turn.abort("cli.cancelled"); });
  const advance = vi.fn(async ({ messages }) => {
    const result = await turn.advance({ messages, isEnded: () => ended });
    return { ok: !result.error, sessionId: "poster-session", ...result };
  });
  globalThis.window = { vooDesktop: { localCli: { advance, cancel, onText: () => () => {} } } };
  const model = (async () => {
    try {
      for (const name of names) receipts.push(await turn.requestTool(name, args[name] ?? {}));
      ended = true;
      turn.complete(failure);
    } catch { /* cancellation rejects the parked MCP request */ }
  })();
  return { receipts, cancel, model };
}

describe("poster native tool-loop completion", () => {
  it("reproduces the old eight-step failure before any drawing and releases the parked CLI", async () => {
    const native = nativeSequence([...setup, "create_frame", "create_shape", "capture_canvas"]);
    const executeTool = vi.fn(async () => ({ ok: true }));
    await expect(runAgentTurn({ ...options, streamStep: streamCliStep, executeTool, maxSteps: 8 })).rejects.toMatchObject({ code: "agentStepLimit" });
    await native.model;
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(setup.slice(0, 8));
    expect(native.cancel).toHaveBeenCalledOnce();
  });

  it("continues beyond token setup to canvas creation and verification with the default budget", async () => {
    const names = [...setup, "create_frame", "create_shape", "capture_canvas"];
    const native = nativeSequence(names, null, {
      create_frame: { x: 0, y: 0, width: 800, height: 1200, name: "Festival poster" },
      create_shape: { kind: "text", x: 48, y: 48, width: 700, height: 120, text: "SUMMER SOUND" },
    });
    const nodes = [];
    const add = (kind, position, text) => {
      const node = { id: `node-${nodes.length}`, kind, ...position, ...(text ? { text } : {}) };
      nodes.push(node);
      return node;
    };
    window.__vooEditor = {
      getDocument: () => ({ nodes }),
      addFrameAt: position => add("frame", position),
      addTextAt: (position, text) => add("text", position, text),
      updateNode: (id, patch) => Object.assign(nodes.find(node => node.id === id), patch),
    };
    const executeTool = vi.fn(async (name, args) => ["create_frame", "create_shape"].includes(name)
      ? executeCanvasTool(name, args) : { ok: true });
    await runAgentTurn({ ...options, streamStep: streamCliStep, executeTool });
    await native.model;
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(names);
    expect(native.receipts).toHaveLength(names.length);
    expect(nodes).toEqual([
      expect.objectContaining({ kind: "frame", name: "Festival poster", width: 800, height: 1200 }),
      expect.objectContaining({ kind: "text", text: "SUMMER SOUND" }),
    ]);
    expect(native.cancel).not.toHaveBeenCalled();
  });

  it("preserves a native bridge failure after successful variable tools", async () => {
    const native = nativeSequence(setup, "CLI provider quota exhausted: sign in again");
    await expect(runAgentTurn({ ...options, streamStep: streamCliStep, executeTool: async () => ({ ok: true }) })).rejects.toThrow("CLI provider quota exhausted: sign in again");
    await native.model;
    expect(errorText(new Error("CLI provider quota exhausted: sign in again"))).toContain("CLI provider quota exhausted: sign in again");
  });
});

describe("poster content recovery", () => {
  it("nudges a variables-only completion to create layers", async () => {
    let step = 0;
    const streamStep = vi.fn(async () => ({ text: "Done", toolCalls: [
      [{ id: "v", name: "create_variable", arguments: "{}" }], [],
      [{ id: "f", name: "create_frame", arguments: "{}" }],
      [{ id: "c", name: "capture_canvas", arguments: "{}" }], [],
    ][step++] }));
    await runAgentTurn({ ...options, streamStep, executeTool: async () => ({ ok: true }) });
    expect(streamStep.mock.calls[2][0].messages.some(m => typeof m.content === "string" && m.content.includes("Only setup has been completed"))).toBe(true);
  });

  it("returns an actionable error if the model still stops without layers", async () => {
    await expect(runAgentTurn({ ...options, streamStep: async () => ({ text: "Done", toolCalls: [] }), executeTool: vi.fn() })).rejects.toMatchObject({ code: "agentNoCanvasContent" });
    expect(errorText({ code: "agentNoCanvasContent" })).not.toContain("agentNoCanvasContent");
    expect(errorText({ code: "agentStepLimit" })).not.toContain("agentStepLimit");
  });

  it.each(["Create color variables only", "Inspect the poster layout", "Explain poster typography"])("allows non-creation requests: %s", async userText => {
    const streamStep = vi.fn(async () => ({ text: "Done", toolCalls: [] }));
    await expect(runAgentTurn({ ...options, userText, streamStep, executeTool: vi.fn() })).resolves.toBe("Done");
    expect(streamStep).toHaveBeenCalledOnce();
  });

  it("keeps icons, HTML styling, composed layouts and short copy explicit in generation guidance", () => {
    expect(SYSTEM_PROMPT).toContain("Lucide");
    expect(SYSTEM_PROMPT).toContain("Tailwind utility classes");
    expect(SYSTEM_PROMPT).toContain("never emoji as icons");
    expect(SYSTEM_PROMPT).toContain("Prefer auto layout frames for composed layouts");
    expect(SYSTEM_PROMPT).toContain("short copy for on-canvas UI text");
    expect(SYSTEM_PROMPT).toContain("concise labels, headlines and body text");
    expect(SYSTEM_PROMPT).toContain("avoid chatty paragraphs");
    expect(SYSTEM_PROMPT).toContain("Keep replies short");
  });
});
