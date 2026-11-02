/**
 * Command definitions part 1 (pure schema, zone split).
 */
export const COMMAND_DEFINITIONS_PART1 = {
  fill_selection: {
    id: "fill_selection",
    kind: "action",
    summary: "Content-aware fill selected pixels",
    description:
      "Content-aware smart fill of the active pixel selection in the open image editor. Seamlessly removes watermarks, blemishes, or unwanted objects by synthesizing surrounding background texture locally (no API key or prompt needed). Requires an active pixel selection (select_region or select_object first). For generating new objects with a text prompt, use repaint_selection instead.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [
      "NO_SELECTION",
      "NO_EDITABLE_IMAGE",
      "LAYER_LOCKED",
      "BITMAP_MISSING",
    ],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  refine_selection: {
    id: "refine_selection",
    kind: "action",
    summary: "Refine current pixel selection",
    description:
      "Refine the current pixel selection in the open image editor: feather, expand, contract or smooth by an amount in document pixels. Requires an existing selection (select_region first).",
    params: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["feather", "expand", "contract", "smooth"],
          description: "Which refinement to apply.",
        },
        amount: {
          type: "number",
          description: "Radius / distance in document pixels (default 4).",
        },
      },
      required: ["operation"],
      additionalProperties: false,
    },
    errors: ["NO_SELECTION", "ARGS_INVALID", "BITMAP_MISSING"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.selection",
    approvalLevel: "canvas-mutation",
    requires: { args: ["operation"], selection: true },
  },
  get_editor_context: {
    id: "get_editor_context",
    kind: "query",
    summary: "Read open editor context",
    description:
      "Read the open design editor's current context: the layer kinds present on the page, the selected layer objects (with kind and pen flag), whether a pixel selection exists, and the list of editor actions currently available. Use this before an editor command to learn what is selected and what the agent may do next.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: false,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: {},
  },
  repaint_selection: {
    id: "repaint_selection",
    kind: "action",
    summary: "AI repaint current pixel selection",
    description:
      "AI repaint of the current pixel selection in the open image editor: the region is re-rendered from a text prompt through the configured image API, composited back clipped to the selection. Requires an existing selection and a reachable repaint provider. (The chat-page route is the human editor's: it is injected by the editor UI, not reachable from a command.)",
    params: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "What to paint inside the selection.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    errors: [
      "NO_SELECTION",
      "NO_EDITABLE_IMAGE",
      "LAYER_LOCKED",
      "ARGS_INVALID",
      "BITMAP_MISSING",
      "PROVIDER_NOT_CONFIGURED",
    ],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { args: ["prompt"], selection: true },
  },
  select_region: {
    id: "select_region",
    kind: "action",
    summary: "Create a rectangular pixel selection",
    description:
      "Create a pixel selection inside the open image editor. Pass the image node id and a document-space rectangle; the selection becomes the target for refine_selection / fill_selection / repaint_selection.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description:
            "Image node to select on (omit to use the selected one).",
        },
        x: {
          type: "number",
          description: "Left edge of the region, document pixels.",
        },
        y: {
          type: "number",
          description: "Top edge of the region, document pixels.",
        },
        width: { type: "number", description: "Region width, > 0." },
        height: { type: "number", description: "Region height, > 0." },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID", "NODE_NOT_FOUND"],
    mutates: true,
    undoable: false,
    historyLabel: null,
    approvalLevel: "canvas-mutation",
    requires: { args: ["x", "y", "width", "height"] },
  },
  layer_via_copy: {
    id: "layer_via_copy",
    kind: "action",
    summary: "Copy selection onto its own layer",
    description:
      "Copy the current pixel selection onto a new image layer of its own, leaving the original layer untouched (the editor's ⌘J, 'Layer via Copy'). Requires an existing selection. The selection survives the call and still points at the source layer.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: ["NO_SELECTION", "CAPABILITY_MISSING", "BITMAP_MISSING"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  select_object: {
    id: "select_object",
    kind: "action",
    summary: "AI object selection from a box",
    description:
      "Select one object precisely: pass a rough document-space box around it and the local matting model traces the object's actual edges into a pixel selection. Requires a downloaded matting model; the receipt says when it is missing.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description:
            "Image layer to select on (omit to use the selected one).",
        },
        x: { type: "number", description: "Box left edge, document pixels." },
        y: { type: "number", description: "Box top edge, document pixels." },
        width: { type: "number", description: "Box width, > 0." },
        height: { type: "number", description: "Box height, > 0." },
        mode: {
          type: "string",
          enum: ["replace", "add", "subtract", "intersect"],
          description:
            "How to combine with the existing selection (default replace).",
        },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    errors: [
      "ARGS_INVALID",
      "NODE_NOT_FOUND",
      "CAPABILITY_MISSING",
      "MODEL_NOT_READY",
      "BITMAP_MISSING",
      "NOTHING_FOUND",
    ],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.objectSelection",
    approvalLevel: "canvas-mutation",
    requires: { args: ["x", "y", "width", "height"] },
  },
  export_canvas_png: {
    id: "export_canvas_png",
    kind: "query",
    summary: "Export the whole canvas as a thumbnail",
    description:
      "Export the current editor page as a downscaled PNG data URL plus its page shape, for the agent to glance at what is on the canvas.",
    params: {
      type: "object",
      properties: {
        maxEdge: {
          type: "number",
          description: "Longest edge cap in pixels (default 768).",
        },
      },
      required: [],
      additionalProperties: false,
    },
    errors: ["BITMAP_MISSING"],
    mutates: false,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: {},
    exposeAsTool: false, // consumed by look_at_canvas
  },
  export_node_png: {
    id: "export_node_png",
    kind: "query",
    summary: "Export one layer's pixels for vision",
    description:
      "Export a single layer's pixels as a downscaled PNG data URL plus its document rectangle. Internal read for vision/localisation; never exposed as a model-visible tool.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Layer to export (omit to use the selected one).",
        },
        maxEdge: {
          type: "number",
          description: "Longest edge cap in pixels (default 1024).",
        },
      },
      required: [],
      additionalProperties: false,
    },
    errors: ["BITMAP_MISSING"],
    mutates: false,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: {},
    exposeAsTool: false, // consumed by locate_object
  },
  get_selection: {
    id: "get_selection",
    kind: "query",
    summary: "Read the current selection",
    description:
      "Return the selected layer objects (with id/name/type) plus whether a pixel selection exists. Use before editing a specific layer so you target the right object.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: false,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: {},
    exposeAsTool: false, // model entry point is inspect_selection
  },
};
