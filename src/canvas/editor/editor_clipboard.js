/**
 * Layer clipboard: internal copy/paste/cut/duplicate for selected nodes,
 * plus a best-effort mirror of copied pixels onto the SYSTEM clipboard so
 * other apps can paste them too.
 *
 * `layerClipboard` is deliberately module-scope, not per-editor: it is the
 * app's one clipboard, so a copy made in one editor instance pastes in
 * another, the way every other clipboard in the app behaves.
 */
import * as ops from "./doc_ops.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import { exportSvgNodes } from "./editor-svg-resources.js";
import { createLayerDuplicator } from "./layer-duplicate.js";

/** Internal layer clipboard holding serialized node data for copy/paste. */
let layerClipboard = null;

import { writeSvgToSystemClipboard, writePngToSystemClipboard } from "./system-clipboard.js";
import { pasteLayerNodes } from "./layer-paste.js";
export { pngDataUrlToBlob } from "./system-clipboard.js";

export function createClipboard({
  getDoc,
  setDoc,
  selection,
  selectMany,
  select,
  getSelectedGroup,
  selectGroup,
  cache = null,
  removeIds,
  getPixelSelection,
  layerFromSelection,
  extractSelectionImageNode,
  deleteSelectionPixels,
  exportSelectionPng,
  maskTools,
  getViewportCenter,
}) {
  const selectedUnitIds = () => {
    const group = getSelectedGroup?.();
    return group ? [group.id] : selection.getIds();
  };

  const duplicateSelected = createLayerDuplicator({ getDoc, setDoc, getPixelSelection,
    layerFromSelection, getSelectedGroup, selectedUnitIds, selectGroup, selectMany });

  async function copySelected() {
    if (getPixelSelection()?.contours?.length) {
      const extracted = await extractSelectionImageNode(getPixelSelection());
      if (extracted?.newNode) {
        layerClipboard = {
          nodes: [extracted.newNode],
          setIds: [extracted.newNode.id],
          sourceCanvasId: getDoc().canvasId,
          svgText: null,
          systemWriteSucceeded: false,
        };
        const copiedLayers = layerClipboard;
        if (
          extracted.blob &&
          typeof navigator !== "undefined" &&
          navigator.clipboard?.write &&
          globalThis.ClipboardItem
        ) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": extracted.blob }),
            ]);
            if (layerClipboard === copiedLayers)
              copiedLayers.systemWriteSucceeded = true;
          } catch {
            // Internal layers remain available when the OS write fails.
          }
        }
        return;
      }
    }
    const doc = getDoc();
    const selectedIds = selectedUnitIds();
    if (selectedIds.length === 0) return;
    const setIds = ops.moveAffectedIds(doc, selectedIds);
    const set = new Set(setIds);
    const nodesToCopy = doc.nodes
      .filter((n) => set.has(n.id))
      .map((n) => JSON.parse(JSON.stringify(n)));
    layerClipboard = {
      nodes: nodesToCopy,
      setIds,
      sourceCanvasId: doc.canvasId,
      svgText: null,
      systemWriteSucceeded: false,
    };
    const copiedLayers = layerClipboard;
    // Write both transparent PNG and vector SVG to the SYSTEM clipboard
    // so the user can paste into other apps (Figma, Illustrator, browser)
    // with both alpha and editable vectors intact.
    try {
      const exported = exportSelectionPng?.(setIds);
      const svgMarkup = exportSvgNodes(nodesToCopy, { cache, maskTools });
      if (svgMarkup) {
        const succeeded = await writeSvgToSystemClipboard(
          svgMarkup,
          exported?.dataUrl,
        );
        if (layerClipboard === copiedLayers && succeeded) {
          copiedLayers.svgText = svgMarkup.trim();
          copiedLayers.systemWriteSucceeded = true;
        }
      } else if (exported?.dataUrl) {
        const succeeded = await writePngToSystemClipboard(exported.dataUrl);
        if (layerClipboard === copiedLayers)
          copiedLayers.systemWriteSucceeded = succeeded;
      }
    } catch {
      // The in-app clipboard above already holds the layers.
    }
  }

  async function copySelectedSvg() {
    const doc = getDoc();
    const selectedIds = selectedUnitIds();
    if (selectedIds.length === 0) return null;
    const setIds = ops.moveAffectedIds(doc, selectedIds);
    const set = new Set(setIds);
    const nodesToCopy = doc.nodes
      .filter((n) => set.has(n.id))
      .map((n) => JSON.parse(JSON.stringify(n)));
    const svgMarkup = exportSvgNodes(nodesToCopy, { cache, maskTools });
    if (svgMarkup) {
      await writeSvgToSystemClipboard(svgMarkup);
      return svgMarkup;
    }
    return null;
  }

  function getSelectedSvg() {
    const doc = getDoc();
    const selectedIds = selectedUnitIds();
    if (selectedIds.length === 0) return "";
    const setIds = ops.moveAffectedIds(doc, selectedIds);
    const set = new Set(setIds);
    const nodesToCopy = doc.nodes
      .filter((n) => set.has(n.id))
      .map((n) => JSON.parse(JSON.stringify(n)));
    return exportSvgNodes(nodesToCopy, { cache, maskTools });
  }

  function copy() {
    return copySelected();
  }

  function cut() {
    return cutSelected();
  }

  function hasLayerClipboard() {
    return Boolean(layerClipboard && layerClipboard.nodes?.length);
  }

  function canPasteFromInternalClipboard() {
    return hasLayerClipboard() && !layerClipboard.systemWriteSucceeded;
  }

  function paste(clipboardData = null) {
    if (!layerClipboard || !layerClipboard.nodes?.length) {
      return false;
    }
    if (clipboardData && layerClipboard.systemWriteSucceeded) {
      const text = clipboardData.getData?.("text/plain")?.trim() ?? "";
      const html = clipboardData.getData?.("text/html") ?? "";
      const ownSvg = layerClipboard.svgText;
      if (!ownSvg || (text !== ownSvg && !html.includes(ownSvg))) {
        return false;
      }
    }
    const pasted = pasteLayerNodes(getDoc(), layerClipboard, selection.getIds(), getViewportCenter?.());
    commitEditorDocument("editor.clipboard.change", setDoc, pasted.doc);
    selectMany(pasted.selectedIds);
    return true;
  }

  function deleteSelected() {
    const maskEdit = maskTools.api.getMaskEdit();
    if (maskEdit?.nodeId) {
      maskTools.api.clearMask(maskEdit.nodeId);
      return;
    }
    const selectedIds = selection.getIds();
    if (selectedIds.length === 0) return;
    if (removeIds(selectedIds)) select(null);
  }

  async function cutSelected() {
    if (getPixelSelection()?.contours?.length) {
      await copySelected();
      await deleteSelectionPixels();
      return;
    }
    const copyPromise = copySelected();
    const selectedIds = selection.getIds();
    if (selectedIds.length === 0) return;
    if (removeIds(layerClipboard?.setIds ?? selectedIds)) select(null);
    await copyPromise;
  }

  return {
    duplicateSelected,
    copySelected,
    copySelectedSvg,
    getSelectedSvg,
    copy,
    cut,
    hasLayerClipboard,
    canPasteFromInternalClipboard,
    paste,
    deleteSelected,
    cutSelected,
  };
}
