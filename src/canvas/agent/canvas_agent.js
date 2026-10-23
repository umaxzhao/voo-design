/**
 * Minimal agent loop: the model talks, calls canvas tools, and sees their
 * results until it stops asking for tools. Nothing here builds a workflow.
 */

import { streamChatTurn } from "./chat_stream.js";
import { buildDesignQualityPrompt, pickStyleKit } from "./design_quality/index.js";

import { AGENT_DEFAULTS } from "./canvas_tools.js";

export const AGENT_ERROR = Object.freeze({
  STEP_LIMIT: "agentStepLimit",
});

export const SYSTEM_PROMPT =
  "You are a design agent inside a free-form design canvas (like Pencil/Figma). You change the " +
  "document only by calling tools; every tool's schema documents its arguments.\n\n" +
  "Workflow:\n" +
  "0. Plan: for any task needing more than ~3 edits, call update_plan with short steps first, " +
  "mark exactly one step in_progress while you work, and mark steps done as you finish them.\n" +
  "1. Inspect first: inspect_layer_tree / describe_selection / find_layers (by name or kind) before editing; " +
  "list_styles and list_variables before creating new ones.\n" +
  "2. Structure: create_frame for containers (optionally with horizontal/vertical auto layout, gap, " +
  "padding); create_shape for rect/ellipse/text; create_path for vector art (SVG d); place_image for " +
  "raster at exact geometry; generate_image or generate_image_web to make imagery.\n" +
  "3. Arrange: align_layers and distribute_layers instead of hand-computing coordinates; " +
  "mutate_auto_layout for frames; mutate_layer_layout/style/text or batch_mutate_layers for edits; " +
  "group_layers/ungroup_layers, reorder_layer, rename_layer (name every layer meaningfully).\n" +
  "4. Reuse: create_component then create_instance; set_instance_override, reset_instance_overrides, " +
  "swap_instance for variants. Design tokens: create_variable_collection, add_variable_mode, " +
  "create_variable, set_variable_value, set_active_mode, bind_variable; styles via create_style/apply_style; " +
  "set_text_range_style for rich text; get_path_nodes/edit_path_nodes for vector edits.\n" +
  "5. Scene ops: boolean_combine merges shapes (union/subtract/intersect/exclude); set_constraints " +
  "(left/right/center/scale, top/bottom/center/scale) so children follow frame resizes; export_layers " +
  "rasterizes layers to base64 PNG for verification or handoff.\n" +
  "6. Verify: After multi-step edits check inspect_layer_tree or capture_canvas (PNG returned to you). " +
  "If a step went wrong, use undo (and redo) rather than piling on fixes.\n" +
  "7. Design quality: honor the Design quality block below — one style kit, tokens first, " +
  "clear hierarchy, no AI-template smells.\n" +
  "Keep replies short.";

const READ_ONLY_TOOLS = new Set([
  "lint_design",
  "describe_selection",
  "inspect_layer_tree",
  "select_layers",
  "list_styles",
  "list_variables",
  "capture_canvas",
  "find_layers",
  "get_plan",
  "update_plan",
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
  const base = styleNote.trim() ? `${SYSTEM_PROMPT}\n\nStyle notes from the user: ${styleNote.trim()}` : SYSTEM_PROMPT;
  let qualityOff = globalThis.__VOO_DESIGN_QUALITY_OFF__ === true;
  try { qualityOff ||= globalThis.localStorage?.getItem("voo.designQuality") === "off"; } catch {}
  const system = qualityOff ? base : `${base}\n\n${buildDesignQualityPrompt({ userText, kit: pickStyleKit(userText) })}`;
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
