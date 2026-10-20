import { GENERATION_ROUTE_PARAMETERS } from "./constants.js";

export const IMAGE_LAYER_EDIT_TOOL_DEFINITION = {
  edit_image_layer: {
    name: "edit_image_layer",
    description:
      "Edit the pixels of one existing image layer in the open Design Editor. Sends only that layer (including its transparency) to the configured image edit route, then replaces its bitmap in place with undo. Preserves layer ID, geometry, editable mask, order and other layers. Use for whole-layer image edits; use repaint_selection for a pixel region. Never substitute workflow generation nodes for this edit. Honor explicit website/provider choices. A transparent input requests transparent PNG where supported; an opaque response preserves the original alpha and the receipt reports alphaMode=source.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Captured Design workflow node ID.",
        },
        layerId: {
          type: "string",
          description: "Captured image layer ID within the Design document.",
        },
        prompt: {
          type: "string",
          description: "The requested change to this image layer.",
        },
        providerId: {
          type: "string",
          description:
            "Explicit image provider choice; omit to retain the configured route.",
        },
        modelId: {
          type: "string",
          description:
            "Explicit model with its providerId; omit to retain the configured route.",
        },
        ...GENERATION_ROUTE_PARAMETERS,
        executionMode: {
          ...GENERATION_ROUTE_PARAMETERS.executionMode,
          description:
            "Use chat only for an explicitly requested connected website; api uses the configured image edit provider. Explicit api takes precedence over platform. Omit both executionMode and platform to use the configured API route; supplying platform alone selects its website. Never switch a website request to API on failure.",
        },
        platform: {
          ...GENERATION_ROUTE_PARAMETERS.platform,
          description:
            "Website target for chat editing, ignored when executionMode is api. Supplying platform alone selects that website. In chat mode, an omitted platform uses ChatGPT. Omit both executionMode and platform to retain the configured API image edit route. A failed website request never falls back to API.",
        },
      },
      required: ["nodeId", "layerId", "prompt"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: true,
      estimatedCost: 1,
      idempotent: false,
      reversible: true,
      timeout: null,
    },
    requires: { canvas: ["node:nodeId"] },
  },
};
