// canvas_tools.js must evaluate before the HTML pipeline: it imports
// canvas_tools_build_layout.js and reads BUILD_LAYOUT_SCHEMA at load time, which is
// undefined if the import cycle starts from build_layout instead.
import { AGENT_DEFAULTS } from "./canvas_tools.js";
import { runHtmlPipeline, shouldUseHtmlPipeline } from './html_pipeline/pipeline.js';
import { getActiveDesignSystem, setActiveDesignSystem } from './design_system/store.js';
import { fromStyleKit } from './design_system/from_style_kit.js';
/**
 * Minimal agent loop: the model talks, calls canvas tools, and sees their
 * results until it stops asking for tools. Nothing here builds a workflow.
 */

import { streamChatTurn } from "./chat_stream.js";
import { STYLE_KITS, buildDesignQualityPrompt, lintDesign, pickStyleKit } from "./design_quality/index.js";
import { buildDocumentDesignContext } from "../editor/design_tokens.js";
import { closeCodexSession } from "../components/agent-panel/codex_transport.js";
import { abortable } from "./abortable.js";
import { isCliAgentModel } from "./cli_agent_step.js";

export const AGENT_ERROR = Object.freeze({
  STEP_LIMIT: "agentStepLimit",
  NO_CANVAS_CONTENT: "agentNoCanvasContent",
});

export const SYSTEM_PROMPT =
  "You are a design agent inside a free-form design canvas (like Pencil/Figma). You change the " +
  "document only by calling tools; every tool's schema documents its arguments.\n\n" +
  "Workflow:\n" +
  "0. Plan: for any task needing more than ~3 edits, call update_plan with short steps first, " +
  "mark exactly one step in_progress while you work, and mark steps done as you finish them.\n" +
  "1. Inspect first: inspect_layer_tree / describe_selection / find_layers (by name or kind) before editing; " +
  "list_styles and list_variables before creating new ones.\n" +
  "You may return multiple tool calls in a single step; all will execute. " +
  "Use build_layout to efficiently create many layers or a whole tree in one call.\n" +
  "2. Structure: create_frame for containers (optionally with horizontal/vertical auto layout, gap, " +
  "padding); create_shape for rect/ellipse/text; create_path for vector art (SVG d); place_image for " +
  "raster at exact geometry when provided by the user. For one poster or composed page, create one " +
  "top-level Frame and nest its artwork and editable text layers under that Frame.\n" +
  "3. Arrange: align_layers and distribute_layers instead of hand-computing coordinates. For responsive UI, " +
  "use frame Auto Layout direction, wrap, per-side padding, item/line gaps, alignment, distribution and " +
  "fixed/hug sizing; set child layoutWidth/layoutHeight to fixed/hug/fill and layoutPosition to flow/absolute. " +
  "Use no Auto Layout for free-form posters. Use mutate_auto_layout for frames; mutate_layer_layout/style/text " +
  "or batch_mutate_layers for edits; " +
  "group_layers/ungroup_layers, reorder_layer, rename_layer (name every layer meaningfully).\n" +
  "4. Reuse: create_component then create_instance; set_instance_override, reset_instance_overrides, " +
  "swap_instance for variants. Design tokens: create_variable_collection, add_variable_mode, " +
  "create_variable, set_variable_value, set_active_mode, bind_variable; styles via create_style/apply_style; " +
  "set_text_range_style for rich text; get_path_nodes/edit_path_nodes for vector edits.\n" +
  "5. Scene ops: boolean_combine merges shapes (union/subtract/intersect/exclude); set_constraints " +
  "(left/right/center/scale, top/bottom/center/scale) so children follow frame resizes; export_layers " +
  "rasterizes layers to base64 PNG for verification or handoff.\n" +
  "6. Verify: After multi-step edits check inspect_layer_tree or capture_canvas (PNG returned to you), " +
  "and call inspect_layout for a machine-readable problem list (clipped/overflow/overlap/contrast). " +
  "If a step went wrong, use undo (and redo) rather than piling on fixes.\n" +
  "Design quality: plan first. Default to auto-layout frames for UI and composed layouts; pass layout " +
  "horizontal or vertical explicitly. Reserve layout: \"none\" for posters, free-form art, or intentional " +
  "absolute placement. Use spacing scale 4/8/12/16/24/32/48/64; establish typography hierarchy (display, " +
  "heading, body, caption), consistent radius and clear contrast. Create color tokens/variables before use " +
  "and bind them. Keep initial token setup small, then build the layout before expanding the palette. " +
  "For a poster/layout brief, create visible canvas layers in this turn; plans and variables alone do not " +
  "complete it. After multi-step writes, require capture_canvas, review alignment, clipping and hierarchy, " +
  "then fix and capture again. On tool failure inspect the error, correct arguments and retry once; report " +
  "unresolved failures.\n" +
  "7. Design quality: honor the Design quality block below — one style kit, tokens first, " +
  "clear hierarchy, no AI-template smells. For UI generation use Lucide icons, never emoji as icons. " +
  "Artwork: use generate_vector for original logo/illustration, vectorize_image to trace flat raster " +
  "marks, edit_image for background removal/replacement and stock_image for photography. For external " +
  "MCP clients without vector generation, use build_layout path nodes with SVG d data to create editable " +
  "vectors inside the composed Frame. For HTML generation use Tailwind utility classes for layout and styling. Use short copy for on-canvas " +
  "UI text: prefer concise labels, headlines and body text; avoid chatty paragraphs. " +
  "When the user asks for code, call export_code (html | react | css) and report the file name plus warnings.\n" +
  "Keep replies short.";

const READ_ONLY_TOOLS = new Set([
  "lint_design",
  "inspect_layout",
  "export_code",
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
  styleId = null,
  sceneKind = null,
  designSystem = null,
  streamStep = streamChatTurn,
  htmlPipeline = true,
  onProgress,
  chooseDirection,
  onVariant,
  variantCount = 1,
  frame,
}) {
  const base = styleNote.trim() ? `${SYSTEM_PROMPT}\n\nStyle notes from the user: ${styleNote.trim()}` : SYSTEM_PROMPT;
  let qualityOff = globalThis.__VOO_DESIGN_QUALITY_OFF__ === true;
  try { qualityOff ||= globalThis.localStorage?.getItem("voo.designQuality") === "off"; } catch {}
  const editor = activeEditor();
  // One signal per turn: CLI transports key their session on it and the HTML
  // pipeline aborts through it, so it must exist before the pipeline branch.
  const turnSignal = signal ?? new AbortController().signal;
  if (!qualityOff && shouldUseHtmlPipeline({ editor, userText, enabled: htmlPipeline })) {
    const doc = editor.getDocument?.() ?? editor.getDoc?.();
    const baseFrame = frame ?? { width: doc.width || 1440, height: doc.height || 1000, x: 0, y: 0 };
    const brief = styleNote ? `${userText}\nStyle notes: ${styleNote}` : userText;
    // Variants: the same brief, the same pipeline, N different art directions,
    // laid out side by side so the user can compare them in place.
    const count = Math.max(1, Math.min(4, Math.round(Number(variantCount) || 1)));
    const variants = [];
    const results = [];
    for (let index = 0; index < count; index += 1) {
      turnSignal.throwIfAborted();
      const variantFrame = {
        ...baseFrame,
        x: (baseFrame.x ?? 0) + index * ((baseFrame.width || 1440) + 80),
      };
      const result = await runHtmlPipeline({
        brief,
        frame: variantFrame,
        styleKitId: styleId,
        designSystem,
        editor, streamStep, config, signal,
        onProgress,
        chooseDirection: chooseDirection
          ? (choices, options = {}) => chooseDirection(choices, { ...options, variantIndex: index })
          : undefined,
      });
      results.push(result);
      const variant = {
        index,
        frameId: result.frameId ?? null,
        directionId: result.directionId,
        nodeCount: result.nodeCount,
      };
      variants.push(variant);
      onVariant?.(variant);
    }
    if (count === 1) {
      return `Created page with ${results[0].nodeCount} editable layers (${results[0].directionId}).`;
    }
    return `Created ${variants.length} variants side by side (frames ${variants
      .map((variant) => `${variant.index + 1}:${variant.frameId ?? "?"}`)
      .join(", ")}). Compare them, keep the best one and delete the others.`;
  }
  const before = documentFingerprint(editor);
  const explicitKit = styleId ? STYLE_KITS[styleId] : null;
  const kit = explicitKit && explicitKit.id ? explicitKit : pickStyleKit(userText);
  let activeDesignSystem = null;
  if (!qualityOff) {
    const doc = editor?.getDocument?.() ?? editor?.getDoc?.();
    // An explicit welcome-screen choice wins over the document's stored system.
    activeDesignSystem = designSystem ?? getActiveDesignSystem(doc) ?? fromStyleKit(kit);
    // A prompt fallback must not mutate the document or create an undo entry.
  }
  const documentContext = buildDocumentDesignContext(editor?.getDocument?.());
  const designPrompt = qualityOff ? base : `${base}\n\n${buildDesignQualityPrompt({ userText, kit, designSystem: activeDesignSystem, sceneKind })}`;
  const system = designPrompt + documentContext;
  const messages = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userText },
  ];
  let mutated = false;
  let writesSinceCapture = 0;
  let verificationNudged = false;
  let retryNudged = false;
  let failurePending = false;
  let canvasCreated = false;
  let creationNudged = false;
  let lintReport = null;
  let lintNudged = false;
  const creationTools = new Set([
    "build_layout", "create_frame", "create_shape", "create_path", "place_image",
    "generate_image", "generate_image_web", "generate_vector", "vectorize_image",
    "edit_image", "stock_image", "create_icon", "create_instance", "create_nodes", "edit_html",
  ]);
  // Only creation briefs require new content; inspection and token-only tasks remain valid.
  // Without a creation tool in the toolset the requirement cannot be met, so do not enforce it.
  const needsCanvasContent = tools.some(tool => creationTools.has(tool?.function?.name))
    && /(?:create|draft|design|build|make).{0,60}(?:poster|layout|screen|landing page|dashboard)|(?:草拟|设计|生成|绘制|制作).{0,30}(?:海报|版式|页面|界面)/i.test(userText);
  const canCapture = tools.some(tool => tool.function?.name === "capture_canvas");
  // Nested text completion for generate_vector. CLI transports drive their own
  // agent loop and cannot be nested, so only API models expose this helper.
  const llm = config?.model && !isCliAgentModel(config.model)
    ? {
        complete: async ({ system, user, signal: callSignal }) => {
          const out = await streamStep({
            config,
            messages: [
              { role: "system", content: String(system ?? "") },
              { role: "user", content: String(user ?? "") },
            ],
            tools: [],
            signal: callSignal ?? turnSignal,
            onText: () => {},
          });
          return out?.text ?? "";
        },
      }
    : null;
  const toolContext = llm ? { signal: turnSignal, llm } : { signal: turnSignal };

  const runSteps = async () => {
    for (let step = 0; step < maxSteps; step += 1) {
      if (turnSignal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { text, toolCalls } = await abortable(() => streamStep({
        config,
        messages,
        tools,
        signal: turnSignal,
        onText: (text) => { if (!turnSignal.aborted) onText?.(text); },
      }), turnSignal);
      turnSignal.throwIfAborted();
      if (toolCalls.length === 0) {
        if (needsCanvasContent && !canvasCreated) {
          if (creationNudged) throw Object.assign(new Error(AGENT_ERROR.NO_CANVAS_CONTENT), { code: AGENT_ERROR.NO_CANVAS_CONTENT });
          creationNudged = true;
          messages.push({ role: "assistant", content: text || null }, { role: "user", content: "The brief requires visible canvas content. Only setup has been completed. Now create the poster/layout using create_frame and create_shape (or other available canvas creation tools), then capture_canvas to verify. Do not stop at plans or variables." });
          continue;
        }
        if (failurePending && !retryNudged) {
          retryNudged = true;
          messages.push({ role: "assistant", content: text || null }, { role: "user", content: "A tool failed. Inspect its error and retry once with corrected arguments, or explain why it cannot be completed." });
          continue;
        }
        const generatedDesignNeedsVerification =
          needsCanvasContent && canvasCreated && writesSinceCapture > 0;
        if (
          canCapture &&
          (generatedDesignNeedsVerification || writesSinceCapture >= 2) &&
          !verificationNudged
        ) {
          verificationNudged = true;
          messages.push({ role: "assistant", content: text || null }, { role: "user", content: "Before finishing, call capture_canvas to verify the generated design. Review the image and fix visible problems." });
          continue;
        }
        // Bounded automatic quality gate: a low deterministic layout score gets
        // exactly one repair pass, and only for a design with real content.
        if (
          canCapture &&
          lintReport &&
          !lintNudged &&
          (lintReport.metrics?.nodeCount ?? 0) >= 3 &&
          lintReport.score < 60
        ) {
          lintNudged = true;
          const issues = (lintReport.issues ?? [])
            .filter((issue) => issue.severity === "error")
            .slice(0, 5)
            .map((issue) => `${issue.rule}: ${issue.message}`)
            .join("; ");
          messages.push({ role: "assistant", content: text || null }, {
            role: "user",
            content: `Automated layout check scored ${lintReport.score}/100. Fix the highest-impact problems (${issues || "overflow, clipping, contrast"}), then call capture_canvas once to verify. Do not start over.`,
          });
          continue;
        }
        return text;
      }

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
          const result = await abortable(() => executeTool(call.name, args, toolContext), turnSignal);
          turnSignal.throwIfAborted();
          if (result?.isError || result?.error) throw new Error(JSON.stringify(result));
          if (!READ_ONLY_TOOLS.has(call.name) && activeDesignSystem && editor) {
            const doc = editor.getDocument?.() ?? editor.getDoc?.();
            if (doc && !getActiveDesignSystem(doc)) setActiveDesignSystem(editor, activeDesignSystem);
          }
          failurePending = false;
          if (creationTools.has(call.name)) canvasCreated = true;
          if (call.name === "capture_canvas") writesSinceCapture = 0;
          else if (!READ_ONLY_TOOLS.has(call.name)) { writesSinceCapture += 1; verificationNudged = false; }
          const { dataUrl, ...rest } = result && typeof result === "object" ? result : {};
          const hasImage = typeof dataUrl === "string" && dataUrl.startsWith("data:image");
          let lintSummary = null;
          if (call.name === "capture_canvas" && editor) {
            // Attach a deterministic layout check to every verification capture so
            // the model sees overflow/contrast/hierarchy problems, not just pixels.
            try {
              const doc = editor.getDocument?.() ?? editor.getDoc?.();
              if (doc) {
                lintReport = lintDesign(doc);
                const top = (lintReport.issues ?? [])
                  .filter((issue) => issue.severity === "error")
                  .concat((lintReport.issues ?? []).filter((issue) => issue.severity !== "error"))
                  .slice(0, 6)
                  .map((issue) => ({ rule: issue.rule, severity: issue.severity, message: issue.message, fix: issue.fix }));
                lintSummary = { score: lintReport.score, nodeCount: lintReport.metrics?.nodeCount ?? 0, issues: top };
              }
            } catch {
              lintReport = null;
            }
          }
          const content = JSON.stringify(hasImage
            ? { ...rest, imageAttached: true, ...(lintSummary ? { lint: lintSummary } : {}) }
            : (lintSummary ? { ...(result ?? {}), lint: lintSummary } : result));
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
          if (turnSignal.aborted) {
            onToolEvent?.({ id: call.id, name: call.name, arguments: args, status: "cancelled" });
            throw error;
          }
          failurePending = true;
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
    // A step limit happens outside the transport; release a native CLI still
    // parked awaiting the final tool receipt. Cleanup must preserve the cause.
    try { await closeCodexSession(turnSignal); } catch (cleanupError) { console.warn("[agent] Session cleanup failed", cleanupError); }
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
