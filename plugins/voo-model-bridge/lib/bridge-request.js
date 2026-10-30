import { DEFAULT_PROVIDER, BridgeRequestError, warn } from "./bridge-common.js";

/** Flatten one OpenAI message body into text, warning about dropped image parts. */
export function messageText(content, { warn: warnOnce } = {}) {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const part of content) {
    if (part === null || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") parts.push(part.text);
    else if (part.type === "image_url" || part.type === "image" || part.type === "input_image") {
      warnOnce?.("ignoring image content; this bridge supports text and tool calling only");
    }
  }
  return parts.join("");
}

/** Convert OpenAI `tools` entries into Harness `ToolSchema` values. */
export function toToolSchemas(tools) {
  if (!Array.isArray(tools)) return undefined;
  const schemas = [];
  for (const tool of tools) {
    if (tool === null || typeof tool !== "object") continue;
    const source = tool.type === "function" && tool.function && typeof tool.function === "object"
      ? tool.function
      : tool;
    if (typeof source.name !== "string" || source.name.length === 0) continue;
    schemas.push({
      name: source.name,
      description: typeof source.description === "string" ? source.description : "",
      parameters: typeof source.parameters === "object" && source.parameters !== null && !Array.isArray(source.parameters)
        ? source.parameters
        : { type: "object", properties: {} },
    });
  }
  return schemas.length > 0 ? schemas : undefined;
}


export function toolArgumentsText(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Translate OpenAI chat messages into Harness request messages plus the
 * request-level system prompt. The Harness `GenerateOptions.messages` accepts
 * request-only user inputs (`{ role: 'user', content }`) and durable assistant
 * and tool messages carrying their provider/source identity.
 */
export function toDshRequest(body, { provider, model, logger } = {}) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new BridgeRequestError("messages must be a non-empty array", { code: "invalid_messages" });
  }
  const routeProvider = typeof provider === "string" && provider.length > 0 ? provider : DEFAULT_PROVIDER;
  const routeModel = typeof model === "string" && model.length > 0 ? model : "unknown";
  let warnedImage = false;
  const warnOnce = (message) => {
    if (warnedImage) return;
    warnedImage = true;
    warn(logger, message);
  };
  const systemParts = [];
  const out = [];
  for (const message of messages) {
    if (message === null || typeof message !== "object") continue;
    const role = message.role;
    if (role === "system" || role === "developer") {
      const text = messageText(message.content, { warn: warnOnce });
      if (text.length > 0) systemParts.push(text);
      continue;
    }
    if (role === "user") {
      const text = messageText(message.content, { warn: warnOnce });
      out.push({ role: "user", content: [{ type: "text", text }] });
      continue;
    }
    if (role === "assistant") {
      const content = [];
      const text = messageText(message.content, { warn: warnOnce });
      if (text.length > 0) content.push({ type: "text", text });
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      for (const [index, call] of toolCalls.entries()) {
        if (call === null || typeof call !== "object") continue;
        const fn = call.function && typeof call.function === "object" ? call.function : {};
        const callName = typeof fn.name === "string" ? fn.name : "";
        if (callName.length === 0) continue;
        content.push({
          type: "tool-call",
          id: typeof call.id === "string" && call.id.length > 0 ? call.id : `call_${index}`,
          name: callName,
          arguments: toolArgumentsText(fn.arguments),
        });
      }
      out.push({
        role: "assistant",
        content,
        source: { kind: "model", provider: routeProvider, model: routeModel },
      });
      continue;
    }
    if (role === "tool") {
      const callId = typeof message.tool_call_id === "string" && message.tool_call_id.length > 0
        ? message.tool_call_id
        : typeof message.toolCallId === "string" ? message.toolCallId : "";
      if (callId.length === 0) {
        warn(logger, "dropping a tool message without tool_call_id");
        continue;
      }
      out.push({
        role: "tool",
        toolCallId: callId,
        source: { kind: "tool", callId },
        content: [{ type: "text", text: messageText(message.content) || "(no output)" }],
        ...(message.isError === true ? { isError: true } : {}),
      });
    }
  }
  return {
    messages: out,
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
  };
}

/** Build the full `GenerateOptions` for one OpenAI chat completion request. */
export function toDshGenerateOptions(body, { provider, model, logger } = {}) {
  const { messages, system } = toDshRequest(body, { provider, model, logger });
  const tools = toToolSchemas(body?.tools);
  const options = {
    provider: provider ?? DEFAULT_PROVIDER,
    model: model ?? body?.model,
    messages,
    ...(system === undefined ? {} : { system }),
    ...(tools === undefined ? {} : { tools }),
  };
  if (typeof body?.temperature === "number" && Number.isFinite(body.temperature)) options.temperature = body.temperature;
  const maxTokens = body?.max_tokens ?? body?.max_completion_tokens;
  if (Number.isInteger(maxTokens) && maxTokens > 0) options.maxTokens = maxTokens;
  // `stop` is accepted by the OpenAI schema but the Harness adapters reject it;
  // silently dropping it keeps a generic client working against this bridge.
  return options;
}
