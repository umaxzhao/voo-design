/**
 * Factory for the editor-command tools (select_region / refine_selection /
 * fill_selection / repaint_selection).
 *
 * Each tool routes through the workflow store's editor command bridge, which
 * the open editor registers on mount. A missing bridge means no editor is
 * open — the tool answers EDITOR_NOT_OPEN with an actionable next step;
 * any structured reason from the bridge (NO_SELECTION, PROVIDER_NOT_CONFIGURED,
 * LAYER_LOCKED, ...) is passed through as the receipt.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { createEditorRecoverySuggestion } from "./editor-recovery-suggestion.js";
import {
  COMMAND_DEFINITIONS,
  getCommandDefinition,
} from "../../../editor/command_table.js";

export function createTableEditorCommandTool(
  id,
  { name, bridgeTool, capabilities, presentCall, presentResult } = {},
) {
  const def = getCommandDefinition(id);
  if (!def) {
    throw new Error(`Editor command not in command table: ${id}`);
  }
  const toolName = name ?? def.id;
  return createEditorCommandTool({
    name: toolName,
    // Tools whose model-facing name is an alias (inspect_selection,
    // draw_vector) must still dispatch the underlying command id.
    bridgeTool: bridgeTool ?? toolName,
    description: def.description,
    properties: def.params.properties,
    required: def.params.required ?? [],
    approvalLevel: def.approvalLevel,
    // The bridge performs selection checks and returns the richer editor
    // receipts; keep agent-side `requires` to argument shape only so those
    // receipts are not shadowed by the generic precheck.
    requires: def.requires?.args ? { args: def.requires.args } : {},
    capabilities,
    presentCall: presentCall ?? (() => ({ title: toolName })),
    presentResult,
  });
}

/**
 * Build one agent tool per command-table entry that is agent-exposed.
 *
 * Exposed by default; entries with `exposeAsTool: false` (internal reads
 * consumed by composite vision tools, and command ids whose model-facing
 * entry point is a differently-named hand-written tool) are skipped.
 */
export function createToolsFromCommandTable() {
  return Object.values(COMMAND_DEFINITIONS)
    .filter((def) => def.exposeAsTool !== false)
    .map((def) => createTableEditorCommandTool(def.id));
}

export function createEditorCommandTool({
  name,
  bridgeTool,
  description,
  properties,
  required = [],
  approvalLevel = TOOL_APPROVAL_LEVEL.CANVAS_MUTATION,
  requires = {},
  capabilities,
  presentCall,
  presentResult,
}) {
  return {
    spec: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
    exposure: "deferred",
    approvalLevel,
    requires,
    ...(capabilities ? { capabilities } : {}),
    async execute(args, context) {
      const store = context.getStore();
      try {
        return await store.runEditorCommand({
          tool: bridgeTool ?? name,
          args,
        });
      } catch (err) {
        if (err?.code === "EDITOR_NOT_OPEN") {
          throw createToolError(
            TOOL_ERROR_CODE.EDITOR_NOT_OPEN,
            "The image editor is not open — open it before issuing editor commands.",
            {
              missing: { editor: ["open"] },
              suggestion: createEditorRecoverySuggestion(),
            },
          );
        }
        throw createToolError(
          err?.code ?? TOOL_ERROR_CODE.ARGS_INVALID,
          err?.message ?? String(err),
          {
            missing: err?.missing ?? {},
            suggestion: err?.suggestion ?? {
              tool: "list_nodes",
              args: {},
              note: "Inspect the editor state and retry.",
            },
          },
        );
      }
    },
    presentCall(args) {
      return presentCall(args);
    },
    presentResult(_args, result) {
      if (presentResult) return presentResult(_args, result);
      if (!result) return { title: name };
      const summary = result.bounds
        ? `${Math.round(result.bounds.width)}×${Math.round(result.bounds.height)}`
        : result.ok
          ? "ok"
          : "";
      return { title: `${name}${summary ? ` — ${summary}` : ""}` };
    },
  };
}
