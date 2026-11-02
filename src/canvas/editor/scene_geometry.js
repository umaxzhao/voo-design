/**
 * Pure geometry for the image editor.
 *
 * Facade module re-exporting transform, bounding box, handle and resize APIs.
 */

export {
  fromNodeLocal,
  nodeCorners,
  toNodeLocal,
  toNodeLocalDelta,
  transformTerms,
} from "./scene_geometry_transform.js";

export {
  boundsOfPoints,
  combinedBounds,
  nodeAABB,
  nodesBounds,
  normaliseRect,
  rectsIntersect,
} from "./scene_geometry_bounds.js";

export {
  HANDLES,
  MIN_NODE_SIZE,
  OPPOSITE_HANDLE,
  SELECTABLE_HANDLES,
  cornerRadiusInwardDirection,
  edgesOfHandle,
  handleAtPoint,
  handleFromPoints,
  handlePoints,
  oppositeHandlePoint,
  rectCornerRadiusHandles,
  resizeDocument,
  resizeNodeRect,
  resizeRect,
  selectionHandlePoints,
} from "./scene_geometry_handles.js";

export {
  ANCHOR_FRACTIONS,
  ANCHOR_KEYS,
  ROTATE_HANDLE_OFFSET,
  anchorDocPoint,
  cursorForHandle,
  resizeWithAnchor,
  rotationFromPointer,
  rotationHandleGeometry,
} from "./scene_geometry_anchors.js";
