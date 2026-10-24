import { clampZoom } from "../editor/editor_constants.js";

/** Free-canvas spacing between artboards, in camera-space units. */
export const FREE_GUTTER = 64;
/** Free-canvas padding around the artboard row. */
export const FREE_PADDING = 48;
/** Artboards without a saved position fill a grid this many columns wide. */
const FREE_COLUMNS = 3;

/**
 * Default free-canvas placement: a grid of equal cells in reading order, each
 * artboard centred in its cell. Saved positions still win over this.
 */
export function gridArtboardLayouts(sizes) {
  const cellWidth = Math.max(...sizes.map((size) => size.width));
  const cellHeight = Math.max(...sizes.map((size) => size.height));
  return sizes.map((size, index) => {
    const column = index % FREE_COLUMNS;
    const row = Math.floor(index / FREE_COLUMNS);
    return {
      ...size,
      x: FREE_PADDING + column * (cellWidth + FREE_GUTTER) + (cellWidth - size.width) / 2,
      y: FREE_PADDING + row * (cellHeight + FREE_GUTTER) + (cellHeight - size.height) / 2,
    };
  });
}

/** Left edge of the presentation row for the page at `index`. */
export function presentationRowX(sizes, index) {
  return sizes.slice(0, index).reduce((x, size) => x + size.width + FREE_GUTTER, FREE_PADDING);
}

/**
 * Zooms a camera around a stage-space point, keeping it under the cursor —
 * the same maths the per-page viewport uses, shared across artboards here.
 */
export function zoomCameraAt(camera, factor, point) {
  const zoom = clampZoom(camera.zoom * factor);
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    panX: point.x - (point.x - camera.panX) * ratio,
    panY: point.y - (point.y - camera.panY) * ratio,
  };
}
