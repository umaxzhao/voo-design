/**
 * Streams one OpenAI-compatible chat completion and folds it into the reply
 * text plus the tool calls the model asked for. Stateless: the caller owns the
 * conversation.
 */

const DATA_PREFIX = "data:";

/**
 * Anthropic refuses browser-origin requests unless the caller opts in with this
 * header. Electron renderers and the web build are both browser origins.
 */
const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_BROWSER_HEADER = "anthropic-dangerous-direct-browser-access";

/** Builds the request headers, adding the browser opt-in only for Anthropic. */
export function buildChatHeaders(config) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (new URL(config.baseUrl).hostname === ANTHROPIC_HOST) {
    headers[ANTHROPIC_BROWSER_HEADER] = "true";
  }
  return headers;
}

export const CHAT_ERROR = Object.freeze({
  NOT_CONFIGURED: "agentNotConfigured",
  HTTP: "agentHttpError",
});

/** Reads an SSE body, yielding each parsed JSON event. */
async function* readSseJson(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.startsWith(DATA_PREFIX)) {
        const payload = line.slice(DATA_PREFIX.length).trim();
        if (payload && payload !== "[DONE]") yield JSON.parse(payload);
      }
      index = buffer.indexOf("\n");
    }
  }
}

/** Accumulates streamed tool-call fragments by index. */
function mergeToolCalls(calls, deltas) {
  for (const delta of deltas) {
    const slot = (calls[delta.index ?? 0] ??= {
      id: "",
      name: "",
      arguments: "",
    });
    if (delta.id) slot.id = delta.id;
    if (delta.function?.name) slot.name += delta.function.name;
    if (delta.function?.arguments) slot.arguments += delta.function.arguments;
  }
}

/**
 * @param {{ config: {apiKey: string, baseUrl: string, model: string},
 *           messages: object[], tools: object[], signal?: AbortSignal,
 *           onText?: (text: string) => void }} options
 * @returns {Promise<{ text: string, toolCalls: {id:string,name:string,arguments:string}[] }>}
 */
export async function streamChatTurn({ config, messages, tools, signal, onText }) {
  if (!config?.apiKey || !config?.baseUrl || !config?.model) {
    throw Object.assign(new Error(CHAT_ERROR.NOT_CONFIGURED), {
      code: CHAT_ERROR.NOT_CONFIGURED,
    });
  }
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: buildChatHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      stream: true,
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw Object.assign(new Error(`${CHAT_ERROR.HTTP}: ${response.status}`), {
      code: CHAT_ERROR.HTTP,
    });
  }
  let text = "";
  const toolCalls = [];
  for await (const event of readSseJson(response.body)) {
    const delta = event.choices?.[0]?.delta;
    if (!delta) continue;
    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      onText?.(text);
    }
    if (Array.isArray(delta.tool_calls)) mergeToolCalls(toolCalls, delta.tool_calls);
  }
  return { text, toolCalls: toolCalls.filter(Boolean) };
}
