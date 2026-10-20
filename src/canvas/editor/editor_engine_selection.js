/**
 * Pixel selection, marching ants, wand, dropper, lasso, and selection transform controller.
 *
 * Extracted from editor_engine.js to isolate pixel selection state, marching ants timer,
 * magnetic/polygon lasso controllers, and sampling configuration.
 */

import { effectivePage, findNode, NODE_KIND, nodeRect } from "./scene_model.js";
import { createMagneticLassoController } from "./editor_magnetic_lasso.js";
import { createSelectionApi } from "./editor_selection_api.js";

export function createEngineSelectionController({
  getDoc,
  setDoc,
  cache,
  maskTools,
  viewportTools,
  historyApi,
  selection,
  exporter,
  trackTransform,
  replaceNodeBitmap,
  setRegionHint,
  requestRender,
  notify,
}) {
  let pixelSelection = null;
  let selectionFeather = 0;
  let selectionMode = "replace";
  let selectionTransform = null;
  let polygonDraft = null;
  let marqueeMode = "region";
  let marqueeRatio = null;

  let antsOffset = 0;
  let antsTimer = 0;

  let wandTolerance = 32;
  let wandContiguous = true;
  let wandAntiAlias = true;
  let wandSampleAll = false;
  let wandSampleSize = 0;

  const DROPPER_SAMPLE_RADII = [0, 1, 2, 5, 15];
  let dropperSampleSize = 0;
  let dropperSource = "current";
  let showSampleRing = true;

  function syncAnts() {
    const wanted = Boolean(pixelSelection);
    if (wanted && !antsTimer) {
      antsTimer = setInterval(() => {
        antsOffset = (antsOffset + 1) % 16;
        requestRender();
      }, 90);
    } else if (!wanted && antsTimer) {
      clearInterval(antsTimer);
      antsTimer = 0;
      antsOffset = 0;
    }
  }

  function clearPixelSelection() {
    if (!pixelSelection) return;
    pixelSelection = null;
    syncAnts();
    requestRender();
    notify();
  }

  function cancelPolygonLasso() {
    if (!polygonDraft) return false;
    polygonDraft = null;
    requestRender();
    notify();
    return true;
  }

  let selectionApi;
  const magneticLasso = createMagneticLassoController({
    getDocument: getDoc,
    getNodeBitmap: (node) => cache.get(node),
    getViewport: viewportTools.getViewport,
    getPixelSelection: () => pixelSelection,
    setPixelSelection: (next) => {
      pixelSelection = next;
      syncAnts();
    },
    combinePixelSelection: (base, next, mode) =>
      selectionApi.combinePixelSelection(base, next, mode),
    getSelectionFeather: () => selectionFeather,
    featherPixelSelection: (radius) =>
      selectionApi.featherPixelSelection(radius),
    commitHistory: historyApi.commit,
    setHint: (next, tone = null) => {
      setRegionHint?.(next, tone);
    },
    requestRender,
    notify,
  });

  selectionApi = createSelectionApi({
    getDoc,
    setDoc,
    getPixelSelection: () => pixelSelection,
    setPixelSelection: (next) => {
      pixelSelection = next;
    },
    getSelectionFeather: () => selectionFeather,
    setSelectionFeather: (next) => {
      selectionFeather = next;
    },
    getSelectionMode: () => selectionMode,
    setSelectionMode: (next) => {
      selectionMode = next;
    },
    getPolygonDraft: () => polygonDraft,
    setPolygonDraft: (next) => {
      polygonDraft = next;
    },
    getMarqueeMode: () => marqueeMode,
    setMarqueeMode: (next) => {
      marqueeMode = next;
    },
    getMarqueeRatio: () => marqueeRatio,
    setMarqueeRatio: (next) => {
      marqueeRatio = next;
    },
    getWandTolerance: () => wandTolerance,
    setWandTolerance: (next) => {
      wandTolerance = next;
    },
    getWandContiguous: () => wandContiguous,
    setWandContiguous: (next) => {
      wandContiguous = next;
    },
    getWandAntiAlias: () => wandAntiAlias,
    setWandAntiAlias: (next) => {
      wandAntiAlias = next;
    },
    getWandSampleAll: () => wandSampleAll,
    setWandSampleAll: (next) => {
      wandSampleAll = next;
    },
    getWandSampleSize: () => wandSampleSize,
    setWandSampleSize: (next) => {
      wandSampleSize = next;
    },
    cache,
    maskTools,
    viewportTools,
    syncAnts,
    requestRender,
    notify,
    clearPixelSelection,
    cancelPolygonLasso,
    cancelMagneticLasso: magneticLasso.cancel,
    trackTransform,
    replaceNodeBitmap,
  });

  function selectAllPixels() {
    const activeId = pixelSelection?.nodeId ?? selection.getId();
    const active = activeId ? findNode(getDoc(), activeId) : null;
    const host =
      active?.kind === NODE_KIND.IMAGE &&
      active.visible !== false &&
      !active.lockImagePixels
        ? active
        : getDoc()
            .nodes.slice()
            .reverse()
            .find(
              (node) =>
                node.kind === NODE_KIND.IMAGE &&
                node.visible !== false &&
                !node.locked &&
                !node.lockImagePixels,
            );
    if (!host) return false;
    const rect = nodeRect(host);
    setPixelSelectionInternal({
      nodeId: host.id,
      contours: [
        [
          [rect.x, rect.y],
          [rect.x + rect.width, rect.y],
          [rect.x + rect.width, rect.y + rect.height],
          [rect.x, rect.y + rect.height],
        ],
      ],
      bounds: rect,
    });
    return true;
  }

  function setPixelSelectionInternal(next) {
    pixelSelection = next;
    syncAnts();
    requestRender();
    notify();
  }

  function getWandComposite() {
    if (!wandSampleAll) return null;
    const canvas = exporter.exportPngCanvas?.();
    if (!canvas) return null;
    const page = effectivePage(getDoc());
    return {
      bitmap: canvas,
      node: {
        x: page.x,
        y: page.y,
        width: page.width,
        height: page.height,
      },
    };
  }

  function dispose() {
    if (antsTimer) {
      clearInterval(antsTimer);
      antsTimer = 0;
    }
  }

  return {
    getPixelSelection: () => pixelSelection,
    setPixelSelection: (next) => {
      pixelSelection = next;
    },
    setPixelSelectionInternal,
    getSelectionFeather: () => selectionFeather,
    setSelectionFeather: (next) => {
      selectionFeather = next;
    },
    getSelectionMode: () => selectionMode,
    setSelectionMode: (next) => {
      selectionMode = next;
    },
    getSelectionTransform: () => selectionTransform,
    setSelectionTransform: (next) => {
      selectionTransform = next;
      requestRender();
    },
    getPolygonDraft: () => polygonDraft,
    setPolygonDraft: (next) => {
      polygonDraft = next;
    },
    getMarqueeMode: () => marqueeMode,
    setMarqueeMode: (next) => {
      marqueeMode = next;
    },
    getMarqueeRatio: () => marqueeRatio,
    setMarqueeRatio: (next) => {
      marqueeRatio = next;
    },
    getAntsOffset: () => antsOffset,
    syncAnts,
    clearPixelSelection,
    cancelPolygonLasso,
    selectAllPixels,

    // Wand settings
    getWandTolerance: () => wandTolerance,
    setWandTolerance: (next) => {
      wandTolerance = next;
    },
    getWandContiguous: () => wandContiguous,
    setWandContiguous: (next) => {
      wandContiguous = next;
    },
    getWandAntiAlias: () => wandAntiAlias,
    setWandAntiAlias: (next) => {
      wandAntiAlias = next;
    },
    getWandSampleAll: () => wandSampleAll,
    setWandSampleAll: (next) => {
      wandSampleAll = next;
    },
    getWandSampleSize: () => wandSampleSize,
    setWandSampleSize: (next) => {
      wandSampleSize = next;
    },
    getWandComposite,

    // Dropper settings
    getDropperSampleSize: () => dropperSampleSize,
    setDropperSampleSize(next) {
      const value = Number(next);
      dropperSampleSize =
        Number.isInteger(value) && value >= 0 && value <= 4 ? value : 0;
      notify();
    },
    getDropperSource: () => dropperSource,
    setDropperSource(next) {
      dropperSource = next === "below" || next === "all" ? next : "current";
      notify();
    },
    getShowSampleRing: () => showSampleRing,
    setShowSampleRing(next) {
      showSampleRing = Boolean(next);
      notify();
    },
    DROPPER_SAMPLE_RADII,

    // Magnetic lasso API
    getMagneticLassoDraft: magneticLasso.getDraft,
    clickMagneticLasso: magneticLasso.click,
    updateMagneticLasso: magneticLasso.update,
    finishMagneticLasso: magneticLasso.finish,
    cancelMagneticLasso: magneticLasso.cancel,
    removeMagneticLassoAnchor: magneticLasso.removeLastAnchor,
    setMagneticLassoStraight: magneticLasso.setStraight,
    getMagneticLassoSettings: magneticLasso.getSettings,
    setMagneticLassoWidth: magneticLasso.setWidth,
    setMagneticLassoContrast: magneticLasso.setContrast,
    setMagneticLassoFrequency: magneticLasso.setFrequency,
    getMagneticLasso: () => magneticLasso,

    // Spread selectionApi methods
    ...selectionApi,

    dispose,
  };
}
