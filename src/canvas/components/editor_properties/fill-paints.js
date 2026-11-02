export { fillTypeOf } from "../../color_picker/texture-fill.js";
export function hasFillContent(paint, index, object) {
  return Boolean(paint.fill && paint.fill !== "transparent" || paint.imageId || index === 0 && object.kind === "image" && (object.imageId || object.src));
}

/** Explicit empty/hidden stacks must not resurrect a legacy visible paint. */
export function fillPaintsOf(object, fallbackFill = null) {
  const paints = Array.isArray(object.fills) ? object.fills : [{
    fill: (!object.fill || object.fill === "transparent") && !object.imageId && !object.src ? fallbackFill ?? object.fill ?? "transparent" : object.fill,
    opacity: object.fillOpacity ?? 1,
    visible: object.fillHidden !== true,
    blendMode: object.fillBlendMode ?? "source-over",
    ...(object.imageId ? {
      imageId: object.imageId
    } : {}),
    ...(object.imageScaleMode ? {
      imageScaleMode: object.imageScaleMode
    } : {})
  }];
  return paints.map((paint, index) => ({
    ...paint,
    id: paint.id ?? `${object.id ?? "fill"}-paint-${index}`
  }));
}
export function paintPatch(patch) {
  const result = {};
  for (const key of ["fill", "imageId", "imageScaleMode"]) {
    if (key in patch) result[key] = patch[key];
  }
  if ("fillOpacity" in patch) result.opacity = patch.fillOpacity;
  if ("fillHidden" in patch) result.visible = !patch.fillHidden;
  if ("fillBlendMode" in patch) result.blendMode = patch.fillBlendMode;
  return result;
}

/** Every picker mode updates one paint and mirrors only the legacy lead paint. */
export function fillStackPatch(paints) {
  const first = paints[0];
  return {
    fills: paints,
    fill: first?.fill ?? "transparent",
    fillOpacity: first?.opacity ?? 1,
    fillHidden: first?.visible === false,
    fillBlendMode: first?.blendMode ?? "source-over"
  };
}
