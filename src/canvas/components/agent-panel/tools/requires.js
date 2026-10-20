/**
 * Precondition checking for agent tools.
 *
 * A tool module may declare `requires` next to its `spec` — a declarative
 * list of what must hold before `execute` runs. The registry runs
 * `checkRequires` before every dispatch; the first unmet requirement throws
 * a structured `ToolError` that becomes the failure receipt (§3 of the team
 * design doc .agent-teams/ai-pipeline-p0/tool-preconditions.md).
 *
 * Supported requirement kinds (checked in this order):
 *
 *   args:     ["prompt", ...]              required args must be present/non-empty
 *   context:  ["getRegistry", ...]         context[name] must be a function
 *   canvas:   ["node:nodeId", ...]         args[param] (when provided) must exist in
 *                                          store.nodes; "nodes:≥1" requires a non-empty
 *                                          canvas
 *   nodeData: ["sourceNodeId.results", ...] the referenced node's data[field] must be
 *                                          non-empty
 *   store:    ["images[imageId]", "alignWorkflow", ...]  "field[argParam]" must resolve
 *                                          to an existing store asset; a bare name must
 *                                          be a store action (function)
 *   provider: ["image-edit", ...]          context.hasProviderKey(name) /
 *                                          context.providerKeys[name] must be configured
 *   selection: "pixel"                     context.getPixelSelection() must return a
 *                                          live selection (future editor tools)
 *
 * `approval` is declared for documentation only — the actual approval gate
 * lives in the agent loop (needsApproval + requestApproval) before dispatch.
 *
 * Canvas `node:<param>` entries are optional-by-absence: when the argument
 * is not provided at all the check is skipped, so one declaration covers
 * both required and optional node-id parameters.
 */

import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { RUN_STATUS } from "../../../nodes/node_enums.js";

function storeOf(context) {
  if (typeof context?.getStore !== "function") {
    throw createToolError(
      TOOL_ERROR_CODE.STORE_UNAVAILABLE,
      "Store accessor is not configured in this environment.",
      {
        missing: { context: ["getStore"] },
        suggestion: {
          tool: null,
          args: {},
          note: "Retry — the store accessor should be provided by the agent runtime.",
        },
      },
    );
  }
  try {
    return context.getStore() ?? {};
  } catch (err) {
    throw createToolError(
      TOOL_ERROR_CODE.STORE_UNAVAILABLE,
      `Store accessor failed: ${err?.message ?? String(err)}`,
      {
        missing: { context: ["getStore"] },
        suggestion: {
          tool: null,
          args: {},
          note: "Retry — the store accessor should be provided by the agent runtime.",
        },
      },
    );
  }
}

function missingArgSuggestion(name) {
  return {
    tool: null,
    args: {},
    note: `Provide the "${name}" argument and retry the call.`,
  };
}

function nodeNotFoundSuggestion() {
  return {
    tool: "list_nodes",
    args: {},
    note: "Call list_nodes to get valid node ids, then retry.",
  };
}

function nodeNoResultsSuggestion(field) {
  return {
    tool: "run_workflow",
    args: {},
    note: `Run the workflow first (run_workflow) so the node has ${field}, then retry.`,
  };
}

/**
 * Verifies a handler's declared preconditions against the call.
 *
 * @param {{ requires?: Object }} handler - registered tool handler.
 * @param {Object} args - parsed tool arguments.
 * @param {Object} context - execution context (getStore, capabilities).
 * @returns {Promise<void>} resolves when all requirements hold.
 * @throws {ToolError} first unmet requirement, ready for the failure receipt.
 */
export async function checkRequires(handler, args, context) {
  const requires = handler?.requires;
  if (!requires) return;
  const callArgs = args ?? {};

  // 1. required args present and non-empty.
  for (const name of requires.args ?? []) {
    const value = callArgs[name];
    if (value === undefined || value === null || value === "") {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Missing required argument: ${name}`,
        { missing: { args: [name] }, suggestion: missingArgSuggestion(name) },
      );
    }
  }

  // 2. context capabilities.
  for (const name of requires.context ?? []) {
    if (typeof context?.[name] !== "function") {
      throw createToolError(
        TOOL_ERROR_CODE.STORE_UNAVAILABLE,
        `Required context capability is not available: ${name}`,
        {
          missing: { context: [name] },
          suggestion: {
            tool: null,
            args: {},
            note: "Retry — this capability should be provided by the agent runtime.",
          },
        },
      );
    }
  }

  // 3. canvas: node-id existence (checked only when the arg is provided) and
  //    a non-empty canvas.
  const store = storeOf(context);
  const nodes = Array.isArray(store.nodes) ? store.nodes : [];
  for (const entry of requires.canvas ?? []) {
    if (entry === "nodes:≥1") {
      if (nodes.length === 0) {
        throw createToolError(
          TOOL_ERROR_CODE.NODE_NOT_FOUND,
          "The canvas has no nodes to operate on.",
          {
            missing: { nodes: ["(any)"] },
            suggestion: {
              tool: "create_node",
              args: {},
              note: "Create a node first (create_node), then retry.",
            },
          },
        );
      }
      continue;
    }
    const match = /^node:(.+)$/.exec(entry);
    if (!match) continue;
    const param = match[1];
    const id = callArgs[param];
    if (id === undefined || id === null || id === "") continue;
    if (!nodes.some((node) => node.id === id)) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Node not found: ${id}`,
        { missing: { nodes: [id] }, suggestion: nodeNotFoundSuggestion() },
      );
    }
  }

  // 4. node data fields (e.g. "sourceNodeId.results" must be non-empty).
  for (const entry of requires.nodeData ?? []) {
    const [nodeParam, field] = entry.split(".");
    const id = callArgs[nodeParam];
    if (id === undefined || id === null || id === "") continue;
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Node not found: ${id}`,
        { missing: { nodes: [id] }, suggestion: nodeNotFoundSuggestion() },
      );
    }
    const value = node.data?.[field];
    const empty = Array.isArray(value) ? value.length === 0 : !value;
    if (empty) {
      // Distinguish "still generating" from "never ran": a running node or an
      // in-flight workflow means results are pending, not missing.
      const nodeRunning = node.data?.status === RUN_STATUS.RUNNING;
      const workflowRunning = store.run?.status === "running";
      if (nodeRunning || workflowRunning) {
        throw createToolError(
          TOOL_ERROR_CODE.GENERATION_IN_PROGRESS,
          `Node ${id} is still generating — results are not ready yet.`,
          {
            missing: { nodeData: [field] },
            suggestion: {
              tool: null,
              args: {},
              note: "Wait for the running generation to finish, then retry.",
            },
          },
        );
      }
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NO_RESULTS,
        `Node ${id} has no ${field} yet. Run the workflow first.`,
        {
          missing: { nodeData: [field] },
          suggestion: nodeNoResultsSuggestion(field),
        },
      );
    }
  }

  // 5. store assets ("images[imageId]") and actions ("alignWorkflow").
  for (const entry of requires.store ?? []) {
    const bracket = /^([A-Za-z0-9_]+)\[([A-Za-z0-9_]+)\]$/.exec(entry);
    if (bracket) {
      const [, field, param] = bracket;
      const key = callArgs[param];
      if (key === undefined || key === null || key === "") continue;
      if (!store[field]?.[key]) {
        throw createToolError(
          TOOL_ERROR_CODE.ASSET_MISSING,
          `Asset ${key} is not available in ${field}.`,
          {
            missing: { store: [entry] },
            suggestion: {
              tool: null,
              args: {},
              note: "Regenerate the missing asset (run_workflow), then retry.",
            },
          },
        );
      }
    } else if (typeof store[entry] !== "function") {
      throw createToolError(
        TOOL_ERROR_CODE.STORE_UNAVAILABLE,
        `Store action is not available: ${entry}`,
        {
          missing: { store: [entry] },
          suggestion: {
            tool: null,
            args: {},
            note: "Retry — this capability should be provided by the runtime.",
          },
        },
      );
    }
  }

  // 6. provider keys (future editor tools: AI repaint/generation).
  for (const name of requires.provider ?? []) {
    let configured = false;
    if (typeof context?.hasProviderKey === "function") {
      configured = Boolean(await context.hasProviderKey(name));
    } else if (context?.providerKeys) {
      configured = Boolean(context.providerKeys[name]);
    }
    if (!configured) {
      throw createToolError(
        TOOL_ERROR_CODE.PROVIDER_NOT_CONFIGURED,
        `No API provider key configured for ${name}.`,
        {
          missing: { provider: [name] },
          suggestion: {
            tool: null,
            args: {},
            note: "Ask the user to configure an API key (Settings → API Model), then retry.",
          },
        },
      );
    }
  }

  // 7. pixel selection (future editor tools: fill/repaint/transform).
  if (requires.selection) {
    const selection =
      typeof context?.getPixelSelection === "function"
        ? context.getPixelSelection()
        : null;
    const hasSelection =
      selection &&
      (selection.contours?.length > 0 || selection.bounds?.width > 0);
    if (!hasSelection) {
      throw createToolError(
        TOOL_ERROR_CODE.NO_SELECTION,
        "No pixel selection in the editor.",
        {
          missing: { selection: requires.selection },
          suggestion: {
            tool: null,
            args: {},
            note: "Create a pixel selection in the editor first (marquee drag), then retry.",
          },
        },
      );
    }
  }
}
