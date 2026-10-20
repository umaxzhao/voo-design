/**
 * Which full-screen editor a node type opens.
 *
 * The Design editor is the only full-screen editor left: the Clip, 3D and
 * Storyboard editors were removed, and a video node now previews in place.
 * The renderer (`lazy_image_editor.jsx`) and the agent panel's mode lock both
 * read this module so the answer exists once.
 */

import { NODE_TYPE } from "./node_enums.js";
import { isEditablePreviewType } from "./preview-editor-types.js";

export const EDITOR_KIND = {
  /** Design editor: pictures and streamed layouts as editable layers. */
  DESIGN: "design",
};

/** Node types that do not open the Design editor. */
const NO_EDITOR_NODE_TYPES = new Set([
  NODE_TYPE.COMBINE_VIDEO,
  NODE_TYPE.VIDEO,
  NODE_TYPE.API_VIDEO,
]);

/**
 * Resolves the editor a node type opens, or null when it opens none.
 * Everything else — image editor nodes, group pages, an unknown type — opens
 * the Design editor. Total on purpose: the editor overlay keys off a node id,
 * and that node can be gone (deleted while its editor is open), so a missing
 * type must still pick a branch instead of throwing.
 */
export function resolveEditorKind(nodeType, nodeOrMediaType) {
  if (NO_EDITOR_NODE_TYPES.has(nodeType)) return null;
  if (nodeType === NODE_TYPE.PREVIEW) {
    const mediaType =
      typeof nodeOrMediaType === "string"
        ? nodeOrMediaType
        : nodeOrMediaType?.data?.mediaType;
    if (!isEditablePreviewType(mediaType, nodeOrMediaType?.data)) return null;
  }
  return EDITOR_KIND.DESIGN;
}
