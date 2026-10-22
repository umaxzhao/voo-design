/**
 * Minimal agent loop: the model talks, calls canvas tools, and sees their
 * results until it stops asking for tools. Nothing here builds a workflow.
 */

import { streamChatTurn } from "./chat_stream.js";

import { AGENT_DEFAULTS } from "./canvas_tools.js";

export const AGENT_ERROR = Object.freeze({
  STEP_LIMIT: "agentStepLimit",
});

export const SYSTEM_PROMPT =
  "You are a design agent inside a free-form design canvas. You control every layer by " +
  "calling tools: inspect_layer_tree, describe_selection, create_shape, generate_image, " +
  "mutate_layer_layout, mutate_layer_style, mutate_layer_text, mutate_auto_layout, " +
  "batch_mutate_layers, select_layers, duplicate_layer, delete_layers, group_layers, " +
  "reorder_layer, and rename_layer.\n\n" +
  "Workflow for design tasks:\n" +
  "1. Inspect first: call inspect_layer_tree (optionally with layerId and depth) to see the " +
  "existing layers, their kinds, and parentIds before changing anything.\n" +
  "2. Build layouts with create_shape (rect, ellipse, or text) placed with x/y/width/height.\n" +
  "3. Style and arrange: refine shapes with mutate_layer_layout, mutate_layer_style, and " +
  "mutate_layer_text; lay out frames with mutate_auto_layout; combine several edits into one " +
  "batch_mutate_layers call.\n" +
  "4. Structure: group related layers with group_layers, stack them with reorder_layer, and " +
  "keep every layer clearly named with rename_layer.\n" +
  "5. Imagery: use generate_image for raster content, passing useSelection only when a " +
  "selected layer should be the reference.\n\n" +
  "After multi-step edits, verify the result with inspect_layer_tree. Keep replies short.";

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
