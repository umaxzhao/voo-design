/**
 * Command executor.
 *
 * Owns argument validation, gesture preview dispatch and executeEditorCommand.
 * The implementations/definitions modules stay pure and do not import this
 * module, so a change to schema or command logic never has to touch the
 * executor.
 */
import { COMMAND_DEFINITIONS, getCommandDefinition } from "./definitions.js";
import { IMPLEMENTATIONS } from "./implementations.js";
import { editorCommandError } from "./errors.js";
import { resolveTracePoints, sampleBezierPath } from "./helpers.js";
import { commitEditorAction } from "../../undo-action-contracts.js";
import { editorCommandActionId } from "../editor_undo_actions.js";

function validateCommandArgs(def, args) {
  const params = def.params ?? {};
  const properties = params.properties ?? {};
  const missing = (params.required ?? []).filter(
    (key) => args[key] === undefined,
  );
  if (missing.length > 0) {
    return {
      code: "ARGS_INVALID",
      message: `${def.id} is missing required argument(s): ${missing.join(", ")}.`,
      missing: { args: missing },
    };
  }
  for (const [key, schema] of Object.entries(properties)) {
    const value = args[key];
    if (value === undefined) continue;
    if (
      schema.type === "number" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      return {
        code: "ARGS_INVALID",
        message: `${def.id} argument "${key}" must be a finite number.`,
        missing: { args: [key] },
      };
    }
    if (schema.type === "string" && typeof value !== "string") {
      return {
        code: "ARGS_INVALID",
        message: `${def.id} argument "${key}" must be a string.`,
        missing: { args: [key] },
      };
    }
    if (schema.type === "array" && !Array.isArray(value)) {
      return {
        code: "ARGS_INVALID",
        message: `${def.id} argument "${key}" must be an array.`,
        missing: { args: [key] },
      };
    }
    if (schema.type === "boolean" && typeof value !== "boolean") {
      return {
        code: "ARGS_INVALID",
        message: `${def.id} argument "${key}" must be a boolean.`,
        missing: { args: [key] },
      };
    }
    // Enum values are declared in the schema for model/UI capabilities; the
    // implementation still performs domain-specific validation so existing
    // commands keep their richer error messages (e.g. refine operation).
  }
  return null;
}

/**
 * Gesture preview strategies.
 *
 * Each handler computes only what is unique to its preview mode. It must not
 * decide confirm semantics or manage overlay state directly; the dispatcher in
 * executeEditorCommand turns the returned description into overlay state.
 */
const GESTURE_PREVIEWS = {
  async brush_stroke({ engine }, args) {
    const path = args?.path;
    const trace = args?.trace;
    const tracePoints = trace ? resolveTracePoints(engine, trace) : null;
    const points = tracePoints ?? sampleBezierPath(path);
    if (points.length === 0) {
      throw editorCommandError(
        "ARGS_INVALID",
        "brush_stroke needs a cubic Bézier path or a semantic trace.",
        { path: ["start", "segments"], trace: ["kind"] },
      );
    }
    const brush = args?.brush ?? {};
    return {
      mode: "path",
      overlay: {
        ...(tracePoints ? { points: tracePoints } : { path }),
        color: brush.color ?? engine?.getColor?.() ?? "#00aaff",
        width: Math.max(1, (brush.size ?? engine?.getBrushWidth?.() ?? 24) / 2),
      },
      meta: {
        ...(path ? { path } : {}),
        ...(trace ? { trace } : {}),
        pointCount: points.length,
      },
      note: "Path preview is active. Re-run with confirm:true to paint.",
    };
  },

  async clone_stroke({ engine }, args) {
    const points = sampleBezierPath(args?.path);
    if (points.length === 0 || !args?.sourcePoint) {
      throw editorCommandError(
        "ARGS_INVALID",
        "clone_stroke needs a source point and a non-empty cubic Bézier path.",
        { path: ["start", "segments"], sourcePoint: ["x", "y"] },
      );
    }
    const brush = args?.brush ?? {};
    const nodeId =
      args?.nodeId ??
      engine?.getSelectedId?.() ??
      engine?.getDocument?.()?.nodes?.find((n) => n.kind === "image")?.id ??
      null;
    const preview = await engine?.cloneStampStroke?.(
      nodeId,
      points,
      args.sourcePoint,
      points[0],
      brush.size ?? engine?.getBrushWidth?.() ?? 24,
      brush.hardness ?? engine?.getBrushHardness?.() ?? 0.5,
      brush.opacity ?? engine?.getBrushOpacity?.() ?? 1,
      { persist: false },
    );
    if (!preview?.dataUrl) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "Could not compute a clone stamp preview on the current target.",
        { canvas: ["image layer"] },
      );
    }
    return {
      mode: "bitmap",
      meta: { path: args.path },
      note: "Bitmap preview is active. Re-run with confirm:true to apply.",
    };
  },
};

/** Shows a gesture preview without persisting anything or entering history. */
async function showGesturePreview(engine, preview) {
  if (!preview) return;
  if (preview.mode === "path") {
    engine?.setGesturePreview?.(preview.overlay ?? null);
  }
  // Bitmap drafts are already installed by the preview strategy through the
  // engine's non-persisting cloneStampStroke path.
}

/** Clears a gesture preview. Bitmap previews are cleared by applyBitmapPreview. */
function clearGesturePreview(engine, previewMode) {
  if (previewMode === "path") {
    engine?.setGesturePreview?.(null);
  }
}

export async function executeEditorCommand(id, engine, args = {}) {
  if (engine?.isDisposed?.()) {
    throw editorCommandError(
      "EDITOR_NOT_OPEN",
      "Image editor has been recycled or closed.",
    );
  }
  if (
    args?.targetNodeId &&
    engine?.sourceWorkflowNodeId &&
    args.targetNodeId !== engine.sourceWorkflowNodeId
  ) {
    throw editorCommandError(
      "TARGET_MISMATCH",
      `Command target "${args.targetNodeId}" does not match editor artboard "${engine.sourceWorkflowNodeId}".`,
      { targetNodeId: [args.targetNodeId] },
    );
  }
  const def = getCommandDefinition(id);
  if (!def) {
    throw editorCommandError(
      "ARGS_INVALID",
      `Unknown editor command: ${id ?? "(none)"}`,
      {},
      {
        tool: "list_nodes",
        args: {},
        note: `Supported commands: ${Object.keys(COMMAND_DEFINITIONS).join(", ")}.`,
      },
    );
  }
  const invalid = validateCommandArgs(def, args);
  if (invalid) {
    const example = {};
    for (const [key, schema] of Object.entries(def.params?.properties ?? {})) {
      example[key] = schema.type === "number" ? 0 : "";
    }
    throw editorCommandError(invalid.code, invalid.message, invalid.missing, {
      tool: def.id,
      args: example,
      note: `Fill every required field declared by ${def.id}.`,
    });
  }
  const gesturePreviewMode = def.execution === "gesture" ? def.preview : null;
  if (gesturePreviewMode && args.confirm !== true) {
    const previewHandler = GESTURE_PREVIEWS[id];
    if (!previewHandler) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        `Gesture command ${id} has no preview strategy.`,
        { gesture: ["preview"] },
      );
    }
    const preview = await previewHandler({ engine }, args);
    await showGesturePreview(engine, preview);
    return {
      preview: true,
      confirmation: def.confirmation ?? "auto",
      ...(preview?.meta ?? {}),
      note:
        preview?.note ??
        "Preview is active. Re-run with confirm:true to apply.",
    };
  }
  if (gesturePreviewMode && args.confirm === true) {
    clearGesturePreview(engine, gesturePreviewMode);
  }

  const implementation = IMPLEMENTATIONS[id];
  const run = () => implementation({ engine }, args);
  const result = def.undoable
    ? await commitEditorAction(editorCommandActionId(def.id), run)
    : await run();
  // A gesture preview is not a committed action: it must not enter history.
  if (def.undoable && result !== false && result?.preview !== true) {
    engine?.tagLastHistoryEntry?.(def.id, args);
  }
  return result;
}
