import { randomUUID } from "node:crypto";
import { BridgeRequestError } from "./bridge-common.js";

/** Map a Harness finish reason onto the OpenAI `finish_reason` vocabulary. */
export function mapFinishReason(reason) {
  switch (reason?.kind) {
    case "tool-calls":
      return "tool_calls";
    case "max-tokens":
      return "length";
    case "stop":
    default:
      return "stop";
  }
}


export function failureOf(reason) {
  return {
    message: reason?.failure?.message ?? "the model request failed",
    code: reason?.failure?.code ?? "MODEL_ERROR",
  };
}

/**
 * Streaming translation state: one OpenAI chunk sequence per completion. Tool
 * call indices are remapped from Harness content-block indices so a reasoning
 * block at index 0 cannot leave a hole in the OpenAI `tool_calls` array.
 */
export function createCompletionTranslator({ model, created = Math.floor(Date.now() / 1000), id = `chatcmpl-${randomUUID()}` } = {}) {
  const toolIndexByBlock = new Map();
  const toolState = new Map();
  let terminal = null;
  let usage = null;
  let finished = false;

  const toolIndex = (blockIndex) => {
    if (!toolIndexByBlock.has(blockIndex)) toolIndexByBlock.set(blockIndex, toolIndexByBlock.size);
    return toolIndexByBlock.get(blockIndex);
  };
  const stateFor = (blockIndex) => {
    if (!toolState.has(blockIndex)) {
      toolState.set(blockIndex, { id: undefined, idSent: false, name: undefined, nameSent: false });
    }
    return toolState.get(blockIndex);
  };
  const chunk = (delta, finishReason = null) => ({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });

  return {
    id,
    start: () => [chunk({ role: "assistant", content: "" })],
    push(streamChunk) {
      if (finished || streamChunk === null || typeof streamChunk !== "object") return [];
      switch (streamChunk.type) {
        case "text-delta":
          return typeof streamChunk.text === "string" && streamChunk.text.length > 0
            ? [chunk({ content: streamChunk.text })]
            : [];
        case "tool-call-delta": {
          const index = toolIndex(streamChunk.index ?? 0);
          const state = stateFor(streamChunk.index ?? 0);
          const fn = { arguments: streamChunk.argumentsDelta ?? "" };
          const deltas = [];
          const id = typeof streamChunk.id === "string" ? streamChunk.id : "";
          if (id.length > 0) state.id = id;
          if (typeof streamChunk.name === "string" && streamChunk.name.length > 0) state.name = streamChunk.name;
          if (state.name !== undefined && !state.nameSent) {
            fn.name = state.name;
            state.nameSent = true;
          }
          if (state.id !== undefined && !state.idSent) {
            state.idSent = true;
            deltas.push({ index, id: state.id, type: "function", function: fn });
          } else {
            deltas.push({ index, type: "function", function: fn });
          }
          return [chunk({ tool_calls: deltas })];
        }
        case "block-end": {
          if (streamChunk.block?.type !== "tool-call") return [];
          const state = stateFor(streamChunk.index ?? 0);
          if (state.nameSent && state.idSent) return [];
          const fn = { arguments: "" };
          if (!state.nameSent && typeof streamChunk.block.name === "string") {
            fn.name = streamChunk.block.name;
            state.nameSent = true;
            state.name = streamChunk.block.name;
          }
          if (!state.idSent && typeof streamChunk.block.id === "string") {
            state.idSent = true;
            state.id = streamChunk.block.id;
            return [chunk({ tool_calls: [{ index: toolIndex(streamChunk.index ?? 0), id: state.id, type: "function", function: fn }] })];
          }
          return fn.name === undefined ? [] : [chunk({ tool_calls: [{ index: toolIndex(streamChunk.index ?? 0), type: "function", function: fn }] })];
        }
        case "usage":
          usage = streamChunk.usage ?? null;
          return [];
        case "finish":
          terminal = streamChunk.reason ?? null;
          return [];
        default:
          return [];
      }
    },
    end() {
      if (finished) return [];
      finished = true;
      const chunks = [chunk({}, mapFinishReason(terminal))];
      if (usage !== null) {
        chunks.push({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [],
          usage: {
            prompt_tokens: usage.inputTokens ?? 0,
            completion_tokens: usage.outputTokens ?? 0,
            total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
          },
        });
      }
      return chunks;
    },
    get terminal() {
      return terminal;
    },
    get usage() {
      return usage;
    },
  };
}


export function completionMessage(translator, terminal) {
  const message = { role: "assistant", content: translator.text ?? "" };
  if (translator.toolCalls.length > 0) {
    message.tool_calls = translator.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    }));
  }
  return message;
}

/** Aggregate a Harness stream into one OpenAI non-streaming completion body. */
export async function collectCompletion(stream, { model, logger }) {
  const translator = createCompletionTranslator({ model });
  const textParts = [];
  const toolCalls = new Map();
  let terminal = null;
  let usage = null;
  for await (const streamChunk of stream) {
    if (streamChunk === null || typeof streamChunk !== "object") continue;
    if (streamChunk.type === "text-delta" && typeof streamChunk.text === "string") textParts.push(streamChunk.text);
    else if (streamChunk.type === "tool-call-delta") {
      const key = streamChunk.index ?? 0;
      const call = toolCalls.get(key) ?? { id: "", name: "", arguments: "" };
      if (typeof streamChunk.id === "string" && streamChunk.id.length > 0) call.id = streamChunk.id;
      if (typeof streamChunk.name === "string" && streamChunk.name.length > 0) call.name = streamChunk.name;
      call.arguments += streamChunk.argumentsDelta ?? "";
      toolCalls.set(key, call);
    } else if (streamChunk.type === "block-end" && streamChunk.block?.type === "tool-call") {
      const key = streamChunk.index ?? 0;
      const call = toolCalls.get(key) ?? { id: "", name: "", arguments: "" };
      call.id = typeof streamChunk.block.id === "string" ? streamChunk.block.id : call.id;
      call.name = call.name.length > 0 ? call.name : String(streamChunk.block.name ?? "");
      call.arguments = call.arguments.length > 0 ? call.arguments : String(streamChunk.block.arguments ?? "");
      toolCalls.set(key, call);
    } else if (streamChunk.type === "usage") usage = streamChunk.usage ?? null;
    else if (streamChunk.type === "finish") terminal = streamChunk.reason ?? null;
  }
  if (terminal?.kind === "error" || terminal?.kind === "aborted") {
    const failure = failureOf(terminal);
    throw new BridgeRequestError(failure.message, {
      status: terminal.kind === "aborted" ? 499 : 502,
      type: "server_error",
      code: failure.code,
    });
  }
  const text = textParts.join("");
  const calls = [...toolCalls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, call]) => ({
      id: call.id.length > 0 ? call.id : `call_${index}`,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    }));
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: text, ...(calls.length > 0 ? { tool_calls: calls } : {}) },
      finish_reason: mapFinishReason(terminal),
    }],
    ...(usage === null ? {} : {
      usage: {
        prompt_tokens: usage.inputTokens ?? 0,
        completion_tokens: usage.outputTokens ?? 0,
        total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      },
    }),
  };
}
