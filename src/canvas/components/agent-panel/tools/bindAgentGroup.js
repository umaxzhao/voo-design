/**
 * Tool: bind_agent_group — bind an Agent Gen node's artifact output to a Group.
 *
 * This is the default wiring for a new content workflow: one Agent Gen node +
 * one Group, instead of a prompt/generate/video chain. The binding lives on the
 * agent node (`data.outputGroupId`), never as a graph edge, so it cannot leak
 * into topology, cost estimation, or input collection.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { getExistingIdempotentRecord } from "../idempotentRetry.js";

const def = getWorkflowToolDefinition("bind_agent_group");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    // Idempotent retry: reuse the recorded binding instead of re-validating a
    // graph that may have moved on.
    const existing = getExistingIdempotentRecord(context);
    if (
      existing?.agentNodeId &&
      existing?.groupId &&
      store.nodes?.some((node) => node.id === existing.agentNodeId) &&
      store.nodes?.some((node) => node.id === existing.groupId)
    ) {
      return {
        agentNodeId: existing.agentNodeId,
        groupId: existing.groupId,
        bound: true,
        reconciled: true,
      };
    }

    const nodes = store.nodes ?? [];
    const agent = nodes.find((node) => node.id === args.agentNodeId);
    if (!agent || agent.type !== NODE_TYPE.AGENT) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Agent Gen node not found: ${args.agentNodeId}`,
        {
          missing: { canvas: [`node:${args.agentNodeId}`] },
          suggestion: {
            tool: "create_node",
            args: { type: NODE_TYPE.AGENT, data: { brief: "…" } },
            note: "Create the Agent Gen node first, then bind it.",
          },
        },
      );
    }
    const group = nodes.find((node) => node.id === args.groupId);
    if (!group || group.type !== NODE_TYPE.GROUP) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Group node not found: ${args.groupId}`,
        {
          missing: { canvas: [`node:${args.groupId}`] },
          suggestion: {
            tool: "create_node",
            args: { type: NODE_TYPE.GROUP },
            note: "Create the Group that will own the artifacts, then bind it.",
          },
        },
      );
    }
    if (typeof store.bindAgentGroup !== "function") {
      throw createToolError(
        TOOL_ERROR_CODE.GENERATOR_UNAVAILABLE,
        "Agent Group binding is not available in this environment.",
        {
          missing: { store: ["bindAgentGroup"] },
          suggestion: {
            tool: null,
            args: {},
            note: "Report the environment limitation to the user.",
          },
        },
      );
    }

    const ok = store.bindAgentGroup(agent.id, group.id);
    return { agentNodeId: agent.id, groupId: group.id, bound: ok === true };
  },

  presentCall() {
    return { title: "Bind Agent Gen to Group", icon: "sparkles" };
  },

  presentResult() {
    return { title: "Agent Gen bound to its Group", status: "completed" };
  },
});
