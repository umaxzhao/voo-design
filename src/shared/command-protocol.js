/**
 * Shared Command Protocol Specification & Pure Logic Runtime.
 *
 * Defines the cross-domain command contract shared across Design Editor,
 * Clip Editor, and Workflow environments, without any React / DOM dependencies.
 */

export const COMMAND_DOMAIN = Object.freeze({
  EDITOR: "editor",
  CLIP: "clip",
  WORKFLOW: "workflow",
});

export const COMMAND_KIND = Object.freeze({
  ACTION: "action",
  MUTATION: "mutation",
  QUERY: "query",
});

export const ASSET_KIND = Object.freeze({
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  SVG: "svg",
  BINARY: "binary",
});

/**
 * Standard immutable Asset Reference.
 */
export function createAssetRef({
  assetId,
  kind = ASSET_KIND.IMAGE,
  url = null,
  sourceNodeId = null,
  filename = null,
  mimeType = null,
  metadata = {},
}) {
  if (!assetId || typeof assetId !== "string") {
    throw new TypeError("AssetRef requires a non-empty string assetId");
  }
  return Object.freeze({
    assetId,
    kind,
    url,
    sourceNodeId,
    filename,
    mimeType,
    metadata: Object.freeze({ ...metadata }),
  });
}

/**
 * Normalizes loose asset representations (URL string, raw object with id/filename)
 * into a standard immutable AssetRef.
 */
export function normalizeAssetRef(input) {
  if (!input) return null;
  if (typeof input === "string") {
    let kind = ASSET_KIND.IMAGE;
    if (
      /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(input) ||
      input.startsWith("blob:video/") ||
      input.startsWith("data:video/")
    ) {
      kind = ASSET_KIND.VIDEO;
    } else if (
      /\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i.test(input) ||
      input.startsWith("blob:audio/") ||
      input.startsWith("data:audio/")
    ) {
      kind = ASSET_KIND.AUDIO;
    } else if (/\.svg(\?.*)?$/i.test(input)) {
      kind = ASSET_KIND.SVG;
    }
    return createAssetRef({
      assetId: input,
      kind,
      url: input,
      filename: input.split("/").pop()?.split("?")[0] || null,
    });
  }

  if (typeof input === "object") {
    const assetId = input.assetId || input.id || input.url || null;
    if (!assetId) return null;

    let kind = input.kind;
    if (!kind) {
      const mime = input.mimeType || input.type || "";
      if (mime.includes("video") || input.filename?.endsWith(".mp4")) {
        kind = ASSET_KIND.VIDEO;
      } else if (mime.includes("audio") || input.filename?.endsWith(".mp3")) {
        kind = ASSET_KIND.AUDIO;
      } else if (mime.includes("svg") || input.filename?.endsWith(".svg")) {
        kind = ASSET_KIND.SVG;
      } else {
        kind = ASSET_KIND.IMAGE;
      }
    }

    return createAssetRef({
      assetId: String(assetId),
      kind,
      url: input.url || null,
      sourceNodeId: input.sourceNodeId || input.nodeId || null,
      filename: input.filename || input.name || null,
      mimeType: input.mimeType || input.type || null,
      metadata: input.metadata || {},
    });
  }

  return null;
}

/**
 * Creates a structured command error with suggestion.
 */
export function createCommandError(
  code,
  message,
  { details = null, suggestion = null } = {},
) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  if (suggestion) err.suggestion = suggestion;
  return err;
}

/**
 * Validates command arguments against definition schema.
 */
export function validateCommandPayload(def, payload = {}) {
  const params = def?.params ?? {};
  const properties = params.properties ?? {};
  const required = params.required ?? [];
  const missing = required.filter((key) => payload[key] === undefined);

  if (missing.length > 0) {
    return {
      valid: false,
      error: createCommandError(
        "ARGS_INVALID",
        `${def.id} is missing required argument(s): ${missing.join(", ")}.`,
        { details: { missing } },
      ),
    };
  }

  for (const [key, schema] of Object.entries(properties)) {
    const val = payload[key];
    if (val === undefined) continue;
    if (
      schema.type === "number" &&
      (typeof val !== "number" || !Number.isFinite(val))
    ) {
      return {
        valid: false,
        error: createCommandError(
          "ARGS_INVALID",
          `${def.id} argument "${key}" must be a finite number.`,
          { details: { field: key, expected: "number" } },
        ),
      };
    }
    if (schema.type === "string" && typeof val !== "string") {
      return {
        valid: false,
        error: createCommandError(
          "ARGS_INVALID",
          `${def.id} argument "${key}" must be a string.`,
          { details: { field: key, expected: "string" } },
        ),
      };
    }
    if (schema.type === "array" && !Array.isArray(val)) {
      return {
        valid: false,
        error: createCommandError(
          "ARGS_INVALID",
          `${def.id} argument "${key}" must be an array.`,
          { details: { field: key, expected: "array" } },
        ),
      };
    }
    if (schema.type === "boolean" && typeof val !== "boolean") {
      return {
        valid: false,
        error: createCommandError(
          "ARGS_INVALID",
          `${def.id} argument "${key}" must be a boolean.`,
          { details: { field: key, expected: "boolean" } },
        ),
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Standard execution receipt returned by all commands.
 */
export function createExecutionReceipt({
  ok = true,
  commandId,
  domain,
  actionId = null,
  affectedIds = [],
  undoEntries = 0,
  data = null,
  error = null,
  ...extra
}) {
  return Object.freeze({
    ok: Boolean(ok),
    commandId,
    domain,
    actionId,
    affectedIds: Object.freeze(
      Array.isArray(affectedIds) ? [...affectedIds] : [],
    ),
    undoEntries: Number(undoEntries) || 0,
    data: data ? Object.freeze({ ...data }) : null,
    error: error
      ? Object.freeze({
          code: error.code || "UNKNOWN_ERROR",
          message: error.message || String(error),
          details: error.details || null,
          suggestion: error.suggestion || null,
        })
      : null,
    ...extra,
  });
}
