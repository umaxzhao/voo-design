import { EDITOR_COMMAND_UNDO_METADATA } from "./command_table/undo-metadata.js";

// Each manual action declares the history-panel label (an `editor.history.entry.*`
// i18n key) its commits fall back to; null means the entry keeps the generic
// fallback (pass-through boundaries that never represent a user action).
const MANUAL_ACTIONS = Object.freeze([
  [
    "editor.modifier.change",
    "Change a Design Editor array modifier or its keyframes",
    "ATOMIC",
    [
      "src/canvas/editor/doc-ops-linear-array.js",
      "src/canvas/editor/doc-ops-grid-array.js",
      "src/canvas/editor/doc-ops-circular-array.js",
    ],
    "editor.history.entry.layer",
  ],
  [
    "editor.document.set",
    "Replace the Design Editor document",
    "ATOMIC",
    [
      "src/canvas/editor/editor_engine.js",
      "src/canvas/editor/editor_engine_document.js",
      "src/canvas/editor/editor_engine_node_ops.js",
      "src/canvas/editor/editor-playback.js",
    ],
    null,
  ],
  [
    "editor.document.commit",
    "Commit the current Design Editor document",
    "GESTURE",
    "src/canvas/editor/editor_history_api.js",
    null,
  ],
  [
    "editor.group.change",
    "Change one Design Editor layer group",
    "ATOMIC",
    "src/canvas/editor/editor_engine_groups.js",
    "editor.history.entry.group",
  ],
  [
    "editor.clipping.change",
    "Change one Design Editor clipping relationship",
    "ATOMIC",
    "src/canvas/editor/editor_engine_groups.js",
    "editor.history.entry.clipping",
  ],
  [
    "editor.layer.delete",
    "Delete Design Editor layers",
    "ATOMIC",
    "src/canvas/editor/editor_engine_node_ops.js",
    "editor.history.entry.delete",
  ],
  [
    "editor.layer.add",
    "Add one Design Editor layer",
    "ATOMIC",
    "src/canvas/editor/editor_engine_layers.js",
    "editor.history.entry.addLayer",
  ],
  [
    "editor.frequencySeparation",
    "Create frequency-separated image layers",
    "ATOMIC",
    "src/canvas/editor/editor_engine_layers.js",
    "editor.history.entry.frequencySeparation",
  ],
  [
    "editor.mask.attach",
    "Attach a mask to one Design Editor layer",
    "ATOMIC",
    "src/canvas/editor/editor_engine_layers.js",
    "editor.history.entry.mask",
  ],
  [
    "editor.layer.settings",
    "Change one Design Editor layer setting",
    "ATOMIC",
    [
      "src/canvas/editor/editor_engine_layers.js",
      "src/canvas/editor/editor_engine_node_ops.js",
    ],
    "editor.history.entry.layer",
  ],
  [
    "editor.layer.order",
    "Change Design Editor layer order",
    "ATOMIC",
    [
      "src/canvas/editor/editor_engine_groups.js",
      "src/canvas/editor/editor_engine_node_ops.js",
    ],
    "editor.history.entry.layerOrder",
  ],
  [
    "editor.layer.convertToPath",
    "Convert shape layers to editable pen paths",
    "ATOMIC",
    "src/canvas/editor/editor_engine_node_ops.js",
    "editor.history.entry.convertToPath",
  ],
  [
    "editor.layer.move",
    "Move one Design Editor layer or group",
    "GESTURE",
    "src/canvas/editor/editor_engine_node_ops.js",
    "editor.history.entry.transform",
  ],
  [
    "editor.document.resize",
    "Resize the Design Editor document",
    "GESTURE",
    "src/canvas/editor/editor_engine_document.js",
    "editor.history.entry.resize",
  ],
  [
    "editor.canvas.changeType",
    "Switch one Design Editor frame between Design, Motion and 3D",
    "ATOMIC",
    "src/canvas/editor/doc_ops_canvas.js",
    "editor.history.entry.canvasType",
  ],
  [
    "editor.boolean.combine",
    "Change a Design Editor boolean shape",
    "ATOMIC",
    "src/canvas/editor/editor_engine_groups.js",
    "editor.history.entry.boolean",
  ],
  [
    "editor.layout.selection",
    "Lay out the Design Editor selection",
    "ATOMIC",
    "src/canvas/editor/editor_engine_groups.js",
    "editor.history.entry.align",
  ],
  [
    "editor.pointer.transform",
    "Transform the Design Editor selection",
    "GESTURE",
    "src/canvas/editor/editor_pointer_finish.js",
    "editor.history.entry.transform",
  ],
  [
    "editor.pointer.selection",
    "Commit a Design Editor pixel selection",
    "GESTURE",
    [
      "src/canvas/editor/editor_pointer_finish.js",
      "src/canvas/editor/editor_pointer_marquee.js",
    ],
    "editor.history.entry.selection",
  ],
  [
    "editor.pointer.draw",
    "Draw one Design Editor shape",
    "GESTURE",
    [
      "src/canvas/editor/editor_pointer_finish.js",
      "src/canvas/editor/editor_pointer_selection.js",
      "src/canvas/editor/editor_pointer_shapes.js",
    ],
    "editor.history.entry.shape",
  ],
  [
    "editor.annotation.change",
    "Change one Design Editor annotation",
    "ATOMIC",
    "src/canvas/editor/editor_annotations.js",
    "editor.history.entry.annotation",
  ],
  [
    "editor.bitmap.replace",
    "Replace one Design Editor bitmap",
    "ATOMIC",
    "src/canvas/editor/editor_bitmap_write.js",
    "editor.history.entry.replaceImage",
  ],
  [
    "editor.bitmap.outpaint",
    "Outpaint one Design Editor bitmap",
    "ATOMIC",
    "src/canvas/editor/editor_bitmap_write.js",
    "editor.history.entry.outpaint",
  ],
  [
    "editor.paint.bucket",
    "Fill once with the Design Editor paint bucket",
    "ATOMIC",
    "src/canvas/editor/editor_selection_effects.js",
    "editor.history.entry.fill",
  ],
  [
    "editor.selection.movePixels",
    "Move one Design Editor pixel selection",
    "GESTURE",
    "src/canvas/editor/editor_selection_api.js",
    "editor.history.entry.moveSelection",
  ],
  [
    "editor.selection.magneticLasso",
    "Complete one Magnetic Lasso selection",
    "GESTURE",
    "src/canvas/editor/editor_magnetic_lasso.js",
    "editor.history.entry.magneticLasso",
  ],
  [
    "editor.clipboard.change",
    "Cut, paste, or duplicate Design Editor layers",
    "ATOMIC",
    "src/canvas/editor/editor_clipboard.js",
    "editor.history.entry.clipboard",
  ],
  [
    "editor.crop.change",
    "Commit or clear one Design Editor crop",
    "GESTURE",
    [
      "src/canvas/editor/editor_crop.js",
      "src/canvas/editor/image_layer_crop.js",
    ],
    "editor.history.entry.crop",
  ],
  [
    "editor.drawing.change",
    "Commit one Design Editor drawing change",
    "GESTURE",
    "src/canvas/editor/editor_drawing_api.js",
    "editor.history.entry.brush",
  ],
  [
    "editor.mask.change",
    "Commit one Design Editor mask change",
    "GESTURE",
    "src/canvas/editor/editor_mask_lifecycle.js",
    "editor.history.entry.mask",
  ],
  [
    "editor.paint.change",
    "Commit one Design Editor paint change",
    "GESTURE",
    [
      "src/canvas/editor/editor_paint_layer.js",
      "src/canvas/editor/editor_paint_persist.js",
    ],
    "editor.history.entry.brush",
  ],
  [
    "editor.pen.change",
    "Commit one Design Editor pen change",
    "GESTURE",
    [
      "src/canvas/editor/editor_pen_draft.js",
      "src/canvas/editor/editor_pen_edit.js",
      "src/canvas/editor/editor_pen_subtools.js",
    ],
    "editor.history.entry.pen",
  ],
  [
    "editor.selection.effect",
    "Apply one Design Editor selection effect",
    "ATOMIC",
    "src/canvas/editor/editor_selection_effects.js",
    "editor.history.entry.modifySelection",
  ],
  [
    "editor.transform.change",
    "Apply one Design Editor raster transform",
    "ATOMIC",
    "src/canvas/editor/editor_transform_api.js",
    "editor.history.entry.transform",
  ],
  [
    "editor.layer.split",
    "Split one Design Editor layer",
    "ATOMIC",
    "src/canvas/editor/layer_split.js",
    "editor.history.entry.splitLayers",
  ],
]);

export function editorCommandActionId(commandId) {
  return `editor.command.${commandId}`;
}

// `source` may list several files: a split module keeps one action whose
// boundary calls live in sibling files. `source` stays the first file for
// consumers that expect one path; the editor scanner checks every `sources`
// entry has a boundary use and that no other file uses the action.
function editorAction(
  actionId,
  userAction,
  boundary,
  source,
  historyLabel = null,
) {
  const sources = Object.freeze(Array.isArray(source) ? [...source] : [source]);
  return Object.freeze({
    actionId,
    domain: "editor",
    userAction,
    boundary,
    expectedEntries: 1,
    noOpEntries: 0,
    pendingEntries: null,
    progressEntries: null,
    failureEntries: 0,
    requiresHistoryWriter: true,
    source: sources[0],
    sources,
    historyLabel,
  });
}

/**
 * Builds Editor declarations for the shared registry. Command contracts reuse
 * a generated projection of the command table as their only metadata owner;
 * importing full schemas here pulls deferred Agent data into Workflow startup.
 * Manual entries cover direct
 * pointer and local-editor actions that do not pass through that table.
 */
export function createEditorUndoActionContracts(boundaries) {
  const entries = MANUAL_ACTIONS.map(
    ([actionId, userAction, boundary, source, historyLabel]) => [
      actionId,
      editorAction(
        actionId,
        userAction,
        boundaries[boundary],
        source,
        historyLabel,
      ),
    ],
  );
  for (const definition of EDITOR_COMMAND_UNDO_METADATA) {
    const actionId = editorCommandActionId(definition.id);
    entries.push([
      actionId,
      editorAction(
        actionId,
        definition.summary,
        definition.execution === "gesture"
          ? boundaries.GESTURE
          : boundaries.ATOMIC,
        "src/canvas/editor/command_table/executor.js",
        definition.historyLabel,
      ),
    ]);
  }
  return Object.fromEntries(entries);
}
