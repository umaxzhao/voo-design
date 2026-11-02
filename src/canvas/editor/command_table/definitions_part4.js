/**
 * Command definitions part 4 (pure schema, zone split).
 */
export const COMMAND_DEFINITIONS_PART4 = {
  brush_stroke: {
    id: "brush_stroke",
    kind: "action",
    summary: "Paint one brush stroke along a Bézier path",
    description:
      "Paint one continuous brush stroke on the selected or specified image/paint layer. The model supplies a small number of cubic Bézier segments; the engine samples the path and applies the brush along it. This is a gesture command: it is not a single atomic parameter application and should be previewed as a path before committing.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description:
            "Layer to paint on. Omit to use the current brush target.",
        },
        brush: {
          type: "object",
          description:
            "Brush settings. Missing fields fall back to the current editor brush.",
          properties: {
            size: {
              type: "number",
              description: "Brush diameter in document pixels.",
            },
            hardness: { type: "number", description: "0..1 brush hardness." },
            color: { type: "string", description: "Paint colour." },
            opacity: { type: "number", description: "0..1 opacity." },
          },
          additionalProperties: false,
        },
        trace: {
          type: "object",
          description:
            "Derive the stroke path from existing document geometry instead of explicit Bézier segments.",
          properties: {
            kind: {
              type: "string",
              enum: ["selectionEdge", "nodePath"],
              description:
                "Follow the pixel selection edge or an existing path node.",
            },
            nodeId: {
              type: "string",
              description: "Path node to follow when kind=nodePath.",
            },
          },
          required: ["kind"],
          additionalProperties: false,
        },
        path: {
          type: "object",
          description:
            "Cubic Bézier path to paint (omit when trace is supplied).",
          properties: {
            start: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" } },
              required: ["x", "y"],
              additionalProperties: false,
            },
            segments: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  c1: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                    additionalProperties: false,
                  },
                  c2: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                    additionalProperties: false,
                  },
                  end: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                    additionalProperties: false,
                  },
                  pressure: {
                    type: "number",
                    description: "0..1 optional pressure.",
                  },
                },
                required: ["c1", "c2", "end"],
                additionalProperties: false,
              },
            },
          },
          required: ["start", "segments"],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
    errors: [
      "ARGS_INVALID",
      "NO_SELECTION",
      "CAPABILITY_MISSING",
      "LAYER_LOCKED",
      "NODE_NOT_FOUND",
    ],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.brush",
    approvalLevel: "canvas-mutation",
    requires: { args: ["path"] },
    exposeAsTool: true,
    // Gesture metadata: the agent proposes a path, the UI can preview it, and
    // execution happens through the pointer/paint stroke lifecycle.
    execution: "gesture",
    undoUnit: "gesture",
    preview: "path",
    confirmation: "auto",
  },
  clone_stroke: {
    id: "clone_stroke",
    kind: "action",
    summary: "Clone stamp one stroke from a source point along a path",
    description:
      "Clone stamp pixels from a source point onto the selected or specified image along a cubic Bézier path. This is a bitmap-preview gesture: the first call computes a draft result and shows it as an overlay without persisting an imageId or history entry; only a confirm:true call applies the precomputed draft as the new node bitmap.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description:
            "Image layer to clone onto. Omit to use the selected image.",
        },
        sourcePoint: {
          type: "object",
          description: "Source sample point in document coordinates.",
          properties: { x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y"],
          additionalProperties: false,
        },
        brush: {
          type: "object",
          description: "Clone stamp brush settings.",
          properties: {
            size: {
              type: "number",
              description: "Stamp diameter in document pixels.",
            },
            hardness: { type: "number", description: "0..1 brush hardness." },
            opacity: { type: "number", description: "0..1 opacity." },
          },
          additionalProperties: false,
        },
        path: {
          type: "object",
          description: "Cubic Bézier path to stamp along.",
          properties: {
            start: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" } },
              required: ["x", "y"],
              additionalProperties: false,
            },
            segments: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  c1: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                    additionalProperties: false,
                  },
                  c2: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                    additionalProperties: false,
                  },
                  end: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                    additionalProperties: false,
                  },
                },
                required: ["c1", "c2", "end"],
                additionalProperties: false,
              },
            },
          },
          required: ["start", "segments"],
          additionalProperties: false,
        },
      },
      required: ["sourcePoint", "path"],
      additionalProperties: false,
    },
    errors: [
      "ARGS_INVALID",
      "NODE_NOT_FOUND",
      "CAPABILITY_MISSING",
      "LAYER_LOCKED",
    ],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.clone",
    approvalLevel: "canvas-mutation",
    requires: { args: ["sourcePoint", "path"] },
    exposeAsTool: true,
    execution: "gesture",
    undoUnit: "gesture",
    preview: "bitmap",
    confirmation: "auto",
  },
  set_document_size: {
    id: "set_document_size",
    kind: "action",
    summary: "Set document canvas size",
    description:
      "Set the open design editor document to an exact pixel size, optionally scaling its contents by width or height.",
    params: {
      type: "object",
      properties: {
        width: { type: "number", description: "Canvas width in pixels." },
        height: { type: "number", description: "Canvas height in pixels." },
        scaleMode: {
          type: "string",
          enum: ["none", "width", "height"],
          description: "How existing layers scale with the new canvas.",
        },
      },
      required: ["width", "height"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.documentResize",
    approvalLevel: "canvas-mutation",
    requires: {},
  },
  resize_document_edges: {
    id: "resize_document_edges",
    kind: "action",
    summary: "Resize document edges",
    description:
      "Resize selected edges of the open design editor document by pixel deltas.",
    params: {
      type: "object",
      properties: {
        edges: {
          type: "object",
          properties: {
            left: { type: "boolean" },
            right: { type: "boolean" },
            top: { type: "boolean" },
            bottom: { type: "boolean" },
          },
          additionalProperties: false,
        },
        deltaX: { type: "number", description: "Horizontal size delta." },
        deltaY: { type: "number", description: "Vertical size delta." },
        fromCentre: { type: "boolean", description: "Resize from the centre." },
      },
      required: ["edges", "deltaX", "deltaY"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.documentResize",
    approvalLevel: "canvas-mutation",
    requires: {},
  },
  select_all_pixels: {
    id: "select_all_pixels",
    kind: "action",
    summary: "Select all pixels on the active image",
    description:
      "Select every pixel on the active editable image layer in the open design editor.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: ["CAPABILITY_MISSING"],
    mutates: false,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: {},
  },
  select_within: {
    id: "select_within",
    kind: "action",
    summary: "Select layers within a bounding box",
    description:
      "Select layers/nodes located within the specified document-space rectangle.",
    params: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate in document pixels." },
        y: { type: "number", description: "Y coordinate in document pixels." },
        width: { type: "number", description: "Width in document pixels." },
        height: { type: "number", description: "Height in document pixels." },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: false,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: {},
  },
};
