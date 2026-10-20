/**
 * Tool: align_layout — Auto-arrange the canvas layout.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";

const def = getWorkflowToolDefinition("align_layout");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const nodeIds =
      Array.isArray(args?.nodeIds) && args.nodeIds.length > 0
        ? args.nodeIds
        : null;

    if (nodeIds && typeof store.alignNodes === "function") {
      store.alignNodes(nodeIds);
      return { aligned: true, nodeCount: nodeIds.length, scoped: true, nodeIds };
    }

    store.alignWorkflow();
    return { aligned: true, nodeCount: store.nodes?.length || 0, scoped: false };
  },

  presentCall() {
    return { title: "Auto-align layout", icon: "layout-grid" };
  },

  presentResult(_args, result) {
    return {
      title: result.aligned
        ? `Aligned ${result.nodeCount} nodes`
        : result.message,
      status: result.aligned ? "completed" : "failed",
    };
  },
});
