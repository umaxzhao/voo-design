/**
 * Tool: save_as_subgraph — Save the selected node subgraph as a reusable
 * template (plan P3-1).
 *
 * Extracts the induced subgraph over the currently selected nodes (internal
 * edges kept, boundary edges declared as input/output ports), saves it to the
 * local template store under a name, and returns the template with its port
 * list so the model can instantiate it later via instantiate_subgraph.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import {
  extractSubgraph,
  saveSubgraphTemplate,
  serialiseSubgraphTemplate,
} from "../../../engine/subgraph_templates.js";

const def = getWorkflowToolDefinition("save_as_subgraph");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const name = args.name.trim();
    if (!name) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "Template name is empty.",
        {
          missing: { args: ["name"] },
          suggestion: {
            tool: "save_as_subgraph",
            args: { name: "my-pipeline" },
          },
        },
      );
    }

    const selectedIds = new Set(
      (store.nodes ?? [])
        .filter((node) => node.selected === true)
        .map((node) => node.id),
    );
    if (selectedIds.size === 0) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "No nodes are selected on the canvas.",
        {
          missing: { canvas: ["selected nodes"] },
          suggestion: {
            tool: "edit_node",
            args: { nodeId: "", patch: { selected: true } },
            note: "Select the nodes to template (click them, or patch selected:true), then retry.",
          },
        },
      );
    }

    const subgraph = extractSubgraph(
      store.nodes ?? [],
      store.edges ?? [],
      selectedIds,
    );
    if (subgraph.nodes.length === 0) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        "The selection resolved to no nodes.",
      );
    }

    const template = serialiseSubgraphTemplate(subgraph, name);
    const saved = saveSubgraphTemplate(template);
    if (!saved) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "Could not persist the template (storage full or unavailable).",
      );
    }

    return {
      name,
      nodeCount: template.nodes.length,
      edgeCount: template.edges.length,
      inputs: template.inputs.map((port) => ({
        node: port.node,
        handle: port.handle,
      })),
      outputs: template.outputs.map((port) => ({
        node: port.node,
        handle: port.handle,
      })),
      saved: true,
      note: "Instantiate with instantiate_subgraph, passing inputRewire/outputRewire for the ports you want connected.",
    };
  },

  presentCall(args) {
    return { title: `Save subgraph as "${args.name ?? "?"}"`, icon: "save" };
  },

  presentResult(_args, result) {
    if (!result) return { title: "save_as_subgraph" };
    return { title: `Saved "${result.name}" (${result.nodeCount} nodes)` };
  },
});
