import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANVAS_TOOL_NAMES, CANVAS_TOOL_SCHEMAS } from "../../src/canvas/agent/canvas_tools.js";
import { runAgentTurn, SYSTEM_PROMPT } from "../../src/canvas/agent/canvas_agent.js";
import { isCliAgentModel, streamCliStep } from "../../src/canvas/agent/cli_agent_step.js";
import { findPersonaById, formatPersonaPrompt } from "../../src/shared/agent_persona.js";

/** Core tools the agent's documented workflow depends on; a rename here must be deliberate. */
const CORE_TOOL_NAMES = [
  "inspect_layer_tree",
  "inspect_layout",
  "lint_design",
  "create_frame",
  "create_shape",
  "create_path",
  "mutate_layer_layout",
  "mutate_layer_style",
  "mutate_layer_text",
  "mutate_auto_layout",
  "batch_mutate_layers",
  "set_code_connect",
  "new_document",
  "resize_document",
  "capture_canvas",
];

/** Prompt words that are protocol/status vocabulary rather than tool names. */
const PROMPT_NON_TOOL_WORDS = new Set(["in_progress"]);

describe("CANVAS_TOOL_SCHEMAS completeness", () => {
  it("exposes every canvas tool the agent is told to use", () => {
    const names = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    // CANVAS_TOOL_NAMES is derived from the schemas: one source of truth, and a
    // registered tool can never be forgotten by a hand-maintained list again.
    expect([...CANVAS_TOOL_NAMES]).toEqual(names);
    expect(CANVAS_TOOL_NAMES.length).toBeGreaterThan(0);
    expect(new Set(CANVAS_TOOL_NAMES).size).toBe(names.length);
    for (const name of CORE_TOOL_NAMES) {
      expect(CANVAS_TOOL_NAMES, `registry is missing core tool ${name}`).toContain(name);
    }
  });

  it("documents every registered tool in docs/agents.md", () => {
    const catalog = readFileSync(resolve(process.cwd(), "docs/agents.md"), "utf8");
    for (const name of CANVAS_TOOL_NAMES) {
      expect(catalog, `Missing \`${name}\` from docs/agents.md`).toContain(`\`${name}\``);
    }
  });

  it("keeps the system prompt free of tool names the registry does not expose", () => {
    const mentioned = new Set(
      [...SYSTEM_PROMPT.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)]
        .map((match) => match[1])
        .filter((token) => !PROMPT_NON_TOOL_WORDS.has(token)),
    );
    expect(mentioned.size).toBeGreaterThan(0);
    for (const token of mentioned) {
      expect(CANVAS_TOOL_NAMES, `system prompt references unknown tool ${token}`).toContain(token);
    }
  });
});

describe("design agent system prompt", () => {
  it("lists the full tool set and the inspect-first workflow", () => {
    const functions = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    expect(functions).toContain("inspect_layer_tree");
    expect(functions).toContain("create_shape");
    expect(functions).toContain("mutate_layer_layout");
    expect(functions).toContain("mutate_layer_style");
    expect(functions).toContain("mutate_auto_layout");
    expect(functions).toContain("batch_mutate_layers");
    expect(functions).toContain("group_layers");
    expect(functions).toContain("rename_layer");
  });

  it("orders the workflow: inspect first, then build, style/auto-layout, group, name", () => {
    const inspectAt = SYSTEM_PROMPT.indexOf("inspect_layer_tree");
    const createAt = SYSTEM_PROMPT.indexOf("create_shape");
    const autoLayoutAt = SYSTEM_PROMPT.indexOf("mutate_auto_layout");
    const groupAt = SYSTEM_PROMPT.indexOf("group_layers");
    const renameAt = SYSTEM_PROMPT.indexOf("rename_layer");

    expect(inspectAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(inspectAt);
    expect(autoLayoutAt).toBeGreaterThan(createAt);
    expect(groupAt).toBeGreaterThan(-1);
    expect(renameAt).toBeGreaterThan(-1);
    expect(SYSTEM_PROMPT).toMatch(/inspect first/i);
    expect(SYSTEM_PROMPT).toMatch(/After multi-step edits.*inspect_layer_tree/s);
  });
});

describe("runAgentTurn uses the shared tool list for every model kind", () => {
  const tools = CANVAS_TOOL_SCHEMAS;

  it("treats one build_layout call as creation and requires a canvas capture", async () => {
    const executed = [];
    const prompts = [];
    let step = 0;
    const result = await runAgentTurn({
      config: { model: "gpt-fake" },
      history: [],
      userText: "Design a Bauhaus poster",
      tools,
      htmlPipeline: false,
      executeTool: async (name) => {
        executed.push(name);
        return name === "capture_canvas"
          ? { dataUrl: "data:image/png;base64,YWJj" }
          : { count: 12, created: [] };
      },
      streamStep: async ({ messages }) => {
        step += 1;
        if (step === 1) {
          return {
            text: "",
            toolCalls: [{ id: "layout", name: "build_layout", arguments: "{}" }],
          };
        }
        if (step === 2) {
          return { text: "The poster is ready.", toolCalls: [] };
        }
        if (step === 3) {
          prompts.push(...messages.map((message) => message.content).filter(Boolean));
          return {
            text: "",
            toolCalls: [{ id: "capture", name: "capture_canvas", arguments: "{}" }],
          };
        }
        return { text: "Verified poster.", toolCalls: [] };
      },
    });

    expect(executed).toEqual(["build_layout", "capture_canvas"]);
    expect(prompts.some((prompt) => prompt.includes("verify the generated design"))).toBe(true);
    expect(result).toBe("Verified poster.");
  });

  it("forwards the tool schemas to the stream step and executes tool calls", async () => {
    const seenTools = [];
    let calls = 0;
    const streamStep = async ({ tools: stepTools }) => {
      seenTools.push(stepTools);
      calls += 1;
      if (calls === 1) {
        return {
          text: "",
          toolCalls: [
            {
              id: "call_1",
              name: "rename_layer",
              arguments: JSON.stringify({ layerId: "L1", name: "Hero" }),
            },
          ],
        };
      }
      return { text: "renamed.", toolCalls: [] };
    };
    const executed = [];
    const result = await runAgentTurn({
      config: { model: "gpt-fake" },
      history: [],
      userText: "name the hero layer",
      tools,
      executeTool: async (name, args) => {
        executed.push({ name, args });
        return { ok: true };
      },
      streamStep,
    });

    expect(seenTools.every((t) => t === tools)).toBe(true);
    expect(executed).toEqual([
      { name: "rename_layer", args: { layerId: "L1", name: "Hero" } },
    ]);
    expect(result).toBe("renamed.");
  });
});

describe("designer persona knows the canvas tool workflow", () => {
  it("embeds the workflow in the built-in designer persona", () => {
    const designer = findPersonaById("designer");
    expect(designer.instructions).toMatch(/inspect_layer_tree first/i);
    expect(designer.instructions).toMatch(/create_shape/);
    expect(designer.instructions).toMatch(/auto-layout/);
    expect(designer.instructions).toMatch(/group logically/);
    expect(designer.instructions).toMatch(/name layers/);
  });

  it("survives the 300-char word-boundary truncation unscathed", () => {
    const designer = findPersonaById("designer");
    const prompt = formatPersonaPrompt(designer, "en");
    expect(prompt).toContain("name layers");
    expect(prompt).toContain("inspect_layer_tree");
    expect(prompt.length).toBeLessThanOrEqual(500);
  });
});

describe("cli agent path gets the same tool list", () => {
  afterEach(() => {
    delete globalThis.window;
  });

  function setBridge(localCli) {
    globalThis.window = { vooDesktop: { localCli: { onText: () => () => {}, ...localCli } } };
  }

  it("routes cli models through the same native turn", () => {
    expect(isCliAgentModel("claude:claude-opus-5-5")).toBe(true);
    expect(isCliAgentModel("codex:gpt-6-astra")).toBe(true);
  });

  it("exposes the full canvas tool registry even when the caller forgets tools", async () => {
    const advanced = [];
    setBridge({
      advance: async (opts) => {
        advanced.push(opts);
        return { ok: true, threadId: opts.threadId, done: true, text: "Done." };
      },
      cancel: vi.fn().mockResolvedValue({ ok: true }),
    });

    const step = await streamCliStep({
      config: { model: "codex:gpt-6-astra" },
      messages: [{ role: "user", content: "inspect the canvas" }],
      tools: undefined,
      signal: new AbortController().signal,
    });

    expect(step.toolCalls).toEqual([]);
    expect(advanced.length).toBe(1);
    const forwarded = advanced[0].tools.map((schema) => schema.function.name);
    expect(forwarded).toContain("inspect_layer_tree");
    expect(forwarded).toContain("create_shape");
    expect(forwarded).toContain("mutate_layer_layout");
    expect(forwarded).toContain("mutate_layer_style");
    expect(forwarded).toContain("mutate_layer_text");
    expect(forwarded).toContain("mutate_auto_layout");
    expect(forwarded).toContain("batch_mutate_layers");
    expect(forwarded).toContain("delete_layers");
    expect(forwarded).toContain("duplicate_layer");
    expect(forwarded).toContain("select_layers");
    expect(forwarded).toContain("group_layers");
    expect(forwarded).toContain("reorder_layer");
    expect(forwarded).toContain("rename_layer");
    expect(forwarded).toContain("generate_image");
    expect(forwarded).toContain("describe_selection");
  });
});
