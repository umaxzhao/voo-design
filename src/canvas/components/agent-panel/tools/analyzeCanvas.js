/**
 * Tool: analyze_canvas — Get a structured summary of the current canvas state.
 *
 * Read-only — provides the model with workflow topology information.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";

const def = getWorkflowToolDefinition("analyze_canvas");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const nodes = store.nodes || [];
    const edges = store.edges || [];

    // Count by type.
    const typeCounts = {};
    for (const node of nodes) {
      typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    }

    // Find disconnected nodes (no incoming or outgoing edges).
    const connectedIds = new Set();
    for (const edge of edges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    const disconnected = nodes
      .filter((n) => !connectedIds.has(n.id))
      .map((n) => ({ id: n.id, type: n.type }));

    // Find nodes without required inputs.
    const targetIds = new Set(edges.map((e) => e.target));
    const rootNodes = nodes.filter((n) => !targetIds.has(n.id));

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      typeCounts,
      disconnectedNodes: disconnected,
      rootNodes: rootNodes.map((n) => ({ id: n.id, type: n.type })),
      workflowName: store.name || "Untitled",
    };
  },

  presentCall() {
    return { title: "Analyze canvas", icon: "search" };
  },

  presentResult(_args, result) {
    return {
      title: `${result.totalNodes} nodes, ${result.totalEdges} edges`,
      status: "completed",
    };
  },
});
