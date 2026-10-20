/**
 * Structured tool errors and failure receipts.
 *
 * Tools throw `ToolError` (code + message + missing + suggestion); the
 * registry's dispatch normalizes whatever is thrown into a stable receipt
 * shape the agent model can act on instead of a bare message string:
 *
 *   { ok: false, error: { code, message, missing, suggestion } }
 *
 * `suggestion` tells the model which tool to call next (or what to ask the
 * user) so it can self-correct instead of blindly retrying. See the team
 * design doc .agent-teams/ai-pipeline-p0/tool-preconditions.md §3.
 */

import { errorExplanation } from "../../../error_text.js";

/** Stable machine-readable error codes. */
export const TOOL_ERROR_CODE = {
  /** tool_call arguments failed to parse or a required argument is missing. */
  ARGS_INVALID: "ARGS_INVALID",
  /** A required context/store capability is missing in this environment. */
  STORE_UNAVAILABLE: "STORE_UNAVAILABLE",
  /** A referenced node id does not exist on the canvas. */
  NODE_NOT_FOUND: "NODE_NOT_FOUND",
  /** A node exists but has no generated results yet (run the workflow). */
  NODE_NO_RESULTS: "NODE_NO_RESULTS",
  /** A node/workflow is still generating — results are pending, not missing. */
  GENERATION_IN_PROGRESS: "GENERATION_IN_PROGRESS",
  /** A node exists but has no generated versions/results to pick from. */
  NO_VERSIONS: "NO_VERSIONS",
  /** An index argument falls outside the node's version list. */
  INDEX_OUT_OF_RANGE: "INDEX_OUT_OF_RANGE",
  /** A versionId argument matches no stored version. */
  VERSION_NOT_FOUND: "VERSION_NOT_FOUND",
  /** A referenced asset (e.g. generated image) is not in the store. */
  ASSET_MISSING: "ASSET_MISSING",
  /** Connect ports/types do not match. */
  PORT_MISMATCH: "PORT_MISMATCH",
  /** A required prompt/description argument is empty. */
  EMPTY_PROMPT: "EMPTY_PROMPT",
  /** A store capability (e.g. layout generator) is not available. */
  GENERATOR_UNAVAILABLE: "GENERATOR_UNAVAILABLE",
  /** A workflow run is already in progress. */
  RUN_ALREADY_RUNNING: "RUN_ALREADY_RUNNING",
  /** An editor tool needs a pixel selection first. */
  NO_SELECTION: "NO_SELECTION",
  EDITOR_NOT_OPEN: "EDITOR_NOT_OPEN",
  /** The target layer is locked / pixel-locked. */
  LAYER_LOCKED: "LAYER_LOCKED",
  /** The pixel selection points at no layer, or at one without pixels. */
  NO_EDITABLE_IMAGE: "NO_EDITABLE_IMAGE",
  /** An AI operation needs a configured provider key. */
  PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  /** No model that accepts images is configured, so nothing can look. */
  VISION_NOT_AVAILABLE: "VISION_NOT_AVAILABLE",
  /** A local model (object-selection matting) is not downloaded yet. */
  MODEL_NOT_READY: "MODEL_NOT_READY",
  /** The operation ran but found nothing to act on. */
  NOTHING_FOUND: "NOTHING_FOUND",
  /** The editor/engine in this build cannot do what was asked. */
  CAPABILITY_MISSING: "CAPABILITY_MISSING",
  /** The operation was stopped or aborted by user/signal. */
  OPERATION_ABORTED: "OPERATION_ABORTED",
  /** The user rejected the operation at the approval gate. */
  DENIED_BY_USER: "DENIED_BY_USER",
  /** The target object was modified since read (stale revision conflict). */
  STALE_REVISION_CONFLICT: "STALE_REVISION_CONFLICT",
  /** A region-scoped mutation changed pixels outside its selection. */
  REGION_BOUNDARY_VIOLATION: "REGION_BOUNDARY_VIOLATION",
  /** Anything without a code (plain Error, unexpected shape). */
  UNKNOWN: "UNKNOWN",
};

export class ToolError extends Error {
  /**
   * @param {string} code - One of TOOL_ERROR_CODE.
   * @param {string} message - Human/model-readable one-liner.
   * @param {{ missing?: Object, details?: Object, suggestion?: { tool: string|null, args?: Object, note?: string } }} [options]
   */
  constructor(
    code,
    message,
    { missing = null, details = null, suggestion = null } = {},
  ) {
    super(message);
    this.name = "ToolError";
    this.code = code || TOOL_ERROR_CODE.UNKNOWN;
    this.missing = missing;
    this.details = details;
    this.suggestion = suggestion;
  }
}

/** Convenience factory for tools to throw structured errors. */
export function createToolError(code, message, options) {
  return new ToolError(code, message, options);
}

/**
 * The message a tool failure carries to the model.
 *
 * A tool that lets an engine error escape hands the model the code twice:
 * `RunError` (engine/executor_errors.js), `apiError` (engine/api_executor.js)
 * and `combineError` (engine/combine_video.js) all default their message to
 * their code, so a failure the user could fix arrived as
 * `{"code":"unsupported-mp4","message":"unsupported-mp4"}` — a machine token
 * the model can neither act on nor repeat. That is the shape d8457a1 fixed on
 * the clip render path; this is the same treatment at the seam every tool
 * failure passes through, so no tool can reintroduce it.
 *
 * The code is left alone — it is the machine-readable cause the turn's failure
 * breaker keys on. Only a message that says nothing beyond the code is
 * replaced, and a code with no authored copy keeps its bare message, because
 * inventing prose for it would be worse than naming it.
 *
 * @param {{ code: string, message?: string }} err
 * @returns {string}
 */
function toolFailureMessage(err) {
  const raw = err.message ?? String(err);
  const saysNothing = raw === "" || raw === err.code;
  return saysNothing ? errorExplanation(err) || raw : raw;
}

/**
 * Normalizes any thrown error into the structured error object
 * `{ code, message, missing, suggestion }`. Plain errors map to UNKNOWN so
 * the receipt shape is stable for the model.
 *
 * @param {unknown} err
 * @returns {{ code: string, message: string, missing: Object|null, suggestion: Object|null }}
 */
export function normalizeToolError(err) {
  if (err && typeof err === "object" && typeof err.code === "string") {
    return {
      code: err.code,
      message: toolFailureMessage(err),
      missing: err.missing ?? null,
      ...(err.details ? { details: err.details } : {}),
      suggestion: err.suggestion ?? null,
    };
  }
  if (err?.name === "AbortError" || err?.code === "ABORT_ERR") {
    return {
      code: TOOL_ERROR_CODE.OPERATION_ABORTED,
      message: err.message || "Operation aborted.",
      missing: null,
      suggestion: null,
    };
  }
  return {
    code: TOOL_ERROR_CODE.UNKNOWN,
    message: err?.message ?? String(err ?? "Unknown error"),
    missing: null,
    suggestion: null,
  };
}

/**
 * The full failure receipt the agent loop writes into the conversation:
 * `{ ok: false, error: {...} }`. `error` may already be a normalized object
 * (from dispatch) or a raw error/string (normalized here).
 *
 * @param {unknown} error
 * @returns {{ ok: false, error: { code: string, message: string, missing: Object|null, suggestion: Object|null } }}
 */
export function failureReceipt(error) {
  return { ok: false, error: normalizeToolError(error) };
}
