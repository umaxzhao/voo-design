import { syncTileLayerCanvas } from './stage_tile_layer.js';
/**
 * Canvas pixel sampling and eyedropper color readback.
 *
 * Extracted from editor_engine.js to isolate stage canvas pixel readbacks and
 * multi-layer sampling calculations.
 */

import { canvasPixelAt } from "./editor_constants.js";
import { sourceSampleColor } from "./eyedropper_properties.js";
import { nodeColorAt } from "./bitmap_cache.js";

export function createEngineSampler({
  ctx,
  getDoc,
  cache,
  viewportTools,
  getRenderedDpr,
  getDropperSampleSize,
  getDropperSource,
  DROPPER_SAMPLE_RADII,
  beforeRead = null,
  renderOutsidePixel = null,
}) {
  function compositedPixelAt(docPoint, radius, size) {
    beforeRead?.();
    syncTileLayerCanvas(ctx, () => ({ doc: getDoc(), viewport: viewportTools.getViewport(),
      cullOffscreen: false, spatialIndex: null }));
    const pixel = canvasPixelAt(
      docPoint,
      viewportTools.getViewport(),
      getRenderedDpr?.() ?? 1,
    );
    const cw = ctx.canvas?.width ?? 0;
    const ch = ctx.canvas?.height ?? 0;
    const sx =
      cw > 0
        ? Math.max(0, Math.min(pixel.x - radius, cw - 1))
        : pixel.x - radius;
    const sy =
      ch > 0
        ? Math.max(0, Math.min(pixel.y - radius, ch - 1))
        : pixel.y - radius;
    const w = cw > 0 ? Math.min(size, cw - sx) : size;
    const h = ch > 0 ? Math.min(size, ch - sy) : size;
    if (w <= 0 || h <= 0) return null;
    // A free world extends beyond the engine's document-origin readback. Never
    // clamp those visible points onto the unrelated pixel at (0, 0).
    const outside = getDoc().isCanvasRoot && (pixel.x - radius < 0 || pixel.y - radius < 0 ||
      pixel.x + radius >= cw || pixel.y + radius >= ch);
    const { data } = outside && renderOutsidePixel
      ? renderOutsidePixel(docPoint, radius)
      : ctx.getImageData(sx, sy, w, h);
    const hex = (value) => Math.round(value).toString(16).padStart(2, "0");
    if (radius === 0) {
      if (data[3] === 0) return null;
      return `#${hex(data[0])}${hex(data[1])}${hex(data[2])}`;
    }
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      sumR += data[i];
      sumG += data[i + 1];
      sumB += data[i + 2];
      count += 1;
    }
    if (count === 0) return null;
    return `#${hex(sumR / count)}${hex(sumG / count)}${hex(sumB / count)}`;
  }

  function sampleColorAt(docPoint) {
    const sampleSize = getDropperSampleSize?.() ?? 0;
    const radius = DROPPER_SAMPLE_RADII[sampleSize] ?? 0;
    const size = radius * 2 + 1;
    const source = getDropperSource?.() ?? "current";
    if (source === "current") {
      return compositedPixelAt(docPoint, radius, size);
    }
    return sourceSampleColor(getDoc().nodes, source, docPoint, (node) =>
      nodeColorAt(node, docPoint, radius, cache),
    );
  }

  return {
    compositedPixelAt,
    sampleColorAt,
  };
}
