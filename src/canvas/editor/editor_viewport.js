/**
 * The editor viewport: zoom and pan over the document.
 *
 * Pure camera math — the module owns the `{ zoom, panX, panY }` triple and
 * the conversions between client, stage and document space. Every mutation
 * repaints and notifies through the callbacks the engine hands in.
 */

import { ZOOM_STEP, clampZoom, fitScale } from "./editor_constants.js";
import { effectivePage } from "./scene_model.js";
import {
  beginCustomBlendInteraction,
  endCustomBlendInteraction,
} from "./render_custom_blend.js";
import {
  beginLayerCacheInteraction,
  endLayerCacheInteraction,
} from "./layer_cache.js";

/** Below this a side's insets are ignored: overlap, not a sliver fit. */
const MIN_FIT_SPAN = 160;

/** Quiet time after the last view change before exact blend tiles return. */
const VIEW_SETTLE_MS = 250;

/**
 * @param {object} options
 * @param {(stageWidth: number) => ({ left?: number, right?: number, top?: number, bottom?: number } | null)} [options.getFitInsets]
 *   What the fit keeps clear on each side: floating panels and bars over the
 *   stage. Asked at fit time, so a resize or a moved panel needs no
 *   re-wiring.
 */
export function createViewport({
  stage,
  getDoc,
  notify,
  requestRender,
  getFitInsets = null,
}) {
  let viewport = { zoom: 1, panX: 0, panY: 0 };
  let settleTimer = 0;

  function setViewport(next) {
    viewport = next;
    beginCustomBlendInteraction();
    beginLayerCacheInteraction();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      endCustomBlendInteraction();
      endLayerCacheInteraction();
      requestRender();
    }, VIEW_SETTLE_MS);
    requestRender();
    notify();
  }

  /** One axis of the fit area: the stage span less both insets. */
  function fitSpan(size, start, end) {
    const before = Math.max(0, Number(start) || 0);
    const after = Math.max(0, Number(end) || 0);
    if (size - before - after < MIN_FIT_SPAN) return { offset: 0, size };
    return { offset: before, size: size - before - after };
  }

  /** The area the page is fitted into. */
  function fitBand() {
    const insets = getFitInsets?.(stage.clientWidth) ?? null;
    const x = fitSpan(stage.clientWidth, insets?.left, insets?.right);
    const y = fitSpan(stage.clientHeight, insets?.top, insets?.bottom);
    return { left: x.offset, width: x.size, top: y.offset, height: y.size };
  }

  function zoomToFit() {
    const doc = getDoc();
    if (!doc || !stage?.clientWidth || !stage?.clientHeight) return;
    // The visible page is the crop rect when one is in place; fitting it
    // keeps a cropped document centred and filling the viewport.
    const page = effectivePage(doc);
    const band = fitBand();
    const scale = fitScale(band.width, band.height, page.width, page.height);
    setViewport({
      zoom: scale,
      panX: band.left + (band.width - page.width * scale) / 2 - page.x * scale,
      panY: band.top + (band.height - page.height * scale) / 2 - page.y * scale,
    });
  }

  /** Zooms around a stage-space point, keeping it under the cursor. */
  function zoomAt(factor, point) {
    const zoom = clampZoom(viewport.zoom * factor);
    const ratio = zoom / viewport.zoom;
    setViewport({
      zoom,
      panX: point.x - (point.x - viewport.panX) * ratio,
      panY: point.y - (point.y - viewport.panY) * ratio,
    });
  }

  const stageCentre = () => ({
    x: stage.clientWidth / 2,
    y: stage.clientHeight / 2,
  });

  function panBy(dx, dy) {
    setViewport({
      ...viewport,
      panX: viewport.panX + dx,
      panY: viewport.panY + dy,
    });
  }

  /** Client coordinates → document space. */
  function toDocPoint(clientX, clientY) {
    const bounds = stage.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - viewport.panX) / viewport.zoom,
      y: (clientY - bounds.top - viewport.panY) / viewport.zoom,
    };
  }

  function zoomToSelection(selectedNodes) {
    if (!selectedNodes || selectedNodes.length === 0 || !stage?.clientWidth || !stage?.clientHeight) return;
    const xs = selectedNodes.map((n) => n.x);
    const ys = selectedNodes.map((n) => n.y);
    const rights = selectedNodes.map((n) => n.x + n.width);
    const bottoms = selectedNodes.map((n) => n.y + n.height);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...rights);
    const maxY = Math.max(...bottoms);
    const selWidth = Math.max(1, maxX - minX);
    const selHeight = Math.max(1, maxY - minY);
    const band = fitBand();
    const padding = 48;
    const targetW = Math.max(MIN_FIT_SPAN, band.width - padding * 2);
    const targetH = Math.max(MIN_FIT_SPAN, band.height - padding * 2);
    const scale = clampZoom(Math.min(targetW / selWidth, targetH / selHeight));
    setViewport({
      zoom: scale,
      panX: band.left + (band.width - selWidth * scale) / 2 - minX * scale,
      panY: band.top + (band.height - selHeight * scale) / 2 - minY * scale,
    });
  }

  return {
    getViewport: () => viewport,
    getZoom: () => viewport.zoom,
    setViewport,
    zoomToFit,
    zoomToSelection,
    zoomAt,
    zoomStep: (direction) => zoomAt(ZOOM_STEP ** direction, stageCentre()),
    zoomToHundred: () => zoomAt(1 / viewport.zoom, stageCentre()),
    panBy,
    toDocPoint,
  };
}
