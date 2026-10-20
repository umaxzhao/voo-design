/**
 * Command definitions part 2 (pure schema, zone split).
 */
export const COMMAND_DEFINITIONS_PART2 = {
  add_pen_node: {
    id: "add_pen_node",
    kind: "action",
    summary: "Add a pen/vector node",
    description:
      "Add a pen (bezier path) node to the open editor from an SVG path string (M/L/C/Z) or an anchors array. Optional document position, stroke and fill.",
    params: {
      type: "object",
      properties: {
        svgD: {
          type: "string",
          description: "SVG path data (M/m, L/l, C/c, Z/z) in document units.",
        },
        anchors: {
          type: "array",
          description:
            "Explicit bezier anchors, each { x, y, in?, out? }; in/out are [dx, dy] handle offsets.",
          items: {
            type: "object",
            properties: {
              x: { type: "number", description: "Anchor x, document units." },
              y: { type: "number", description: "Anchor y, document units." },
              in: {
                type: "array",
                items: { type: "number" },
                minItems: 2,
                maxItems: 2,
              },
              out: {
                type: "array",
                items: { type: "number" },
                minItems: 2,
                maxItems: 2,
              },
            },
            required: ["x", "y"],
            additionalProperties: false,
          },
        },
        x: {
          type: "number",
          description:
            "Place the path so its bounding-box origin sits at this x.",
        },
        y: {
          type: "number",
          description:
            "Place the path so its bounding-box origin sits at this y.",
        },
        stroke: {
          type: "string",
          description: "Stroke colour (hex). Defaults to white.",
        },
        strokeWidth: {
          type: "number",
          description: "Stroke width in document units.",
        },
        fill: {
          type: "string",
          description: "Fill colour (hex) or transparent.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID", "CAPABILITY_MISSING"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.pen",
    approvalLevel: "canvas-mutation",
    requires: {},
    exposeAsTool: false, // model entry point is draw_vector
  },
  apply_copy_structure: {
    id: "apply_copy_structure",
    kind: "action",
    summary: "Apply structured copy as text nodes",
    description:
      "Land a structured copy hierarchy as editable text layer elements inside the open design editor (not canvas workflow nodes). Pass an array of text blocks, or { blocks: [...], gap? }. Each block is { text, fontSize?, fontFamily?, weight?, fill?, align?, letterSpacing?, lineHeight?, width?, boxWidth? }.",
    params: {
      type: "object",
      properties: {
        structure: {
          type: ["object", "array"],
          description:
            "The copy hierarchy: an array of text blocks, or { blocks: [...] }.",
          additionalProperties: true,
        },
        prompt: {
          type: "string",
          description: "Optional description of the layout, for records.",
        },
        nodeId: {
          type: "string",
          description:
            "Optional editor node to attach the copy to (uses selection otherwise).",
        },
        x: {
          type: "number",
          description: "Left edge for the stacked text, document units.",
        },
        y: {
          type: "number",
          description: "Top edge for the stacked text, document units.",
        },
        gap: {
          type: "number",
          description: "Vertical gap between rows, document units.",
        },
      },
      required: ["structure"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID", "CAPABILITY_MISSING"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.text",
    approvalLevel: "canvas-mutation",
    requires: { args: ["structure"] },
  },
  apply_design_patches: {
    id: "apply_design_patches",
    kind: "action",
    summary: "Apply design auto-fix patches to the open document",
    description:
      'Merge geometry patches into the open design editor\'s document: each entry is { targetId, patch }, where targetId is a layer id (or the document id / "document" for a canvas resize) and patch holds the fields to merge (x, y, width, height, fontSize). One history entry covers the whole batch.',
    params: {
      type: "object",
      properties: {
        patches: {
          type: "array",
          description:
            "Patches to apply, as returned by auto_fix_design: [{ targetId, patch, issueIds? }].",
          items: { type: "object", additionalProperties: true },
        },
        targetNodeId: {
          type: "string",
          description: "Optional artboard node id to target.",
        },
      },
      required: ["patches"],
      additionalProperties: false,
    },
    errors: [
      "ARGS_INVALID",
      "CAPABILITY_MISSING",
      "NODE_NOT_FOUND",
      "LAYER_LOCKED",
    ],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { args: ["patches"] },
    // The model's entry points are the design tools (iterate_design /
    // auto_fix_design), which reach this command through store.runEditorCommand.
    // Exposing the raw patch list would give the model a lower-level mutation
    // path beside the tool that computes the patches.
    exposeAsTool: false, // consumed by iterate_design / auto_fix_design
  },
  duplicate_selected: {
    id: "duplicate_selected",
    kind: "action",
    summary: "Duplicate selected layers",
    description:
      "Duplicate every selected layer and leave the copies selected, so they can be moved or edited as one unit. This is the editor's Duplicate / ⌘D / Ctrl+D action.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  delete_selected: {
    id: "delete_selected",
    kind: "action",
    summary: "Delete selected layers",
    description:
      "Delete the currently selected layers from the canvas (Delete/Backspace in select mode). Locked layers and layers protected by their group are left alone by the engine.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  delete_selection_pixels: {
    id: "delete_selection_pixels",
    kind: "action",
    summary: "Delete selected pixels",
    description:
      "Delete the pixels inside the active marquee/lasso selection from its image layer (Delete/Backspace while a pixel selection exists). The layer bitmap is rewritten; undo restores it.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  group_selection: {
    id: "group_selection",
    kind: "action",
    summary: "Group selected layers",
    description:
      "Wrap the selected layers' top-level units in a group/folder so they move and reorder together. This is the editor's Group / ⌘G / Ctrl+G action.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  ungroup_selection: {
    id: "ungroup_selection",
    kind: "action",
    summary: "Ungroup selection",
    description:
      "Dissolve the selected group/folder or boolean container into its member layers. This is the editor's Ungroup / ⇧⌘G / Ctrl+Shift+G action.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  create_clipping_mask: {
    id: "create_clipping_mask",
    kind: "action",
    summary: "Create clipping mask",
    description:
      "Make the selected layers a clipping mask clipped into the layer beneath them; consecutive selected layers share that base. This is the editor's Create Clipping Mask / ⌥⌘G / Ctrl+Alt+G action.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  release_clipping_mask: {
    id: "release_clipping_mask",
    kind: "action",
    summary: "Release clipping mask",
    description:
      "Release the selected layers from their clipping masks; with no selection, release every clipped layer. This is the editor's Release Clipping Mask / ⇧⌥⌘G / Ctrl+Shift+Alt+G action.",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: {},
  },
  bring_to_front: {
    id: "bring_to_front",
    kind: "action",
    summary: "Bring selection to front",
    description:
      "Bring the selected layers to the front of their stacking plane in one step (⌘] / Ctrl+]).",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.bringToFront",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  send_to_back: {
    id: "send_to_back",
    kind: "action",
    summary: "Send selection to back",
    description:
      "Send the selected layers to the back of their stacking plane in one step (⌘[ / Ctrl+[).",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.sendToBack",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
  select_all: {
    id: "select_all",
    kind: "action",
    summary: "Select all layers",
    description:
      "Select every visible, unlocked layer on the canvas (Select All / ⌘A / Ctrl+A). Selection-only — it changes the active selection but not the document and is not undoable.",
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
  stroke_selection: {
    id: "stroke_selection",
    kind: "action",
    summary: "Stroke selection outline",
    description:
      "Stroke the active pixel selection's outline onto its image layer with the current foreground colour at the editor's default 4 px width (right-click Stroke Selection).",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { selection: true },
  },
};
