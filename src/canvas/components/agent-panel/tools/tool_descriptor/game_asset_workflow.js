import { MAX_GAME_ASSET_ELEMENTS } from "../gameAssetConstants.js";

export const GAME_ASSET_WORKFLOW_TOOL_DEFINITION = {
  build_game_asset_workflow: {
    name: "build_game_asset_workflow",
    description:
      "Build editable game asset branches from an existing concept image node. Each element receives its own visible Prompt, isolated image Generate node, and image-fed 3D generation node. The graph is created atomically and generation is not started; users can edit any branch before running it. Reusing an element key preserves its existing nodes and edits.",
    params: {
      type: "object",
      properties: {
        conceptNodeId: {
          type: "string",
          description: "Existing scene concept image node ID.",
        },
        elements: {
          type: "array",
          minItems: 1,
          maxItems: MAX_GAME_ASSET_ELEMENTS,
          description:
            "Distinct scene elements approved for separate 3D assets.",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description:
                  "Stable lowercase identifier used to reuse this branch on retry.",
              },
              name: { type: "string", description: "Visible asset name." },
              imagePrompt: {
                type: "string",
                description:
                  "Editable prompt for one isolated element image. State which element to keep, its shape/material, a clean background, and that the scene image is a reference.",
              },
              modelPrompt: {
                type: "string",
                description:
                  "Editable 3D prompt for geometry, materials, topology, and intended game use.",
              },
            },
            required: ["key", "name", "imagePrompt", "modelPrompt"],
            additionalProperties: false,
          },
        },
      },
      required: ["conceptNodeId", "elements"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: true,
      reversible: true,
      timeout: null,
    },
    requires: { canvas: ["node:conceptNodeId"] },
  },
};
