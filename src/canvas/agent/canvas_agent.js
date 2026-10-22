/**
 * Minimal agent loop: the model talks, calls canvas tools, and sees their
 * results until it stops asking for tools. Nothing here builds a workflow.
 */

import { streamChatTurn } from "./chat_stream.js";

import { AGENT_DEFAULTS } from "./canvas_tools.js";

export const AGENT_ERROR = Object.freeze({
  STEP_LIMIT: "agentStepLimit",
});

const SYSTEM_PROMPT =
  "You are a design assistant inside a free-form design canvas. " +
  "Create and edit content by calling tools. Generate images with generate_image; " +
  "when the user has selected a layer, pass useSelection so it is used as the reference. " +
  "Keep replies short.";

/**
 * Runs one user turn. `executeTool(name, args)` performs a canvas tool and
 * returns a JSON-serialisable result; a thrown error is reported back to the
 * model rather than swallowed.
 */
export async function runAgentTurn({
  config,
  history,
  userText,
  tools,
  executeTool,
  signal,
  onText,
  onToolEvent,
  maxSteps = AGENT_DEFAULTS.maxSteps,
  styleNote = "",
  streamStep = streamChatTurn,
}) {
  const system = styleNote.trim() ? `${SYSTEM_PROMPT}\n\nStyle notes from the user: ${styleNote.trim()}` : SYSTEM_PROMPT;
  const messages = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userText },
  ];
  // A CLI agent keeps its native session across tool steps, keyed by the signal,
  // so every step of one turn shares a single signal.
  const turnSignal = signal ?? new AbortController().signal;
  for (let step = 0; step < maxSteps; step += 1) {
    const { text, toolCalls } = await streamStep({
      config,
      messages,
      tools,
      signal: turnSignal,
      onText,
    });
    if (toolCalls.length === 0) return text;

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    });
    for (const call of toolCalls) {
      let args = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        args = { raw: call.arguments };
      }
      onToolEvent?.({ id: call.id, name: call.name, arguments: args, status: "in_progress" });
      let content;
      try {
        const result = await executeTool(call.name, args);
        content = JSON.stringify(result);
        onToolEvent?.({ id: call.id, name: call.name, arguments: args, status: "completed", result });
      } catch (error) {
        const code = error?.code ?? error?.message ?? "toolFailed";
        content = JSON.stringify({ error: code });
        onToolEvent?.({ id: call.id, name: call.name, arguments: args, status: "failed", error: code });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw Object.assign(new Error(AGENT_ERROR.STEP_LIMIT), { code: AGENT_ERROR.STEP_LIMIT });
}
