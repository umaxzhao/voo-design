/**
 * Document dimension, guides, background, and crop domain controller.
 *
 * Extracted from editor_engine.js to isolate document geometry transformations,
 * edge resizing, crop interaction delegators, and canvas background settings.
 */

import { MIN_DOC_SIZE } from "./scene_model_core.js";
import {
  commitEditorDocument,
  commitOrPreviewEditorDocument,
} from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";
import { reflowFrameNodeResize } from "./document-resize-constraints.js";

export function createEngineDocumentController({
  getDoc,
  setDoc,
  crop,
  viewportTools,
  cameraMode,
  requestRender,
  notify,
}) {
  let backgroundColor = "#ffffff";
  let guides = [];
  let grid = null;
  let snappingEnabled = true;

  function resizeDocumentEdges(edges, deltaX, deltaY, options) {
    const doc = getDoc();
    const before = { width: doc.width, height: doc.height };
    const next = ops.resizeDocumentEdges(doc, edges, deltaX, deltaY, options);
    // In a shared canvas the page box is positioned by the parent camera;
    // the viewport must stay at pan 0 so the page never shifts in its box.
    if (cameraMode !== "shared") {
      const viewport = viewportTools.getViewport();
      if (options?.fromCentre) {
        viewportTools.setViewport({
          ...viewport,
          panX:
            viewport.panX + ((before.width - next.width) / 2) * viewport.zoom,
          panY:
            viewport.panY + ((before.height - next.height) / 2) * viewport.zoom,
        });
      } else if (edges.left || edges.top) {
        viewportTools.setViewport({
          ...viewport,
          panX: edges.left
            ? viewport.panX + (before.width - next.width) * viewport.zoom
            : viewport.panX,
          panY: edges.top
            ? viewport.panY + (before.height - next.height) * viewport.zoom
            : viewport.panY,
        });
      }
    }
    commitOrPreviewEditorDocument(
      "editor.document.resize",
      setDoc,
      next,
      options,
    );
  }

  function setDocumentSize(width, height, options = {}) {
    commitEditorDocument(
      "editor.document.resize",
      setDoc,
      ops.setDocumentSize(getDoc(), width, height, options),
    );
    if (cameraMode !== "shared") viewportTools.zoomToFit();
  }

  function setDocumentBackgroundColor(next) {
    backgroundColor = next;
    return commitEditorDocument(
      "editor.document.set",
      setDoc,
      ops.setBackgroundColor(getDoc(), next),
    );
  }

  /** Resize/move a frame node and resolve its constrained children in one doc. */
  function updateFrameNode(id, patch, options = {}) {
    const current = getDoc();
    let next = reflowFrameNodeResize(current, id, patch);
    const rest = Object.fromEntries(Object.entries(patch).filter(([key]) => !["x", "y", "width", "height"].includes(key)));
    if (Object.keys(rest).length) next = ops.updateNode(next, id, rest);
    if (next === current) return false;
    commitOrPreviewEditorDocument("editor.node.frameResize", setDoc, next, options);
    return true;
  }

  function updateDocument(patch, options = {}) {
    const current = getDoc();
    const next = ops.updateDocument(current, patch);
    if (patch.backgroundColor !== undefined) {
      backgroundColor = patch.backgroundColor;
    }
    return commitOrPreviewEditorDocument(
      "editor.document.update",
      setDoc,
      next,
      options,
    );
  }

  return {
    getBackgroundColor: () => backgroundColor,
    setBackgroundColor: (next) => {
      backgroundColor = next;
      notify();
    },
    setDocumentBackgroundColor,
    updateDocument,
    updateFrameNode,
    resizeDocumentEdges,
    setDocumentSize,
    minDocSize: MIN_DOC_SIZE,

    // Guides
    getGuides: () => {
      const docGuides = Array.isArray(getDoc()?.guides) ? getDoc().guides : [];
      if (!guides || guides.length === 0) return docGuides;
      const seen = new Set(docGuides.map((g) => `${g.type}:${g.pos}`));
      const extra = guides.filter((g) => !seen.has(`${g.type}:${g.pos}`));
      return [...docGuides, ...extra];
    },
    setGuides: (nextGuides) => {
      guides = nextGuides ?? [];
      requestRender();
    },
    setDocumentGuides: (nextGuides) => {
      const d = getDoc();
      if (d) d.guides = nextGuides ? [...nextGuides] : [];
      requestRender();
      notify();
    },

    // Snapping
    getSnappingEnabled: () => snappingEnabled,
    setSnappingEnabled: (enabled) => {
      snappingEnabled = Boolean(enabled);
      notify();
    },
    toggleSnapping: () => {
      snappingEnabled = !snappingEnabled;
      notify();
      return snappingEnabled;
    },

    // Grid
    getGrid: () => grid,
    setGrid: (patch) => {
      if (!patch || patch.enabled === false || patch.visible === false) {
        grid = { size: 32, ...(grid ?? {}), ...patch, enabled: false };
      } else {
        grid = { enabled: true, size: 32, ...(grid ?? {}), ...patch };
      }
      requestRender();
      notify();
    },

    // Crop delegators
    beginCrop: crop.beginCrop,
    applyCrop: crop.applyCrop,
    applyDestructiveCrop: crop.applyDestructiveCrop,
    cancelCrop: crop.cancelCrop,
    resetCrop: crop.resetCrop,
    setCropRect: crop.setCropRect,
    getCropRect: crop.getCropRect,
    isImageCrop: crop.isImageCrop,
    getCropPreviewNode: crop.getCropPreviewNode,
    getCropRatio: () => crop.getCropRatio?.(),
    setCropRatio: (ratio) => crop.setCropRatio?.(ratio),
    getCropMode: () => crop.getCropMode?.(),
    setCropMode: (mode) => crop.setCropMode?.(mode),
    getCropSize: () => crop.getCropSize?.(),
    setCropSize: (width, height) => crop.setCropSize?.(width, height),
    getCropAngle: () => crop.getCropAngle?.(),
    setCropAngle: (angle) => crop.setCropAngle?.(angle),
  };
}
