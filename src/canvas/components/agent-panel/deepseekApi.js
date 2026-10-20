import { streamCodexCompletion } from "./codex_transport.js";
import { BG, EVENTS } from "../../../shared/messages.js";
/**
 * DeepSeek API client — OpenAI-compatible streaming chat completions.
 *
 * Sends the full conversation history on every request (stateless design,
 * matching Codex's approach for ZDR compliance). Supports function calling
 * with streaming tool_call deltas.
 *
 * @module agent-panel/deepseekApi
 */

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

// Defined in src/shared so the desktop main process can use it too: only
// src/shared/** is packaged into the asar. Imported rather than re-exported
// straight through, because this module calls it as well.
import { resolveChatCompletionsUrl } from "../../../shared/chat_completions_url.js";

export { resolveChatCompletionsUrl };

/** Extract reasoning content from an SSE chunk (DeepSeek-R1 / Qwen thinking tokens). */
export function deltaReasoningFromChunk(chunk) {
  const delta = chunk?.choices?.[0]?.delta;
  const reasoning =
    delta?.reasoning_content ?? delta?.reasoning ?? delta?.thought;
  if (typeof reasoning === "string") return reasoning;
  if (Array.isArray(reasoning)) {
    return reasoning
      .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("");
  }
  return "";
}

/**
 * Whether a resolved agent LLM config points at the local CLI provider.
 *
 * The CLI provider id is "cli" (`PROVIDER_ID.CLI`) and it carries no base URL —
 * the model id encodes the CLI + model (e.g. `claude:opus-5`). The desktop
 * bridge runs it headless; there is no HTTP endpoint to call.
 */
export function isCliProvider(providerName, baseUrl) {
  return providerName === "cli" || String(baseUrl).startsWith("cli:");
}

/**
 * Stream an LLM completion proxied through the connected VOO desktop client.
 * The raw API key stays strictly in desktop storage and is never sent to the browser.
 */
export async function* streamDesktopProxyCompletion({
  messages,
  tools,
  model,
  reasoningEffort,
  baseUrl,
  signal,
  providerId,
}) {
  const [{ callBackground }, { onHostEvent }] = await Promise.all([
    import("../../rpc_background.js"),
    import("../../rpc_events.js"),
  ]);

  const jobId = crypto.randomUUID();
  const queue = [];
  let done = false;
  let error = null;
  let notify = null;

  const wake = () => {
    if (notify) {
      const fn = notify;
      notify = null;
      fn();
    }
  };

  const offChunk = onHostEvent(EVENTS.DESKTOP_AGENT_STREAM_CHUNK, (payload) => {
    if (payload?.jobId !== jobId) return;
    if (payload?.chunk) {
      queue.push(payload.chunk);
      wake();
    }
  });

  const offDone = onHostEvent(EVENTS.DESKTOP_AGENT_STREAM_DONE, (payload) => {
    if (payload?.jobId !== jobId) return;
    done = true;
    if (payload?.ok === false && payload?.error) {
      error = new Error(payload.error);
    }
    wake();
  });

  const abortHandler = () => {
    void callBackground(BG.DESKTOP_AGENT_STREAM_CANCEL, { jobId });
    done = true;
    error = new DOMException("The operation was aborted", "AbortError");
    wake();
  };
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    const res = await callBackground(BG.DESKTOP_AGENT_STREAM, {
      jobId,
      providerId,
      model,
      messages,
      tools,
      reasoningEffort,
      baseUrl,
    });
    if (res?.ok === false) {
      throw new Error(res.error || "desktopStreamFailed");
    }

    while (true) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      if (queue.length > 0) {
        yield queue.shift();
        continue;
      }
      if (done) {
        if (error) throw error;
        break;
      }
      await new Promise((resolve) => {
        notify = resolve;
      });
    }
  } finally {
    offChunk?.();
    offDone?.();
    signal?.removeEventListener("abort", abortHandler);
    if (!done) {
      void callBackground(BG.DESKTOP_AGENT_STREAM_CANCEL, { jobId });
    }
  }
}

/**
 * Stream a chat completion from DeepSeek, DashScope, 302.AI, or any OpenAI-compatible endpoint.
 *
 * Yields parsed SSE chunks as they arrive. Each chunk has the shape:
 * ```js
 * {
 *   id: string,
 *   choices: [{ delta: { content?: string, tool_calls?: ToolCallDelta[] }, finish_reason: string|null }],
 *   usage?: { prompt_tokens, completion_tokens, total_tokens }
 * }
 * ```
 *
 * @param {Object} params
 * @param {Array<{role: string, content: string, tool_calls?: Array, tool_call_id?: string}>} params.messages
 * @param {Array<{type: string, function: {name, description, parameters}}>} [params.tools]
 * @param {string} [params.model]
 * @param {string} [params.apiKey]
 * @param {string} [params.baseUrl]
 * @param {AbortSignal} [params.signal]
 * @returns {AsyncGenerator<Object>} Parsed SSE data chunks.
 */
export async function* streamChatCompletion({
  messages,
  tools,
  model = DEFAULT_MODEL,
  reasoningEffort,
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  signal,
}) {
  if (isCliProvider(undefined, baseUrl)) {
    yield* streamCodexCompletion({
      messages,
      tools,
      model,
      reasoningEffort,
      signal,
    });
    return;
  }
  if (apiKey === "desktop-proxy") {
    yield* streamDesktopProxyCompletion({
      messages,
      tools,
      model,
      reasoningEffort,
      baseUrl,
      signal,
    });
    return;
  }
  if (!apiKey) {
    throw new Error("LLM API key is required. Configure it in VOO settings.");
  }

  const body = {
    model,
    messages,
    stream: true,
    // Include usage stats in the final chunk.
    stream_options: { include_usage: true },
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const url = resolveChatCompletionsUrl(baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `LLM API error ${response.status}: ${errorBody || response.statusText}`,
    );
  }

  yield* parseSSEStream(response.body);
}

/**
 * Parse a ReadableStream of SSE text into structured data objects.
 *
 * Handles the `data: {...}\n\n` format, skipping comments and empty lines.
 * Merges streaming tool_call deltas by index so callers receive accumulated
 * arguments incrementally.
 *
 * @param {ReadableStream} body
 * @yields {Object} Parsed JSON data from each SSE event.
 */
async function* parseSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines.
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer.
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // skip empty / comments
        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") return;

        try {
          yield JSON.parse(jsonStr);
        } catch {
          // Malformed chunk — skip silently. The next chunk may repair it.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Accumulate streaming tool_call deltas into complete tool call objects.
 *
 * DeepSeek streams tool calls as incremental deltas with an `index` field.
 * This helper merges them so the caller gets fully assembled calls at the end
 * of a turn.
 *
 * @param {Array} accumulator - Mutable array being built up across chunks.
 * @param {Array} deltas - New tool_call deltas from one SSE chunk.
 */
export function accumulateToolCalls(accumulator, deltas) {
  if (!deltas) return;

  for (const delta of deltas) {
    const idx = delta.index ?? 0;

    if (!accumulator[idx]) {
      accumulator[idx] = {
        id: delta.id || "",
        type: delta.type || "function",
        function: { name: "", arguments: "" },
      };
    }

    const entry = accumulator[idx];
    if (delta.id) entry.id = delta.id;
    if (delta.function?.name) entry.function.name += delta.function.name;
    if (delta.function?.arguments)
      entry.function.arguments += delta.function.arguments;
  }
}

/**
 * Non-streaming chat completion — one full request, returns the whole reply.
 *
 * Used by harness-internal work such as context compaction, where we need a
 * complete summary text rather than a live stream.
 *
 * @param {Object} params Same shape as streamChatCompletion (no streaming).
 * @returns {Promise<{ content: string, usage: Object|null }>}
 */
export async function chatCompletion({
  messages,
  model = DEFAULT_MODEL,
  reasoningEffort,
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  signal,
}) {
  if (isCliProvider(undefined, baseUrl)) {
    let content = "";
    for await (const chunk of streamCodexCompletion({
      messages,
      model,
      reasoningEffort,
      signal,
    })) {
      content += chunk.choices?.[0]?.delta?.content || "";
    }
    return { content, usage: null };
  }
  if (!apiKey) {
    throw new Error("LLM API key is required. Configure it in VOO settings.");
  }

  const url = resolveChatCompletionsUrl(baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `LLM API error ${response.status}: ${errorBody || response.statusText}`,
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { content, usage: data.usage ?? null };
}
