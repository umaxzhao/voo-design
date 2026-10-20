/**
 * Tool: observe_canvas — Multi-modal canvas observation (P0-7).
 *
 * Reads structured canvas/editor objects and returns a visual screenshot thumbnail.
 * Supports "viewport", "selection", and "region" scopes with high-detail region capture.
 *
 * @module agent-panel/tools/observeCanvas
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { observeCanvas } from "../observer.js";
import { observeWorkflowImages } from "../workflow-image-observation.js";

export default {
  spec: {
    name: "observe_canvas",
    description:
      "Observe canvas objects and images. To identify characters or write prompts from a workflow reference image, pass its node ID in targetIds with scope='selection': reads the actual image asset without opening an editor. At most four image nodes per call. Editor selections and regions include local coordinate mapping ({ crop, scale }).",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["viewport", "selection", "region"],
          description:
            "Observation scope: 'viewport' (full visible canvas), 'selection' (currently selected objects), or 'region' (specific rectangular area).",
        },
        region: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "X coordinate of top-left corner",
            },
            y: {
              type: "number",
              description: "Y coordinate of top-left corner",
            },
            width: { type: "number", description: "Width of region" },
            height: { type: "number", description: "Height of region" },
            w: { type: "number", description: "Alias for width" },
            h: { type: "number", description: "Alias for height" },
          },
          description: "Target region bounding box when scope is 'region'.",
        },
        targetIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional explicit object or node IDs to observe.",
        },
        padding: {
          type: "number",
          description:
            "Optional padding in canvas units around the target bounding box (default: 16 for selection, 0 for region).",
        },
      },
      required: ["scope"],
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  async execute(args, context) {
    const outcome =
      (await observeWorkflowImages(args, context)) ??
      (await observeCanvas(args, context));
    if (context.recordObservedObjects && context.getStore) {
      const store = context.getStore();
      if (store?.nodes) {
        context.recordObservedObjects(store.nodes);
      }
    }
    return outcome;
  },

  presentCall(args) {
    const scope = args?.scope || "viewport";
    return {
      title: `Observe canvas (${scope})`,
      icon: "eye",
    };
  },

  presentResult(_args, result) {
    const count = result?.count ?? result?.objects?.length ?? 0;
    const detail =
      result?.scale && result.scale > 1 ? ` (${result.scale}x)` : "";
    return {
      title: `Observed ${count} object(s)${detail}`,
    };
  },
};
