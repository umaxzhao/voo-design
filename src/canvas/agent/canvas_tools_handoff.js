/**
 * Handoff tools: structured layout QA and design-to-code delivery.
 *
 * Registered by extending CANVAS_TOOL_SCHEMAS / EXECUTORS in canvas_tools.js.
 * Both are read-only: they never mutate the document.
 */
import { inspectLayout } from "./layout_qa.js";
import { generateCode } from "../codegen/index.js";
import { CODEGEN_FORMATS, CODEGEN_SCOPES } from "../codegen/model.js";

// Same codes canvas_tools.js exposes. Importing them from there would create a
// module cycle (canvas_tools registers these tools), so they are restated here.
const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NODE_NOT_FOUND: "agentNodeNotFound",
  INVALID_ARGS: "agentInvalidArgs",
});

const DEFAULT_MAX_CODE_CHARS = 48000;
const MAX_CODE_CHARS = 200000;

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  return editor;
}

function invalidArgs(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.INVALID_ARGS), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

function documentOf(editor) {
  const doc = editor.getDoc?.() ?? editor.getDocument?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) invalidArgs("No design document is open.");
  return doc;
}

export const INSPECT_LAYOUT_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "inspect_layout",
    description:
      "Read-only structured layout QA for the current design (or one subtree). Returns a score, " +
      "nodeCount and a problems list: {kind, severity, layerIds, message, fix}. Kinds include " +
      "clipped, overflow, overlap, contrast, offGrid, misalignment, typeScale, hierarchy, " +
      "repetition, composition, spacing, decoration. Call this after multi-step edits instead " +
      "of guessing from a screenshot.",
    parameters: {
      type: "object",
      properties: {
        rootId: { type: "string", description: "Optional layer id to review only that subtree." },
      },
    },
  },
});

export function inspectLayoutTool({ rootId } = {}) {
  if (rootId !== undefined && rootId !== null && typeof rootId !== "string") {
    invalidArgs("rootId must be a string.");
  }
  const editor = requireEditor();
  const doc = documentOf(editor);
  if (rootId && !doc.nodes.some((node) => node.id === rootId)) {
    throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
  }
  return inspectLayout(doc, { rootId: rootId ?? undefined });
}

export const EXPORT_CODE_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "export_code",
    description:
      "Export the current selection (or the whole page) as handoff code. Formats: \"html\" " +
      "(standalone document + Tailwind utilities), \"react\" (single JSX component) or \"css\" " +
      "(semantic classes + matching HTML skeleton). Returns {code, fileName, language, format, " +
      "scope, warnings, totalChars, truncated}. Large documents are truncated at maxChars " +
      "(default 48000) — ask for a smaller scope or a bigger maxChars when that happens.",
    parameters: {
      type: "object",
      properties: {
        format: { type: "string", enum: [...CODEGEN_FORMATS], description: "html | react | css (default html)." },
        scope: { type: "string", enum: [...CODEGEN_SCOPES], description: "selection (default) | page." },
        layerIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional explicit layer ids to export; defaults to the current selection.",
        },
        maxChars: { type: "number", description: "Code budget before truncation (default 48000)." },
      },
    },
  },
});

export function exportCodeTool({ format = "html", scope = "selection", layerIds = null, maxChars } = {}) {
  const editor = requireEditor();
  const doc = documentOf(editor);
  const nextFormat = String(format ?? "html");
  if (!CODEGEN_FORMATS.includes(nextFormat)) invalidArgs(`Unsupported format: ${nextFormat}`);
  const nextScope = String(scope ?? "selection");
  if (!CODEGEN_SCOPES.includes(nextScope)) invalidArgs(`Unsupported scope: ${nextScope}`);
  const explicitIds = Array.isArray(layerIds)
    ? [...new Set(layerIds.filter((id) => typeof id === "string" && id.trim()))]
    : null;
  if (layerIds != null && (!explicitIds || explicitIds.length === 0)) {
    invalidArgs("layerIds must be a non-empty array of layer ids.");
  }
  const selectedIds = explicitIds ?? (editor.getSelectedIds?.() ?? editor.getSelection?.()?.map((node) => node?.id) ?? []);
  const result = generateCode({
    doc,
    selectedIds,
    format: nextFormat,
    scope: nextScope,
  });
  const budget = Math.max(
    2000,
    Math.min(MAX_CODE_CHARS, Number.isFinite(Number(maxChars)) ? Number(maxChars) : DEFAULT_MAX_CODE_CHARS),
  );
  const truncated = result.code.length > budget;
  return {
    format: result.format,
    scope: result.scope,
    fileName: result.fileName,
    language: result.language,
    code: truncated ? result.code.slice(0, budget) : result.code,
    totalChars: result.code.length,
    truncated,
    warnings: result.warnings.slice(0, 10),
    warningCount: result.warnings.length,
  };
}

export const HANDOFF_TOOL_SCHEMAS = Object.freeze([INSPECT_LAYOUT_SCHEMA, EXPORT_CODE_SCHEMA]);

export const HANDOFF_TOOL_EXECUTORS = Object.freeze({
  inspect_layout: inspectLayoutTool,
  export_code: exportCodeTool,
});
