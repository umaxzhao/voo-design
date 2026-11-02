/** The flat CanvasKit adapter must not silently omit unsupported operands. */
export function hasUnsupportedBooleanSources(node) {
  if (node?.kind !== "boolean") return false;
  if (node.shear) return true;
  const unsupported = (sources) => (sources ?? []).some((source) => {
    if (!source || source.shear || source.flipH || source.flipV) return true;
    if (source.type === "boolean") return unsupported(source.booleanSources);
    if (source.type === "ellipse") return false;
    if (source.type !== "rect") return true;
    // The vendor's source builder accepts a scalar radius only; passing an
    // object makes its generated path contain NaN and drops that operand.
    return source.cornerRadius != null && typeof source.cornerRadius !== "number";
  });
  return unsupported(node.sources);
}
