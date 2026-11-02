/** Layers chrome preferences never enter the design document or its undo stack. */
export const LAYERS_WIDTH_SETTING = "voo.editor.layersWidth";
export const LAYERS_WIDTH_DEFAULT = 256;
export const LAYERS_WIDTH_MIN = 200;
export const LAYERS_WIDTH_MAX = 560;
export const LAYERS_WIDTH_STEP = 16;
export const LAYERS_EDGE_GAP = 16;

export function clampLayersWidth(value, maximum = LAYERS_WIDTH_MAX) {
  const limit = Math.max(LAYERS_WIDTH_MIN, Math.min(LAYERS_WIDTH_MAX, maximum));
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : LAYERS_WIDTH_DEFAULT;
  return Math.round(Math.max(LAYERS_WIDTH_MIN, Math.min(limit, numeric)));
}

export function layersWidthFromPointer(startWidth, startX, clientX, swapped = false, maximum) {
  return clampLayersWidth(startWidth + (clientX - startX) * (swapped ? -1 : 1), maximum);
}
