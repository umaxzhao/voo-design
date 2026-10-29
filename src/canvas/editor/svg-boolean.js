import { booleanOutlineNode } from "./boolean-outline.js";
import { pathData, shapeAttributes } from "./editor_svg_shapes.js";

/** Stroke the merged boundary, never each overlapping operand separately. */
export function booleanNodeMarkup(node, idOf) {
  const outline = booleanOutlineNode(node);
  if (!outline.points.length) return [];
  return [`<path d="${pathData(outline)}" ${shapeAttributes(outline, idOf)}/>`];
}
