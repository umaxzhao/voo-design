const PAINT_KEYS = [
  "docs", "layouts", "panX", "panY", "zoom", "width", "height", "dpr",
  "backgroundColor", "spatialIndex", "resolveImageUrl",
];

/** Camera-store and engine-chrome notifications can describe the same frame. */
export function sameWorkspacePaint(previous, next) {
  return Boolean(previous && PAINT_KEYS.every(key => previous[key] === next[key]));
}
