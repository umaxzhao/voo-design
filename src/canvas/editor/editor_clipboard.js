/**
 * Layer clipboard: internal copy/paste/cut/duplicate for selected nodes,
 * plus a best-effort mirror of copied pixels onto the SYSTEM clipboard so
 * other apps can paste them too.
 *
 * `layerClipboard` is deliberately module-scope, not per-editor: it is the
 * app's one clipboard, so a copy made in one editor instance pastes in
 * another, the way every other clipboard in the app behaves.
 */
import { isContainerNode } from "./scene_model.js";
import * as ops from "./doc_ops.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import { nodesToSvg } from "./editor_svg.js";

/** Internal layer clipboard holding serialized node data for copy/paste. */
let layerClipboard = null;

/**
 * Decodes a base64 image data URL into a Blob without a fetch round-trip
 * (fetching a data: URL just to get the same bytes back is wasted work).
 * Returns null when the input is not a well-formed base64 data URL.
 */
export function pngDataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  let binary;
  try {
    binary = atob(match[2]);
  } catch {
    return null; // malformed base64
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

/**
 * Writes SVG markup (and optional PNG data URL) to the system clipboard.
 */
async function writeSvgToSystemClipboard(svgString, pngDataUrl = null) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  const items = {};
  if (svgString) {
    items["text/plain"] = new Blob([svgString], { type: "text/plain" });
    items["text/html"] = new Blob([`<meta charset="utf-8">${svgString}`], {
      type: "text/html",
    });
    try {
      items["image/svg+xml"] = new Blob([svgString], {
        type: "image/svg+xml",
      });
    } catch {
      // image/svg+xml may be restricted by some browser environments
    }
  }
  if (pngDataUrl) {
    const blob = pngDataUrlToBlob(pngDataUrl);
    if (blob) items["image/png"] = blob;
  }
  if (navigator.clipboard.write && globalThis.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem(items)]);
      return true;
    } catch {
      // Text is still available when rich clipboard writes are denied.
    }
  }
  if (svgString && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(svgString);
      return true;
    } catch {
      // The in-app clipboard remains available when the OS write fails.
    }
  }
  return false;
}

/**
 * Best-effort write of a PNG data URL to the SYSTEM clipboard, alpha intact.
 */
async function writePngToSystemClipboard(dataUrl) {
  const bridge = globalThis.window?.vooElectron ?? globalThis.vooElectron;
  if (typeof bridge?.writeClipboardImage === "function") {
    try {
      await bridge.writeClipboardImage(dataUrl);
      return true;
    } catch {
      // Native write failed (e.g. rejected payload) — try the web path.
    }
  }
  const blob = pngDataUrlToBlob(dataUrl);
  if (!blob) return false;
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard?.write ||
    !globalThis.ClipboardItem
  ) {
    return false;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    // Clipboard unavailable outside a user gesture; the in-app clipboard
    // still holds the layers, so the copy is not lost.
    return false;
  }
}

export function createClipboard({
  getDoc,
  setDoc,
  selection,
  selectMany,
  select,
  removeIds,
  getPixelSelection,
  layerFromSelection,
  extractSelectionImageNode,
  deleteSelectionPixels,
  exportSelectionPng,
  maskTools,
  getViewportCenter,
}) {
  let powerDuplicateState = null;

  function duplicateSelected() {
    if (getPixelSelection()?.contours?.length) {
      void layerFromSelection();
      return;
    }
    const doc = getDoc();
    const selectedIds = selection.getIds();
    if (selectedIds.length === 0) {
      powerDuplicateState = null;
      return;
    }
    // The whole set travels with the duplicate: a folder brings its
    // members and a clip base brings its clipped layers, whether or not
    // they were selected — duplicating the parent copies what is inside it.
    const setIds = ops.moveAffectedIds(doc, selectedIds);
    const set = new Set(setIds);
    if (set.size === 0) return;

    // Affinity-grade Power Duplicate: calculate transform repetition delta
    let offsetX = 0;
    let offsetY = 0;
    let offsetRotation = 0;
    let scaleX = 1;
    let scaleY = 1;
    const isConsecutiveDuplicate =
      Boolean(powerDuplicateState) &&
      selectedIds.length === powerDuplicateState.lastDuplicateIds.length &&
      selectedIds.every((id) => powerDuplicateState.lastDuplicateIds.includes(id));

    if (isConsecutiveDuplicate) {
      const primaryNode = doc.nodes.find((n) => n.id === selectedIds[0]);
      const initialPos = powerDuplicateState.initialPositions.get(selectedIds[0]);
      if (primaryNode && initialPos) {
        const deltaX = (primaryNode.x ?? 0) - initialPos.x;
        const deltaY = (primaryNode.y ?? 0) - initialPos.y;
        const deltaRot = (primaryNode.rotation ?? 0) - initialPos.rotation;
        const initW = initialPos.width ?? 0;
        const initH = initialPos.height ?? 0;
        const curW = primaryNode.width ?? 0;
        const curH = primaryNode.height ?? 0;
        const ratioW = initW > 0 && curW > 0 ? curW / initW : 1;
        const ratioH = initH > 0 && curH > 0 ? curH / initH : 1;

        if (
          Math.abs(deltaX) > 0.001 ||
          Math.abs(deltaY) > 0.001 ||
          Math.abs(deltaRot) > 0.001 ||
          Math.abs(ratioW - 1) > 0.001 ||
          Math.abs(ratioH - 1) > 0.001
        ) {
          offsetX = deltaX;
          offsetY = deltaY;
          offsetRotation = deltaRot;
          scaleX = ratioW;
          scaleY = ratioH;
        } else if (powerDuplicateState.lastDelta) {
          offsetX = powerDuplicateState.lastDelta.dx;
          offsetY = powerDuplicateState.lastDelta.dy;
          offsetRotation = powerDuplicateState.lastDelta.drot;
          scaleX = powerDuplicateState.lastDelta.scaleX ?? 1;
          scaleY = powerDuplicateState.lastDelta.scaleY ?? 1;
        }
      } else if (powerDuplicateState.lastDelta) {
        offsetX = powerDuplicateState.lastDelta.dx;
        offsetY = powerDuplicateState.lastDelta.dy;
        offsetRotation = powerDuplicateState.lastDelta.drot;
        scaleX = powerDuplicateState.lastDelta.scaleX ?? 1;
        scaleY = powerDuplicateState.lastDelta.scaleY ?? 1;
      }
    }

    // One copy per node in the set, with a fresh id and no locks; parents
    // and clips remap to their copies below, everything else keeps its
    // original target (a member copied on its own stays in its folder).
    const copiesById = new Map();
    for (const node of doc.nodes) {
      if (!set.has(node.id)) continue;
      const targetW = node.width !== undefined ? Math.round(node.width * scaleX) : undefined;
      const targetH = node.height !== undefined ? Math.round(node.height * scaleY) : undefined;
      const copy = {
        ...node,
        id: crypto.randomUUID(),
        locked: false,
        x: (node.x ?? 0) + offsetX,
        y: (node.y ?? 0) + offsetY,
        ...(targetW !== undefined ? { width: targetW, baseWidth: targetW } : {}),
        ...(targetH !== undefined ? { height: targetH, baseHeight: targetH } : {}),
        ...(offsetRotation
          ? { rotation: ((node.rotation ?? 0) + offsetRotation) % 360 }
          : {}),
        points: node.points
          ? node.points.map((point) =>
              Array.isArray(point)
                ? [point[0] * scaleX, point[1] * scaleY]
                : {
                    ...point,
                    x: point.x * scaleX,
                    y: point.y * scaleY,
                    in: point.in ? [point.in[0] * scaleX, point.in[1] * scaleY] : null,
                    out: point.out ? [point.out[0] * scaleX, point.out[1] * scaleY] : null,
                  },
            )
          : undefined,
      };
      if (copy.points === undefined) delete copy.points;
      copiesById.set(node.id, copy);
    }
    for (const copy of copiesById.values()) {
      if (copy.parentId) {
        copy.parentId = copiesById.get(copy.parentId)?.id ?? copy.parentId;
      }
      if (copy.clipTo) {
        copy.clipTo = copiesById.get(copy.clipTo)?.id ?? copy.clipTo;
      }
    }

    // The copies keep the original structure as one block: a folder's copy
    // block — the folder plus every member, nested folders included — lands
    // directly above the original folder's block, so the duplicate renders
    // as a unit at the copy's stacking slot instead of scattering.
    const isDescOf = (candidate, groupId) => {
      let current = doc.nodes.find((node) => node.id === candidate.parentId);
      while (current) {
        if (current.id === groupId) return true;
        current = doc.nodes.find((node) => node.id === current.parentId);
      }
      return false;
    };
    const hasGroupAncestorInSet = (node) => {
      let current = doc.nodes.find(
        (candidate) => candidate.id === node.parentId,
      );
      while (current) {
        if (isContainerNode(current) && set.has(current.id)) return true;
        current = doc.nodes.find(
          (candidate) => candidate.id === current.parentId,
        );
      }
      return false;
    };

    const newNodes = [];
    const pendingAfter = new Map(); // anchor original id -> copy block
    const deferredMembers = new Set();
    for (const node of doc.nodes) {
      newNodes.push(node);
      if (!set.has(node.id)) continue;
      if (isContainerNode(node) && !hasGroupAncestorInSet(node)) {
        // The folder's whole copy block is deferred until its last member:
        // the originals stay in place, the copies land right above them.
        const block = doc.nodes.filter(
          (n) => n.id !== node.id && set.has(n.id) && isDescOf(n, node.id),
        );
        const last = block.length ? block[block.length - 1].id : node.id;
        const copyBlock = [
          copiesById.get(node.id),
          ...block.map((n) => copiesById.get(n.id)),
        ].filter(Boolean);
        if (copyBlock.length) pendingAfter.set(last, copyBlock);
        for (const member of block) deferredMembers.add(member.id);
        continue;
      }
      if (deferredMembers.has(node.id)) continue; // copy is in its folder's block
      const copy = copiesById.get(node.id);
      if (copy) newNodes.push(copy);
    }
    const out = [];
    for (const node of newNodes) {
      out.push(node);
      const copyBlock = pendingAfter.get(node.id);
      if (copyBlock) out.push(...copyBlock);
    }

    // One setDoc for the whole set, so undo takes back the whole duplicate
    // rather than one copy per press.
    commitEditorDocument(
      "editor.clipboard.change",
      setDoc,
      ops.withNodes(doc, out),
    );
    // Keep the same selection units active after duplication. Filtering out
    // containers here deselected a duplicated frame/group entirely, while
    // selecting every copied leaf instead of the user's original selection.
    const newDuplicateIds = selectedIds
      .map((id) => copiesById.get(id)?.id)
      .filter(Boolean);

    powerDuplicateState = {
      lastDuplicateIds: newDuplicateIds,
      initialPositions: new Map(
        [...copiesById.values()].map((copy) => [
          copy.id,
          {
            x: copy.x ?? 0,
            y: copy.y ?? 0,
            rotation: copy.rotation ?? 0,
            width: copy.width ?? 0,
            height: copy.height ?? 0,
          },
        ]),
      ),
      lastDelta:
        offsetX !== 0 ||
        offsetY !== 0 ||
        offsetRotation !== 0 ||
        scaleX !== 1 ||
        scaleY !== 1
          ? {
              dx: offsetX,
              dy: offsetY,
              drot: offsetRotation,
              scaleX,
              scaleY,
            }
          : null,
    };

    selectMany(newDuplicateIds);
  }

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
    const selectedIds = selection.getIds();
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
      const svgMarkup = nodesToSvg(nodesToCopy);
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
    const selectedIds = selection.getIds();
    if (selectedIds.length === 0) return null;
    const setIds = ops.moveAffectedIds(doc, selectedIds);
    const set = new Set(setIds);
    const nodesToCopy = doc.nodes
      .filter((n) => set.has(n.id))
      .map((n) => JSON.parse(JSON.stringify(n)));
    const svgMarkup = nodesToSvg(nodesToCopy);
    if (svgMarkup) {
      await writeSvgToSystemClipboard(svgMarkup);
      return svgMarkup;
    }
    return null;
  }

  function getSelectedSvg() {
    const doc = getDoc();
    const selectedIds = selection.getIds();
    if (selectedIds.length === 0) return "";
    const setIds = ops.moveAffectedIds(doc, selectedIds);
    const set = new Set(setIds);
    const nodesToCopy = doc.nodes
      .filter((n) => set.has(n.id))
      .map((n) => JSON.parse(JSON.stringify(n)));
    return nodesToSvg(nodesToCopy);
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
    const doc = getDoc();
    const copiesById = new Map();
    const center = getViewportCenter?.();
    const bounds = layerClipboard.nodes.reduce(
      (result, node) => ({
        minX: Math.min(result.minX, node.x ?? 0),
        minY: Math.min(result.minY, node.y ?? 0),
        maxX: Math.max(result.maxX, (node.x ?? 0) + (node.width ?? 0)),
        maxY: Math.max(result.maxY, (node.y ?? 0) + (node.height ?? 0)),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const offsetX = Number.isFinite(center?.x)
      ? center.x - (bounds.minX + bounds.maxX) / 2
      : 20;
    const offsetY = Number.isFinite(center?.y)
      ? center.y - (bounds.minY + bounds.maxY) / 2
      : 20;
    for (const node of layerClipboard.nodes) {
      const copy = {
        ...JSON.parse(JSON.stringify(node)),
        id: crypto.randomUUID(),
        locked: false,
        x: (node.x ?? 0) + offsetX,
        y: (node.y ?? 0) + offsetY,
      };
      copiesById.set(node.id, copy);
    }
    for (const copy of copiesById.values()) {
      if (copy.parentId) {
        copy.parentId =
          copiesById.get(copy.parentId)?.id ??
          (doc.canvasId && doc.canvasId === layerClipboard.sourceCanvasId
            ? copy.parentId
            : null);
      }
      if (copy.clipTo) {
        copy.clipTo =
          copiesById.get(copy.clipTo)?.id ??
          (doc.canvasId && doc.canvasId === layerClipboard.sourceCanvasId
            ? copy.clipTo
            : null);
      }
    }
    const newNodes = [...doc.nodes, ...copiesById.values()];
    commitEditorDocument(
      "editor.clipboard.change",
      setDoc,
      ops.withNodes(doc, newNodes),
    );
    // Keep the pasted selection at the same hierarchy level as the copied units.
    selectMany(
      [...copiesById.values()]
        .filter((copy) => !copiesById.has(copy.parentId))
        .map((copy) => copy.id),
    );
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
