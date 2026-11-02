/** Figma node types that act as containers with their own children. */
export const CONTAINER_TYPES = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "SECTION",
  "SYMBOL",
]);
/** Containers whose children are positioned relative to them (groups are not). */
export const COORDINATE_CONTAINER_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "SECTION",
  "SYMBOL",
]);
/** Types whose geometry is a path; decoded to pen paths, with a box as the fallback. */
export const VECTOR_TYPES = new Set(["VECTOR", "LINE", "STAR", "POLYGON", "REGULAR_POLYGON", "BOOLEAN_OPERATION", "BRUSH"]);
export const RECT_TYPES = new Set(["RECTANGLE", "ROUNDED_RECTANGLE"]);
export const ELLIPSE_TYPES = new Set(["ELLIPSE"]);
/** Structural records that never map to a layer. */
export const STRUCTURAL_TYPES = new Set(["DOCUMENT", "CANVAS", "SLICE", "VARIABLE", "VARIABLE_SET"]);
