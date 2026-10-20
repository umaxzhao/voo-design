export const DESIGN_ASSET_MOUNT_TOOL_DEFINITION = {
  mount_image_in_design: {
    name: "mount_image_in_design",
    description:
      "Mount an image already generated elsewhere on the canvas into an editable Design node. Adds a visible image→Design wire and places the selected image result as a named layer at optional document coordinates. Future results from the same image node update that layer while preserving its position and edits. Does not generate media or spend credits.",
    params: {
      type: "object",
      properties: {
        sourceNodeId: {
          type: "string",
          description:
            "Existing image-producing node ID with a completed result.",
        },
        designNodeId: {
          type: "string",
          description: "Existing Design (imageAsset) node ID.",
        },
        placement: {
          type: "object",
          description:
            "Optional image layer bounds in Design document coordinates. Omit to cover the whole document.",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
            name: { type: "string" },
          },
          required: ["x", "y", "width", "height"],
          additionalProperties: false,
        },
      },
      required: ["sourceNodeId", "designNodeId"],
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
    requires: { canvas: ["node:sourceNodeId", "node:designNodeId"] },
  },
};
