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
  "reorder_layer, rename_layer, create_path, place_image, capture_canvas, create_component, " +
  "create_instance, list_styles, create_style, apply_style, list_variables, and bind_variable.\n\n" +
  "Workflow for design tasks:\n" +
  "1. Inspect first: call inspect_layer_tree (optionally with layerId and depth) to see the " +
  "existing layers, their kinds, and parentIds before changing anything.\n" +
  "2. Build layouts with create_shape (rect, ellipse, or text) placed with x/y/width/height. " +
  "Draw precise vector artwork with create_path, giving an SVG path 'd' string plus optional " +
  "x/y and fill/stroke/strokeWidth. Put raster imagery at exact geometry with place_image " +
  "(url, x, y, width, height).\n" +
  "3. Style and arrange: refine shapes with mutate_layer_layout, mutate_layer_style, and " +
  "mutate_layer_text; lay out frames with mutate_auto_layout; combine several edits into one " +
  "batch_mutate_layers call.\n" +
  "4. Structure: group related layers with group_layers, stack them with reorder_layer, and " +
  "keep every layer clearly named with rename_layer.\n" +
  "5. Imagery: use generate_image for raster content, passing useSelection only when a " +
  "selected layer should be the reference.\n" +
  "6. Reuse and consistency: turn repeated structures into a component with create_component " +
  "and place more with create_instance; list_styles/list_variables first, then create_style/" +
  "apply_style and bind_variable to keep colors, type and fills consistent.\n\n" +
  "After multi-step edits, verify the result with inspect_layer_tree or look at the canvas " +
  "itself with capture_canvas (whole page, or a single image layer via layerId) — its PNG " +
  "image is returned to you so you can check it visually. Keep replies short.";

const READ_ONLY_TOOLS = new Set([
  "describe_selection",
  "inspect_layer_tree",
  "select_layers",
  "list_styles",
  "list_variables",
  "capture_canvas",
]);

function activeEditor() {
  return typeof window !== "undefined" ? window.__vooEditor ?? null : null;
}

function documentFingerprint(editor) {
  if (!editor) return null;
  try {
    if (typeof editor.serialise === "function") return String(editor.serialise());
    const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
    return doc ? JSON.stringify(doc) : null;
  } catch {
    return null;
  }
}

/** Temporarily silences per-call commit entry points (older test/engine hosts). */
function suppressPerCallCommits(editor) {
  const restores = [];
  for (const key of ["commitEditorDocument", "commit"]) {
    const original = editor?.[key];
    if (typeof original !== "function") continue;
    try {
      editor[key] = () => undefined;
      if (editor[key] !== original) restores.push(() => (editor[key] = original));
    } catch {
      // A frozen host keeps its own batching; nothing to restore.
    }
  }
  return () => {
    for (const restore of restores.reverse()) restore();
  };
}

/**
 * Runs one user turn. `executeTool(name, args)` performs a canvas tool and
 * returns a JSON-serialisable result; a thrown error is reported back to the
 * model rather than swallowed.
 *
 * All mutating tool calls in the turn share one history batch: per-call commits
 * are suppressed and a single `AI: Agent turn` entry is committed at the end.
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
  const editor = activeEditor();
  const before = documentFingerprint(editor);
  let mutated = false;

  const runSteps = async () => {
    for (let step = 0; step < maxSteps; step += 1) {
      if (turnSignal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
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
        if (turnSignal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (!READ_ONLY_TOOLS.has(call.name)) mutated = true;
        let args = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          args = { raw: call.arguments };
        }
        onToolEvent?.({ id: call.id, name: call.name, arguments: args, status: "in_progress" });
        try {
          const result = await executeTool(call.name, args);
          const { dataUrl, ...rest } = result && typeof result === "object" ? result : {};
          const hasImage = typeof dataUrl === "string" && dataUrl.startsWith("data:image");
          const content = JSON.stringify(hasImage ? { ...rest, imageAttached: true } : result);
          messages.push({ role: "tool", tool_call_id: call.id, content });
          if (hasImage) {
            messages.push({
              role: "user",
              content: [
                { type: "text", text: `PNG capture returned by ${call.name}; review it visually.` },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            });
          }
          onToolEvent?.({ id: call.id, name: call.name, arguments: args, status: "completed", result });
        } catch (error) {
          const code = error?.code ?? error?.message ?? "toolFailed";
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: code }) });
          onToolEvent?.({ id: call.id, name: call.name, arguments: args, status: "failed", error: code });
        }
      }
    }
    throw Object.assign(new Error(AGENT_ERROR.STEP_LIMIT), { code: AGENT_ERROR.STEP_LIMIT });
  };

  let endBatch = null;
  let restoreCommits = null;
  let result;
  let error = null;
  let wasCancelled = false;
  try {
    if (editor && typeof editor.beginBatch === "function" && typeof editor.endBatch === "function") {
      editor.beginBatch();
      endBatch = () => editor.endBatch();
      result = await runSteps();
    } else if (editor && typeof editor.mute === "function") {
      // Older engines only expose mute; the history implementation keeps it
      // active across the awaited tool calls. Silence explicit commits too for
      // hosts whose mute only covers document writes.
      restoreCommits = suppressPerCallCommits(editor);
      result = await editor.mute(runSteps);
    } else {
      restoreCommits = suppressPerCallCommits(editor);
      result = await runSteps();
    }
  } catch (e) {
    error = e;
    wasCancelled = e instanceof DOMException && e.name === "AbortError" || (turnSignal?.aborted === true);
    throw e;
  } finally {
    restoreCommits?.();
    endBatch?.();
    const after = documentFingerprint(editor);
    const changed = before !== null && after !== null && before !== after;
    if (editor && typeof editor.commit === "function" && (mutated || changed)) {
      let message = "AI: Agent turn";
      if (wasCancelled) message = "AI: Agent turn (cancelled)";
      else if (error) message = "AI: Agent turn (failed)";
      editor.commit(message);
    }
    if (error) throw error;
  }
  return result;
}
