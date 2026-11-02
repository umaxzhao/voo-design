/**
 * Error construction shared by command definitions, implementations and the
 * executor. Kept in a small module so every command_table part can import it
 * without depending on the full definitions object.
 */

export function editorCommandError(
  code,
  message,
  missing = {},
  suggestion = {},
) {
  return Object.assign(new Error(message), { code, missing, suggestion });
}

export function noSelection() {
  return editorCommandError(
    "NO_SELECTION",
    "The editor has no pixel selection — draw a marquee or pass a region first.",
    { selection: ["pixel"] },
    {
      tool: "select_region",
      args: {},
      note: "Call select_region with the nodeId and a document-space rectangle, then retry.",
    },
  );
}

export function bitmapMissing(message, note) {
  return editorCommandError(
    "BITMAP_MISSING",
    message,
    { bitmap: ["image"] },
    {
      tool: "list_nodes",
      args: {},
      note: note ?? "The target layer may be locked or its image not loaded.",
    },
  );
}

/**
 * The pixel selection's layer is gone, or is not a layer that carries pixels.
 *
 * Distinct from NO_SELECTION (there is a selection, it just points nowhere
 * useful) and from BITMAP_MISSING (the layer exists and is editable, its
 * bitmap is what is missing). A stale selection used to surface as
 * BITMAP_MISSING, which sent the model back to retry the same call.
 */
export function noEditableImage(nodeId) {
  return editorCommandError(
    "NO_EDITABLE_IMAGE",
    nodeId
      ? `The pixel selection targets layer "${nodeId}", which is not an image layer of the open document.`
      : "The pixel selection names no target layer, so there are no pixels to edit.",
    { selection: ["pixel"], nodes: [nodeId ?? "(none)"] },
    {
      tool: "get_editor_context",
      args: {},
      note: "Re-select a region on an image layer, then retry.",
    },
  );
}

/**
 * The target layer is locked (or its pixels are), so no bitmap edit can land.
 *
 * Locking is a user decision, not a transient failure: the model must hear
 * "locked" instead of BITMAP_MISSING, or it retries the same call and burns
 * the turn. There is no editor command that unlocks a layer, so the suggestion
 * asks the user rather than naming a tool that cannot help.
 */
export function layerLocked(layerName, layerId) {
  const target = layerId ? `"${layerName}" (${layerId})` : `"${layerName}"`;
  return editorCommandError(
    "LAYER_LOCKED",
    `Layer ${target} is locked, so its pixels cannot be changed.`,
    { layer: ["unlocked"] },
    {
      tool: null,
      args: {},
      note: "Ask the user to unlock the layer (or its image pixels) in the layers panel, then retry.",
    },
  );
}
