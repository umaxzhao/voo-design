/**
 * Tool: tool_search — discover deferred tools on demand.
 *
 * Directly adapted from Codex's tool_search: core tools are always sent to the
 * model; specialized tools are registered as deferred and discovered by
 * keyword search. The agent loop activates any tool returned here so it can be
 * called in the next step.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";

export default {
  spec: {
    name: "tool_search",
    description:
      "Search for additional tools beyond your core set. Specialized tools are registered as deferred and must be discovered by keyword before they can be used. Returns matching tool names and descriptions.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keyword describing the capability you need (e.g. 'layout', 'align', 'analyze').",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default 8).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  /** Pure registry lookup — safe to retry. */
  capabilities: {
    mutates: false,
    externalData: false,
    estimatedCost: 0,
    idempotent: true,
    reversible: null,
    timeout: null,
  },

  /** Searching requires a query and a registry to search. */
  requires: {
    args: ["query"],
    context: ["getRegistry"],
  },

  async execute(args, context) {
    const registry = context.getRegistry?.();
    if (!registry) {
      return { error: "Tool registry not available." };
    }
    const results = registry.searchDeferredTools(args.query, args.limit || 8);
    return { query: args.query, count: results.length, tools: results };
  },

  presentCall(args) {
    return { title: `Search tools: "${args.query}"`, icon: "search" };
  },

  presentResult(_args, result) {
    return {
      title: `${result.count} tool(s) found`,
      status: "completed",
    };
  },
};
