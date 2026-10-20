/**
 * Tool: remember_project_decision — Propose recording a project memory.
 *
 * Records confirmed decisions, user preferences, and project constraints
 * that persist across conversation rounds and project sessions.
 *
 * REQUIRES_APPROVAL: Must always be approved by the user before mutating
 * project memory; never executes silently.
 *
 * @module agent-panel/tools/rememberProjectDecision
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";

export default {
  spec: {
    name: "remember_project_decision",
    description:
      "Propose recording a project memory (confirmed decision, user preference, or project constraint) for this project. Requires explicit user approval before changes are saved.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "The specific decision, preference, or constraint to remember.",
        },
        kind: {
          type: "string",
          enum: ["decision", "preference", "constraint"],
          description:
            "Category of memory: 'decision' (confirmed choice), 'preference' (user style/workflow preference), 'constraint' (hard boundary or limitation). Defaults to 'decision'.",
        },
        reason: {
          type: "string",
          description:
            "Rationale for recording this memory item.",
        },
        confidence: {
          type: "number",
          description:
            "Confidence level between 0 and 1 (default 1.0).",
        },
        source: {
          type: "object",
          description: "Optional source reference.",
          properties: {
            runId: { type: "string" },
            stepId: { type: "string" },
            messageExcerpt: { type: "string" },
          },
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.REQUIRES_APPROVAL,
  alwaysRequiresApproval: true,

  capabilities: {
    mutates: true,
    externalData: false,
    estimatedCost: 0,
    idempotent: false,
    reversible: true,
    timeout: null,
  },

  async execute(args, context) {
    const store = context?.getStore?.() || context?.store;
    if (!store || typeof store.addProjectMemoryItem !== "function") {
      return {
        ok: false,
        error: "Store is not available to record project memory.",
      };
    }

    const { text, kind = "decision", confidence = 1.0, source } = args || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return {
        ok: false,
        error: "Memory text cannot be empty.",
      };
    }

    const updated = store.addProjectMemoryItem({
      text: text.trim(),
      kind,
      confidence,
      source,
    });

    return {
      ok: true,
      reason: args?.reason || null,
      memory: updated,
      message: "Project memory recorded successfully.",
    };
  },

  presentCall(args) {
    const kind = args?.kind || "decision";
    const snippet = args?.text ? `"${args.text.slice(0, 40)}"` : "";
    return {
      title: `Remember ${kind}: ${snippet}`,
      icon: "bookmark",
    };
  },

  presentResult(args, result) {
    if (!result?.ok) {
      return {
        title: "Failed to record project memory",
        status: "failed",
      };
    }
    return {
      title: "Project memory recorded",
      status: "completed",
    };
  },
};
