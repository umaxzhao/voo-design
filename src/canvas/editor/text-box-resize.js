import { OPPOSITE_HANDLE } from "./box_transform_math.js";
import { resizeWithAnchor } from "./scene_geometry_anchors.js";

/** Text boxes reflow at their font size; their height follows measured lines. */
export function resizeTextBox(api, node, gesture, rect, fromCentre) {
  const original = { ...node, ...gesture.rect };
  // Preview-only document writes intentionally skip layout. Text resizing
  // must measure before updating its hit region, handles and history entry.
  api.updateNode(node.id, { boxWidth: Math.max(1, rect.width) }, { commit: false });
  const measured = api.getNode(node.id);
  const pinned = fromCentre ? "center" : OPPOSITE_HANDLE[gesture.handle];
  const position = resizeWithAnchor(original, {
    width: measured.width,
    height: measured.height,
  }, pinned);
  // Pin against the measured height, rather than the pointer's provisional
  // height. This also preserves the opposite corner after rotation or shear.
  api.updateNode(node.id, { x: position.x, y: position.y }, { commit: false, preview: true });
}
