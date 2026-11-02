/** Hidden primary strokes retain their stored colour and width in the document. */
export function primaryStrokePaint(node) {
  return node.strokeHidden === true
    ? { ...node, stroke: "transparent", strokeWidth: 0, arrow: false, arrowStart: false }
    : node;
}

/** Each additional paint owns its visibility; hiding the primary never hides it. */
export function additionalStrokePaints(node) {
  if (!Array.isArray(node.strokes)) return [];
  return node.strokes
    .filter((stroke) => stroke && stroke.visible !== false && stroke.strokeWidth > 0)
    .map((stroke) => ({
      ...node,
      fill: "transparent",
      fillHidden: true,
      fillOpacity: 0,
      highlight: null,
      strokeHidden: false,
      stroke: stroke.stroke,
      strokeWidth: stroke.strokeWidth,
      strokeOpacity: stroke.strokeOpacity ?? 1,
      strokeAlign: stroke.strokeAlign ?? node.strokeAlign,
      strokes: null,
    }));
}

/** Bounded legacy pages expose the same stroke fields as their promoted Frame. */
export function documentStrokeFields(value) {
  const keys = ["stroke", "strokeWidth", "strokeOpacity", "strokeHidden", "strokes", "strokeAlign", "strokeSides", "strokeCap", "strokeJoin", "strokeDash", "strokeMiterLimit"];
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}
