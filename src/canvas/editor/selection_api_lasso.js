/**
 * Marquee mode, polygon lasso drafting, and wand tool options for editor selection API.
 */

import { NODE_KIND, findNode, nodeRect } from "./scene_model.js";
import { contourBounds } from "./mask_contour.js";
import { clampContoursToRect } from "./pixel_selection.js";
import { normalizeMarqueeMode } from "./tool_families.js";

export function createSelectionApiLasso(
  {
    getDoc,
    getPixelSelection,
    clearPixelSelection,
    getSelectionFeather,
    getPolygonDraft,
    setPolygonDraft,
    getMarqueeMode,
    setMarqueeMode,
    getMarqueeRatio,
    setMarqueeRatio,
    getWandTolerance,
    setWandTolerance,
    getWandContiguous,
    setWandContiguous,
    getWandAntiAlias,
    setWandAntiAlias,
    getWandSampleAll,
    setWandSampleAll,
    getWandSampleSize,
    setWandSampleSize,
    viewportTools,
    syncAnts,
    requestRender,
    notify,
    cancelPolygonLasso,
    cancelMagneticLasso = () => false,
  },
  api,
) {
  return {
    getMarqueeMode: () => getMarqueeMode(),
    setMarqueeMode(mode) {
      setMarqueeMode(normalizeMarqueeMode(mode));
      if (getMarqueeMode() !== "poly") cancelPolygonLasso();
      if (getMarqueeMode() !== "magnetic") cancelMagneticLasso();
      notify();
    },
    getMarqueeRatio: () => getMarqueeRatio(),
    setMarqueeRatio(ratio) {
      setMarqueeRatio(typeof ratio === "number" && ratio > 0 ? ratio : null);
      notify();
    },
    /** The polygonal-lasso draft, or null when no polygon is being built. */
    getPolygonDraft: () => getPolygonDraft(),
    /**
     * First click of the polygonal lasso: remembers the host image, snapshots
     * the selection-mode and the selection already on screen, and parks the
     * first vertex. Returns false when the click landed on no image.
     */
    startPolygonLasso(hostId, point, mode = "replace") {
      if (!hostId) return false;
      const node = findNode(getDoc(), hostId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return false;
      const [start] = clampContoursToRect(
        [[[point.x, point.y]]],
        nodeRect(node),
      );
      const previousSelection = getPixelSelection();
      setPolygonDraft({
        nodeId: hostId,
        points: start,
        preview: start[0],
        mode,
        // Snapshot the base now; later clicks must not re-read the live
        // selection, or an add drag would keep combining against itself.
        baseSelection: mode === "replace" ? null : previousSelection,
        previousSelection,
      });
      if (mode === "replace") clearPixelSelection();
      requestRender();
      notify();
      return true;
    },
    /** Adds a vertex to the polygon being built; ignores clicks that barely move. */
    addPolygonVertex(point) {
      if (!getPolygonDraft()) return false;
      const node = findNode(getDoc(), getPolygonDraft().nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return false;
      const [[[x, y]]] = clampContoursToRect(
        [[[point.x, point.y]]],
        nodeRect(node),
      );
      const start = getPolygonDraft().points[0];
      const zoom = viewportTools.getViewport?.()?.zoom || 1;
      const snapRadius = 16 / zoom;
      if (
        start &&
        getPolygonDraft().points.length >= 3 &&
        Math.hypot(x - start[0], y - start[1]) <= snapRadius
      ) {
        return api.closePolygonLasso();
      }
      const last =
        getPolygonDraft().points[getPolygonDraft().points.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 2) return false;
      getPolygonDraft().points.push([x, y]);
      getPolygonDraft().preview = [x, y];
      getPolygonDraft().isSnappedToStart = false;
      requestRender();
      notify();
      return true;
    },
    /** Tracks the pointer so the draft's last edge follows it before closing. */
    updatePolygonPreview(point) {
      if (!getPolygonDraft()) return;
      const node = findNode(getDoc(), getPolygonDraft().nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return;
      const [[[x, y]]] = clampContoursToRect(
        [[[point.x, point.y]]],
        nodeRect(node),
      );
      const start = getPolygonDraft().points[0];
      const zoom = viewportTools.getViewport?.()?.zoom || 1;
      const snapRadius = 16 / zoom;
      if (
        start &&
        getPolygonDraft().points.length >= 3 &&
        Math.hypot(x - start[0], y - start[1]) <= snapRadius
      ) {
        getPolygonDraft().preview = [start[0], start[1]];
        getPolygonDraft().isSnappedToStart = true;
      } else {
        getPolygonDraft().preview = [x, y];
        getPolygonDraft().isSnappedToStart = false;
      }
      requestRender();
    },
    /**
     * Closes the polygon: at least three distinct vertices become a selection
     * contour, combined with the snapshotted base selection through the mode
     * chosen at the first click. Returns false when there is nothing to close.
     */
    closePolygonLasso() {
      const draft = getPolygonDraft();
      if (!draft || draft.points.length < 3) {
        cancelPolygonLasso();
        return false;
      }
      setPolygonDraft(null);
      const selection = {
        nodeId: draft.nodeId,
        contours: [draft.points.map(([x, y]) => [x, y])],
        bounds: contourBounds([draft.points]),
      };
      api.combinePixelSelection(
        draft.baseSelection ?? null,
        selection,
        draft.mode ?? "replace",
      );
      const feather = getSelectionFeather?.() ?? 0;
      if (feather > 0 && getPixelSelection?.()) {
        api.featherPixelSelection?.(feather);
      }
      syncAnts();
      requestRender();
      notify();
      return true;
    },
    cancelPolygonLasso() {
      return cancelPolygonLasso();
    },
    getWandTolerance: () => getWandTolerance(),
    setWandTolerance(next) {
      setWandTolerance(Math.max(0, Math.min(255, Number(next) || 0)));
      notify();
    },
    getWandContiguous: () => getWandContiguous(),
    setWandContiguous(next) {
      setWandContiguous(Boolean(next));
      notify();
    },
    getWandAntiAlias: () => getWandAntiAlias(),
    setWandAntiAlias(next) {
      setWandAntiAlias(Boolean(next));
      notify();
    },
    getWandSampleAll: () => getWandSampleAll(),
    setWandSampleAll(next) {
      setWandSampleAll(Boolean(next));
      notify();
    },
    getWandSampleSize: () => getWandSampleSize(),
    setWandSampleSize(next) {
      const value = Number(next);
      setWandSampleSize(value === 1 || value === 2 ? value : 0);
      notify();
    },
  };
}
