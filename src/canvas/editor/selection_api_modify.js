/**
 * Selection modification routines for editor selection API:
 * feather, expand/contract, smooth, border, combine, and invert.
 */

import { NODE_KIND, findNode } from "./scene_model.js";
import {
  borderSelection,
  combineSelections,
  expandContractSelection,
  featherSelection,
  invertSelection,
  smoothSelection,
} from "./pixel_selection.js";

export function createSelectionApiModify(
  {
    getDoc,
    getPixelSelection,
    setPixelSelection,
    getSelectionFeather,
    setSelectionFeather,
    getSelectionMode,
    setSelectionMode,
    cache,
    syncAnts,
    requestRender,
    notify,
    clearPixelSelection,
  },
  api,
) {
  return {
    /** Default feather radius for selection tools in document pixels. */
    setSelectionFeather(val) {
      setSelectionFeather(Math.max(0, Math.round(Number(val) || 0)));
      if (getPixelSelection()?.contours?.length) {
        api.featherPixelSelection(getSelectionFeather());
      }
      notify();
    },
    /** Installs a selection; pass null to drop it. Repaints either way. */
    setPixelSelection(next) {
      if (next && next.feather === undefined && getSelectionFeather() > 0) {
        next.feather = getSelectionFeather();
      }
      // The outline is chrome, not pixel data: it may preview past the
      // image's edge while the user drags, and committing (the transform
      // path) is where the geometry is clamped back into the layer.
      setPixelSelection(next ?? null);
      syncAnts();
      requestRender();
      notify();
    },
    /**
     * Feathers the current selection (Photoshop's Select → Modify → Feather):
     * the outline is softened and the selection remembers the radius so later
     * deletes and copies fall off at the edge instead of clipping hard.
     */
    featherPixelSelection(radius) {
      const current = getPixelSelection();
      if (!current?.nodeId) return false;
      const node = findNode(getDoc(), current.nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return false;
      const bitmap = cache.get(node);
      if (!bitmap) return false;
      const feathered = featherSelection(bitmap, current, node, radius);
      if (!feathered) return false;
      api.setPixelSelection(feathered);
      syncAnts();
      requestRender();
      notify();
      return true;
    },
    /**
     * Grows or shrinks the selection's outline by `amount` document pixels
     * (Photoshop's Select → Modify → Expand / Contract).
     */
    modifyPixelSelection(amount, { expand = true } = {}) {
      const current = getPixelSelection();
      if (!current?.nodeId || !(amount > 0)) return false;
      const node = findNode(getDoc(), current.nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return false;
      const bitmap = cache.get(node);
      if (!bitmap) return false;
      const next = expandContractSelection(bitmap, current, node, amount, {
        expand,
      });
      if (!next || next === current) return false;
      api.setPixelSelection(next);
      syncAnts();
      requestRender();
      notify();
      return true;
    },
    /**
     * Smooths the selection's outline by `radius` pixels (Photoshop's
     * Select → Modify → Smooth).
     */
    smoothPixelSelection(radius) {
      const current = getPixelSelection();
      if (!current?.nodeId || !(radius > 0)) return false;
      const node = findNode(getDoc(), current.nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return false;
      const bitmap = cache.get(node);
      if (!bitmap) return false;
      const next = smoothSelection(bitmap, current, node, radius);
      if (!next || next === current) return false;
      api.setPixelSelection(next);
      syncAnts();
      requestRender();
      notify();
      return true;
    },
    /**
     * Selects a band of `amount` pixels around the selection's outline
     * (Photoshop's Select → Modify → Border).
     */
    borderPixelSelection(amount) {
      const current = getPixelSelection();
      if (!current?.nodeId || !(amount > 0)) return false;
      const node = findNode(getDoc(), current.nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return false;
      const bitmap = cache.get(node);
      if (!bitmap) return false;
      const next = borderSelection(bitmap, current, node, amount);
      if (!next || next === current) return false;
      api.setPixelSelection(next);
      syncAnts();
      requestRender();
      notify();
      return true;
    },
    getSelectionMode: () => getSelectionMode(),
    setSelectionMode(mode) {
      setSelectionMode(
        ["union", "subtract", "intersect"].includes(mode) ? mode : "replace",
      );
      notify();
    },
    /**
     * Installs `next` as the pixel selection, combined with `base` through the
     * given boolean mode (union/subtract/intersect) when both live on the same
     * layer. The layer's bitmap is required for the rasterisation, so a
     * missing bitmap falls back to a plain replace.
     */
    combinePixelSelection(base, next, mode = "replace") {
      if (mode === "replace" || !base || !next || base.nodeId !== next.nodeId) {
        api.setPixelSelection(next);
        return next;
      }
      const node = findNode(getDoc(), base.nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) {
        api.setPixelSelection(next);
        return next;
      }
      const bitmap = cache.get(node);
      if (!bitmap) {
        api.setPixelSelection(next);
        return next;
      }
      const combined = combineSelections(bitmap, base, next, node, mode);
      if (!combined) {
        clearPixelSelection();
        return null;
      }
      api.setPixelSelection(combined);
      return combined;
    },
    /**
     * Inverts the current pixel selection (⇧⌘I). Requires the layer's bitmap;
     * returns false when nothing is selected or the bitmap is unavailable.
     */
    async invertPixelSelection() {
      const current = getPixelSelection();
      if (!current?.nodeId) return false;
      const node = findNode(getDoc(), current.nodeId);
      if (!node || node.kind !== NODE_KIND.IMAGE) return false;
      const bitmap = cache.get(node);
      if (!bitmap) return false;
      const inverted = invertSelection(bitmap, current, node);
      if (!inverted) return false;
      api.setPixelSelection(inverted);
      syncAnts();
      requestRender();
      notify();
      return true;
    },
  };
}
