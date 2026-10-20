/** Generated from command_table/definitions.js. Do not edit by hand.
 * Run node scripts/generate-editor-undo-metadata.mjs after changing commands.
 * Workflow history needs these fields synchronously; full Agent schemas stay
 * in the deferred editor chunk. Parity tests reject stale generated metadata.
 */
export const EDITOR_COMMAND_UNDO_METADATA = Object.freeze(
  [
    {
      id: "fill_selection",
      summary: "Content-aware fill selected pixels",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "refine_selection",
      summary: "Refine current pixel selection",
      historyLabel: "editor.history.entry.selection",
    },
    {
      id: "repaint_selection",
      summary: "AI repaint current pixel selection",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "layer_via_copy",
      summary: "Copy selection onto its own layer",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "select_object",
      summary: "AI object selection from a box",
      historyLabel: "editor.history.entry.objectSelection",
    },
    {
      id: "add_pen_node",
      summary: "Add a pen/vector node",
      historyLabel: "editor.history.entry.pen",
    },
    {
      id: "apply_copy_structure",
      summary: "Apply structured copy as text nodes",
      historyLabel: "editor.history.entry.text",
    },
    {
      id: "apply_design_patches",
      summary: "Apply design auto-fix patches to the open document",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "duplicate_selected",
      summary: "Duplicate selected layers",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "delete_selected",
      summary: "Delete selected layers",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "delete_selection_pixels",
      summary: "Delete selected pixels",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "group_selection",
      summary: "Group selected layers",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "ungroup_selection",
      summary: "Ungroup selection",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "create_clipping_mask",
      summary: "Create clipping mask",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "release_clipping_mask",
      summary: "Release clipping mask",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "bring_to_front",
      summary: "Bring selection to front",
      historyLabel: "editor.history.entry.bringToFront",
    },
    {
      id: "send_to_back",
      summary: "Send selection to back",
      historyLabel: "editor.history.entry.sendToBack",
    },
    {
      id: "stroke_selection",
      summary: "Stroke selection outline",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "draw_rect",
      summary: "Draw a rectangle shape",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "draw_ellipse",
      summary: "Draw an ellipse shape",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "draw_line",
      summary: "Draw a straight line segment",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "draw_arrow",
      summary: "Draw an arrow vector path",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "draw_polygon",
      summary: "Draw a closed polygon shape",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "draw_star",
      summary: "Draw a star vector shape",
      historyLabel: "editor.history.entry.action",
    },
    {
      id: "brush_stroke",
      summary: "Paint one brush stroke along a Bézier path",
      execution: "gesture",
      historyLabel: "editor.history.entry.brush",
    },
    {
      id: "clone_stroke",
      summary: "Clone stamp one stroke from a source point along a path",
      execution: "gesture",
      historyLabel: "editor.history.entry.clone",
    },
    {
      id: "set_document_size",
      summary: "Set document canvas size",
      historyLabel: "editor.history.entry.documentResize",
    },
    {
      id: "resize_document_edges",
      summary: "Resize document edges",
      historyLabel: "editor.history.entry.documentResize",
    },
  ].map((entry) => Object.freeze(entry)),
);
