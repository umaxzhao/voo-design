/**
 * History snapshot serialization and document state restoration helpers.
 *
 * Extracted from editor_engine.js to isolate contour snapshot deduplication,
 * history tool label mappings, and bitmap pin refreshes.
 */

import {
  NODE_KIND,
  serialiseDocument,
  deserialiseDocument,
  findNode,
  isGroupNode,
} from "./scene_model.js";
import { validateEditorDocumentSnapshot } from "../../shared/editor-document-contract.js";
import { TOOL } from "./editor_constants.js";

export const HISTORY_TOOL_NAMES = {
  [TOOL.SELECT]: "editor.history.entry.transform",
  [TOOL.PERSPECTIVE]: "editor.history.entry.perspective",
  [TOOL.DISTORT]: "editor.history.entry.distort",
  [TOOL.PUPPET_WARP]: "editor.history.entry.distort",
  [TOOL.SELECT_REGION]: "editor.history.entry.transform",
  [TOOL.MARQUEE]: "editor.history.entry.selection",
  [TOOL.LASSO]: "editor.history.entry.selection",
  [TOOL.WAND]: "editor.history.entry.wand",
  [TOOL.BRUSH]: "editor.history.entry.brush",
  [TOOL.RECT]: "editor.history.entry.shape",
  [TOOL.ELLIPSE]: "editor.history.entry.shape",
  [TOOL.LINE]: "editor.history.entry.shape",
  [TOOL.POLYGON]: "editor.history.entry.shape",
  [TOOL.STAR]: "editor.history.entry.shape",
  [TOOL.ARROW]: "editor.history.entry.shape",
  [TOOL.PEN]: "editor.history.entry.pen",
  [TOOL.CURVATURE_PEN]: "editor.history.entry.pen",
  [TOOL.FREE_PEN]: "editor.history.entry.pen",
  [TOOL.TEXT]: "editor.history.entry.text",
  [TOOL.REGION]: "editor.history.entry.region",
  [TOOL.HEALING]: "editor.history.entry.healing",
  [TOOL.CROP]: "editor.history.entry.crop",
  [TOOL.ERASER]: "editor.history.entry.eraser",
  [TOOL.GRADIENT]: "editor.history.entry.gradient",
};

export function createEngineHistoryState({
  getDoc,
  setDoc,
  getPixelSelection,
  setPixelSelectionInternal,
  selection,
  history,
  cache,
  getMaskTools,
  getPaintTools,
  getPenTools,
  getTextTools,
  syncAnts,
  getIsolationGroupId,
  setIsolationGroupId,
  clearSelectionTransform,
}) {
  const contourSnapshotIds = new WeakMap();
  const contourSnapshots = new Map();
  let nextContourSnapshotId = 1;

  function snapshotState() {
    let savedSelection = null;
    const pixelSelection = getPixelSelection();
    if (pixelSelection) {
      const contours = pixelSelection.contours;
      let contoursRef = null;
      if (contours) {
        contoursRef = contourSnapshotIds.get(contours);
        if (!contoursRef) {
          contoursRef = `contours-${nextContourSnapshotId++}`;
          contourSnapshotIds.set(contours, contoursRef);
          contourSnapshots.set(contoursRef, contours);
        }
      }
      savedSelection = { ...pixelSelection, contours: undefined, contoursRef };
    }
    const state = {
      doc: serialiseDocument(getDoc()),
      pixelSelection: savedSelection,
      selectedIds: selection?.getIds?.() ?? [],
    };
    validateEditorDocumentSnapshot("design", state);
    return JSON.stringify(state);
  }

  function refreshBitmapCachePins() {
    const ids = new Set();
    const collect = (candidate) => {
      for (const node of candidate?.nodes ?? []) {
        if (node.imageId) ids.add(node.imageId);
        if (node.maskId) ids.add(node.maskId);
      }
    };
    collect(getDoc());
    for (const snapshot of history.getSnapshots()) {
      try {
        const raw = JSON.parse(snapshot);
        collect(raw?.doc ?? raw);
      } catch {
        // A corrupt history snapshot is ignored by restore too.
      }
    }
    cache.setPinnedKeys(ids);
  }

  function restore(snapshot, options = {}) {
    if (!snapshot) return;
    clearSelectionTransform?.();
    let parsedDoc = null;
    let parsedSelection = null;
    let parsedSelectedIds = null;
    try {
      const raw = JSON.parse(snapshot);
      if (raw && typeof raw === "object" && raw.doc) {
        parsedDoc = deserialiseDocument(raw.doc);
        parsedSelection = raw.pixelSelection ?? null;
        if (Array.isArray(raw.selectedIds)) {
          parsedSelectedIds = raw.selectedIds;
        }
        if (parsedSelection?.contoursRef) {
          parsedSelection.contours =
            contourSnapshots.get(parsedSelection.contoursRef) ?? [];
          delete parsedSelection.contoursRef;
        }
      } else {
        parsedDoc = deserialiseDocument(raw);
      }
    } catch {
      return;
    }
    if (!parsedDoc) return;
    getTextTools?.()?.api?.endTextEdit?.(undefined);
    getMaskTools?.()?.onDocRestored?.();
    getPaintTools?.()?.onDocRestored?.();
    getPenTools?.()?.onDocRestored?.();
    setPixelSelectionInternal(parsedSelection);
    syncAnts?.();
    history.mute(() => setDoc(parsedDoc, { commit: false }));
    if (options?.fromHistory && parsedSelectedIds !== null) {
      const validIds = parsedSelectedIds.filter((id) =>
        Boolean(findNode(getDoc(), id)),
      );
      selection.selectNodes(validIds);
    } else {
      const currentIds = selection.getIds();
      if (currentIds.length > 0) {
        const validIds = currentIds.filter((id) =>
          Boolean(findNode(getDoc(), id)),
        );
        if (validIds.length !== currentIds.length) {
          selection.selectNodes(validIds);
        }
      }
    }
    if (getIsolationGroupId?.() && !isGroupNode(findNode(getDoc(), getIsolationGroupId()))) {
      setIsolationGroupId?.(null);
    }
    void cache.preload(
      getDoc().nodes.filter((node) => node.kind === NODE_KIND.IMAGE),
    );
  }

  return {
    snapshotState,
    refreshBitmapCachePins,
    restore,
  };
}
