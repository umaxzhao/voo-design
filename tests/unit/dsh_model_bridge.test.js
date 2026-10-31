import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createCompletionTranslator,
  createModelBridge,
  mapFinishReason,
  readSelection,
  resolveBridgeSettings,
  toDshGenerateOptions,
  toDshRequest,
  toToolSchemas,
} from "../../plugins/voo-model-bridge/lib/model-bridge.js";

const selection = {
  currentSelection: () => ({ provider: "deepseek-official", model: "deepseek-flash" }),
};

const directories = [];
const bridges = [];

async function temporaryStatePath(prefix = "voo-model-bridge-") {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  directories.push(directory);
  return path.join(directory, "voo-model-bridge.json");
}

function silentLogger() {
  return { log() {}, info() {}, warn() {}, error() {} };
}

/** A fake Harness llm service: records options and replays scripted chunks. */
function fakeLlm({ chunksByRequest = [], models = [{ provider: "deepseek-official", id: "deepseek-flash", name: "DeepSeek Flash" }], listError = null } = {}) {
  const calls = [];
  return {
    calls,
    async listModels(provider) {
      if (listError) throw listError;
      return models.filter(model => !model.provider || model.provider === provider);
    },
    stream(options) {
      calls.push(options);
      const scripted = chunksByRequest[calls.length - 1] ?? chunksByRequest.at(-1) ?? [];
      return (async function* replay() {
        for (const chunk of scripted) yield chunk;
      })();
    },
  };
}

async function startBridge(options = {}) {
  const bridge = createModelBridge({
    llm: options.llm ?? fakeLlm(),
    selection: options.selection ?? selection,
    port: options.port ?? 0,
    statePath: options.statePath ?? await temporaryStatePath(),
    logger: options.logger ?? silentLogger(),
  });
  bridges.push(bridge);
  const info = await bridge.start();
  return { bridge, info };
}

afterEach(async () => {
  await Promise.all(bridges.splice(0).map(bridge => bridge.close().catch(() => {})));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("voo-model-bridge translation helpers", () => {
  it("maps OpenAI tools into Harness ToolSchema values", () => {
    expect(toToolSchemas(undefined)).toBeUndefined();
    expect(toToolSchemas([])).toBeUndefined();
    const tools = toToolSchemas([
      { type: "function", function: { name: "create_frame", description: "Create", parameters: { type: "object", properties: { x: { type: "number" } } } } },
      { name: "flat_tool", description: "Flat" },
      { type: "function", function: { description: "missing name" } },
    ]);
    expect(tools).toEqual([
      { name: "create_frame", description: "Create", parameters: { type: "object", properties: { x: { type: "number" } } } },
      { name: "flat_tool", description: "Flat", parameters: { type: "object", properties: {} } },
    ]);
  });

  it("maps every Harness finish reason", () => {
    expect(mapFinishReason({ kind: "stop" })).toBe("stop");
    expect(mapFinishReason({ kind: "tool-calls" })).toBe("tool_calls");
    expect(mapFinishReason({ kind: "max-tokens" })).toBe("length");
    expect(mapFinishReason({ kind: "error", failure: { message: "boom", code: "X" } })).toBe("stop");
    expect(mapFinishReason(undefined)).toBe("stop");
  });

  it("translates system, user, assistant tool calls, and tool results", () => {
    const { messages, system } = toDshRequest({
      messages: [
        { role: "system", content: "You are a designer." },
        { role: "developer", content: "Be concise." },
        {
          role: "user",
          content: [
            { type: "text", text: "Draw a blue square." },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "create_shape", arguments: '{"kind":"rect"}' } }],
        },
        { role: "tool", tool_call_id: "call_1", content: '{"ok":true}' },
      ],
    }, { provider: "deepseek-official", model: "deepseek-flash" });
    expect(system).toBe("You are a designer.\n\nBe concise.");
    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Draw a blue square." }] },
      {
        role: "assistant",
        content: [{ type: "tool-call", id: "call_1", name: "create_shape", arguments: '{"kind":"rect"}' }],
        source: { kind: "model", provider: "deepseek-official", model: "deepseek-flash" },
      },
      {
        role: "tool",
        toolCallId: "call_1",
        source: { kind: "tool", callId: "call_1" },
        content: [{ type: "text", text: '{"ok":true}' }],
      },
    ]);
  });

  it("generates Harness options without the unsupported stop field", () => {
    const options = toDshGenerateOptions({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "t", parameters: { type: "object" } } }],
      temperature: 0.3,
      max_tokens: 16,
      stop: ["\n\n"],
    }, { provider: "deepseek-official" });
    expect(options).toMatchObject({
      provider: "deepseek-official",
      model: "deepseek-flash",
      temperature: 0.3,
      maxTokens: 16,
    });
    expect(options.tools).toHaveLength(1);
    expect(options).not.toHaveProperty("stop");
    expect(options.system).toBeUndefined();
  });

  it("rejects an empty message list", () => {
    expect(() => toDshRequest({ messages: [] }, { provider: "p", model: "m" })).toThrow(/messages must be a non-empty array/);
  });

  it("falls back to the neutral provider when the selection service is absent", () => {
    expect(readSelection(undefined)).toEqual({ provider: "deepseek-official", model: undefined });
    expect(readSelection({ currentSelection: () => ({ provider: "antigravity", model: "claude" }) })).toEqual({ provider: "antigravity", model: "claude" });
  });

  it("resolves env overrides for the port and the state file", () => {
    const settings = resolveBridgeSettings({ port: 5000 }, { VOO_MODEL_BRIDGE_PORT: "6000", VOO_MODEL_BRIDGE_STATE: "/tmp/x.json" }, "/home/x");
    expect(settings.port).toBe(6000);
    expect(settings.statePath).toBe("/tmp/x.json");
    expect(resolveBridgeSettings({ port: 5000 }, {}, "/home/x").statePath).toBe(path.join("/home/x", ".dsh", "voo-model-bridge.json"));
  });
});

describe("voo-model-bridge HTTP surface", () => {
  it("answers /health and lists models from the Harness llm service", async () => {
    const { bridge, info } = await startBridge();
    expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const health = await (await fetch(`${info.url.replace(/\/v1$/, "")}/health`)).json();
    expect(health).toMatchObject({ ok: true, provider: "deepseek-official", model: "deepseek-flash", port: info.port });
    for (const pathname of ["/v1/models", "/models"]) {
      const response = await fetch(`${info.url.replace(/\/v1$/, "")}${pathname}`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.object).toBe("list");
      expect(body.data).toEqual([{ id: "deepseek-flash", object: "model", created: 0, owned_by: "deepseek-official" }]);
    }
    expect(bridge.port).toBe(info.port);
  });

  it("falls back to the selected model when the catalog is empty or unavailable", async () => {
    const empty = await startBridge({ llm: fakeLlm({ models: [] }) });
    const emptyList = await (await fetch(`${empty.info.url}/models`)).json();
    expect(emptyList.data.map(entry => entry.id)).toEqual(["deepseek-flash"]);

    const broken = await startBridge({ llm: fakeLlm({ listError: new Error("no credential") }) });
    const fallbackList = await (await fetch(`${broken.info.url}/models`)).json();
    expect(fallbackList.data.map(entry => entry.id)).toEqual(["deepseek-flash"]);
  });

  it("answers CORS preflights and stamps every response with CORS headers", async () => {
    const llm = fakeLlm();
    const { info } = await startBridge({ llm });
    const preflight = await fetch(`${info.url}/chat/completions`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    const models = await fetch(`${info.url}/models`);
    expect(models.headers.get("access-control-allow-origin")).toBe("*");
    expect(llm.calls).toHaveLength(0);
  });

  it("returns a non-streaming completion with text and usage", async () => {
    const llm = fakeLlm({
      chunksByRequest: [[
        { type: "block-start", index: 0, blockType: "text" },
        { type: "text-delta", index: 0, text: "OK" },
        { type: "block-end", index: 0, block: { type: "text", text: "OK" } },
        { type: "usage", usage: { inputTokens: 7, outputTokens: 2 } },
        { type: "finish", reason: { kind: "stop" } },
      ]],
    });
    const { info } = await startBridge({ llm });
    const response = await fetch(`${info.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer voo-local" },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages: [{ role: "system", content: "be terse" }, { role: "user", content: "say OK" }],
        tools: [{ type: "function", function: { name: "noop", description: "Noop", parameters: { type: "object", properties: {} } } }],
        stream: false,
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message).toEqual({ role: "assistant", content: "OK" });
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage).toEqual({ prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 });
    expect(llm.calls[0]).toMatchObject({
      provider: "deepseek-official",
      model: "deepseek-flash",
      system: "be terse",
      messages: [{ role: "user", content: [{ type: "text", text: "say OK" }] }],
    });
    expect(llm.calls[0].tools).toHaveLength(1);
  });

  it("streams text deltas, tool calls, finish reason, and [DONE]", async () => {
    const llm = fakeLlm({
      chunksByRequest: [[
        { type: "block-start", index: 0, blockType: "reasoning" },
        { type: "reasoning-delta", index: 0, text: "thinking" },
        { type: "block-end", index: 0, block: { type: "reasoning", text: "thinking" } },
        { type: "block-start", index: 1, blockType: "text" },
        { type: "text-delta", index: 1, text: "Let me " },
        { type: "text-delta", index: 1, text: "check." },
        { type: "block-end", index: 1, block: { type: "text", text: "Let me check." } },
        { type: "block-start", index: 2, blockType: "tool-call" },
        { type: "tool-call-delta", index: 2, id: "call_9", name: "create_frame", argumentsDelta: '{"x":' },
        { type: "tool-call-delta", index: 2, id: "call_9", argumentsDelta: '0}' },
        { type: "block-end", index: 2, block: { type: "tool-call", id: "call_9", name: "create_frame", arguments: '{"x":0}' } },
        { type: "usage", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        { type: "finish", reason: { kind: "tool-calls" } },
      ]],
    });
    const { info } = await startBridge({ llm });
    const response = await fetch(`${info.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer voo-local" },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages: [{ role: "user", content: "make a frame" }],
        tools: [{ type: "function", function: { name: "create_frame", parameters: { type: "object", properties: { x: { type: "number" } } } } }],
        stream: true,
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const raw = await response.text();
    const events = raw.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim());
    expect(events.at(-1)).toBe("[DONE]");
    const chunks = events.slice(0, -1).map(payload => JSON.parse(payload));
    expect(chunks[0].choices[0].delta.role).toBe("assistant");
    const text = chunks.map(entry => entry.choices?.[0]?.delta?.content ?? "").join("");
    expect(text).toBe("Let me check.");
    const toolDeltas = chunks.flatMap(entry => entry.choices?.[0]?.delta?.tool_calls ?? []);
    expect(toolDeltas.every(delta => delta.index === 0)).toBe(true);
    expect(toolDeltas[0].id).toBe("call_9");
    expect(toolDeltas[0].function.name).toBe("create_frame");
    expect(toolDeltas.map(delta => delta.function.arguments).join("")).toBe('{"x":0}');
    const finishChunk = chunks.find(entry => entry.choices?.[0]?.finish_reason !== null && entry.choices?.[0]?.finish_reason !== undefined);
    expect(finishChunk.choices[0].finish_reason).toBe("tool_calls");
    const usageChunk = chunks.find(entry => entry.usage !== undefined);
    expect(usageChunk.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });

  it("rejects an unknown model before calling the model", async () => {
    const llm = fakeLlm();
    const { info } = await startBridge({ llm });
    const response = await fetch(`${info.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "not-a-model", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("model_not_found");
    expect(body.error.message).toContain("deepseek-flash");
    expect(llm.calls).toHaveLength(0);
  });

  it("surfaces a terminal model failure as an OpenAI error", async () => {
    const { info } = await startBridge({
      llm: fakeLlm({
        chunksByRequest: [[
          { type: "finish", reason: { kind: "error", failure: { message: "missing credential", code: "MISSING_CREDENTIAL" } } },
        ]],
      }),
    });
    const response = await fetch(`${info.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: false }),
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toMatchObject({ message: "missing credential", type: "server_error", code: "MISSING_CREDENTIAL" });
  });

  it("rejects malformed bodies and unknown routes", async () => {
    const { info } = await startBridge();
    const badJson = await fetch(`${info.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(badJson.status).toBe(400);
    expect((await badJson.json()).error.code).toBe("invalid_json");
    const noMessages = await fetch(`${info.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek-flash" }),
    });
    expect(noMessages.status).toBe(400);
    const notFound = await fetch(`${info.url}/nope`);
    expect(notFound.status).toBe(404);
    expect((await notFound.json()).error.code).toBe("not_found");
  });

  it("writes the discovery file on start and removes it on close", async () => {
    const statePath = await temporaryStatePath();
    const { bridge, info } = await startBridge({ statePath });
    const state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state).toMatchObject({
      url: info.url,
      port: info.port,
      pid: process.pid,
      provider: "deepseek-official",
      model: "deepseek-flash",
      models: ["deepseek-flash"],
    });
    await bridge.close();
    await expect(stat(statePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("moves to the next free port when the configured one is taken", async () => {
    const first = await startBridge();
    const second = await startBridge({ port: first.info.port });
    expect(second.info.port).toBe(first.info.port + 1);
  });
});

describe("voo-model-bridge streaming translator", () => {
  it("keeps tool-call indices contiguous across reasoning and text blocks", () => {
    const translator = createCompletionTranslator({ model: "deepseek-flash", created: 1, id: "chatcmpl-test" });
    translator.push({ type: "text-delta", index: 0, text: "hi" });
    const first = translator.push({ type: "tool-call-delta", index: 5, id: "call_a", name: "a", argumentsDelta: "{}" });
    const second = translator.push({ type: "tool-call-delta", index: 7, id: "call_b", name: "b", argumentsDelta: "{}" });
    expect(first[0].choices[0].delta.tool_calls[0].index).toBe(0);
    expect(second[0].choices[0].delta.tool_calls[0].index).toBe(1);
    expect(translator.end().at(-1).choices[0].finish_reason).toBe("stop");
  });
});
