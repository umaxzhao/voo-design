/**
 * Tool: instantiate_subgraph — Re-create a saved subgraph template on the
 * canvas, optionally rewiring its declared input/output ports to existing
 * nodes (plan P3-1).
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import {
  instantiateSubgraph,
  loadSubgraphTemplate,
} from "../../../engine/subgraph_templates.js";
import { commitWorkflowHistory } from "../../../undo-action-contracts.js";

const def = getWorkflowToolDefinition("instantiate_subgraph");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const template = loadSubgraphTemplate(args.name);
    if (!template) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `No saved subgraph template named "${args.name}".`,
        {
          missing: { templates: [args.name] },
          suggestion: { tool: "save_as_subgraph", args: { name: args.name } },
        },
      );
    }

    // Distinguish input (external -> template) from output (template -> external).
    const inputRewires = (args.inputRewire ?? []).map((entry) => ({
      port: entry.port,
      handle: entry.handle ?? null,
      nodeId: entry.nodeId,
      outHandle: entry.outHandle ?? null,
      direction: "in",
    }));
    const outputRewires = (args.outputRewire ?? []).map((entry) => ({
      port: entry.port,
      handle: entry.handle ?? null,
      nodeId: entry.nodeId,
      inHandle: entry.inHandle ?? null,
      direction: "out",
    }));

    const { nodes, edges } = instantiateSubgraph(
      template,
      args.position ?? { x: 0, y: 0 },
      { inputs: inputRewires, outputs: outputRewires },
    );
    if (nodes.length === 0) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "The template contains no nodes.",
      );
    }

    commitWorkflowHistory(store, "workflow.agent.subgraph.instantiate");
    store.set({
      nodes: [...(store.nodes ?? []), ...nodes],
      edges: [...(store.edges ?? []), ...edges],
    });

    return {
      name: template.name,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodeIds: nodes.map((node) => node.id),
      rewireCount: inputRewires.length + outputRewires.length,
    };
  },

  presentCall(args) {
    return {
      title: `Instantiate subgraph "${args.name ?? "?"}"`,
      icon: "copy",
    };
  },

  presentResult(_args, result) {
    if (!result) return { title: "instantiate_subgraph" };
    return {
      title: `Instantiated "${result.name}" (${result.nodeCount} nodes)`,
    };
  },
});
