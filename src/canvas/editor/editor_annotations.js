/**
 * Reference regions and text editing: the two node kinds whose editing
 * hand-off lives partly in the DOM.
 *
 * Regions are labelled boxes that describe parts of the picture to the model;
 * text nodes are edited through a textarea overlay. Both keep their "which
 * node is being edited right now" state here and hand the engine finished
 * values, so a drag or a typing session collapses into one history entry.
 */

import * as ops from "./doc_ops.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import {
  getRegionColor,
  MIN_REGION_SIZE,
} from "./scene_model_core.js";
import {
  createRegionNode,
  findNode,
} from "./scene_model.js";

/**
 * The extent of a region in its own (host-image) pixels. A freehand region
 * is its point chain's box; a box region is itself.
 */
function regionBounds(node) {
  if (Array.isArray(node.points) && node.points.length > 0) {
    const box = node.points.reduce(
      (acc, point) => {
        acc.x = Math.min(acc.x, point.x);
        acc.y = Math.min(acc.y, point.y);
        acc.width = Math.max(acc.width, point.x);
        acc.height = Math.max(acc.height, point.y);
        return acc;
      },
      { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity },
    );
    return {
      x: box.x,
      y: box.y,
      width: box.width - box.x,
      height: box.height - box.y,
    };
  }
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function createAnnotations({
  getDoc,
  setDoc,
  select: selectProp,
  selection,
  notify,
  requestRender,
}) {
  const select = (id) => {
    if (typeof selectProp === "function") {
      selectProp(id);
    } else if (selection?.selectNode) {
      selection.selectNode(id);
    }
  };

  let editingTextId = null;
  let editingRegionId = null;

  /**
   * Places a reference region on a picture.
   *
   * Created uncommitted while the pointer is still down: the drag resizes this
   * very node, so the whole gesture collapses into one history entry when
   * `finishRegion` accepts it. The box (and a freehand region's `points`)
   * live in the host image's own pixels — see createRegionNode.
   */
  function addRegion(
    rect,
    { hostId = null, points, shape, commit = false } = {},
  ) {
    const existingRegions = getDoc().nodes.filter(
      (node) => node.kind === "region",
    );
    const colorInfo = getRegionColor(existingRegions.length);
    const node = createRegionNode({
      ...rect,
      label: "",
      hostId,
      points,
      shape,
      color: colorInfo.hex,
      colorName: colorInfo.name,
    });
    const next = ops.addNode(getDoc(), node);
    if (commit) {
      commitEditorDocument("editor.annotation.change", setDoc, next, {
        commit: true,
      });
    } else {
      setDoc(next, { commit: false });
    }
    select(node.id);
    return node;
  }

  /**
   * Ends a region drag. A shape too small to be meaningful is thrown away
   * rather than left on the page as an unnoticed empty instruction.
   *
   * The region stays on the page, selected, once the drag is accepted — no
   * label editor jumps in. Naming is a separate, deliberate step (double-click
   * the region or pick it in the layers panel), because a region is useful
   * before it has a label: the AI cutout runs on the box alone, and a box the
   * user just drew vanishing the moment they click away from an input field
   * reads as the tool failing.
   */
  function finishRegion(id) {
    const node = findNode(getDoc(), id);
    if (!node) return false;
    const box = regionBounds(node);
    if (box.width < MIN_REGION_SIZE || box.height < MIN_REGION_SIZE) {
      setDoc(ops.removeNode(getDoc(), id), { commit: false });
      select(null);
      return false;
    }
    // The region stays selected but no label editor jumps in: naming is the
    // deliberate double-click step (see the contract above and its tests).
    requestRender();
    notify();
    return true;
  }

  function beginRegionLabelEdit(id) {
    editingRegionId = id;
    requestRender();
    notify();
  }

  /**
   * Sets what a region asks the model to do, without ending the edit — the
   * picker sits beside the field and is used while writing.
   */
  function setRegionIntent(intent) {
    const id = editingRegionId;
    if (!id || !findNode(getDoc(), id)) return;
    setDoc(ops.updateNode(getDoc(), id, { intent }), { commit: false });
    notify();
  }

  /** An unlabelled region says nothing to the model, so it is not kept. */
  function endRegionLabelEdit(label) {
    const id = editingRegionId;
    editingRegionId = null;
    if (!id) return;
    if (!findNode(getDoc(), id)) return;
    const trimmed = label.trim();
    if (!trimmed) {
      commitEditorDocument(
        "editor.annotation.change",
        setDoc,
        ops.removeNode(getDoc(), id),
      );
      select(null);
      return;
    }
    commitEditorDocument(
      "editor.annotation.change",
      setDoc,
      ops.updateNode(getDoc(), id, { label: trimmed }),
    );
  }

  function beginTextEdit(id) {
    editingTextId = id;
    requestRender();
    notify();
  }

  function updateTextEdit(text) {
    const id = editingTextId;
    if (!id) return;
    const node = findNode(getDoc(), id);
    if (!node) return;
    setDoc(ops.updateNode(getDoc(), id, { text }), { commit: false });
  }

  function endTextEdit(text) {
    const id = editingTextId;
    editingTextId = null;
    if (!id) return;
    const node = findNode(getDoc(), id);
    if (!node) return;
    // An emptied text box is a cancelled one — leave nothing behind.
    if (text !== undefined && !text.trim()) {
      commitEditorDocument(
        "editor.annotation.change",
        setDoc,
        ops.removeNode(getDoc(), id),
      );
      select(null);
      return;
    }
    if (text !== undefined) {
      commitEditorDocument(
        "editor.annotation.change",
        setDoc,
        ops.updateNode(getDoc(), id, { text }),
      );
    } else if (!String(node.text ?? "").trim()) {
      // A close without an editor value (tool switch, editor teardown) that
      // nobody ever typed into — the click-open of the text tool — is a
      // cancelled gesture too: an invisible 0×0 empty layer is a leak.
      commitEditorDocument(
        "editor.annotation.change",
        setDoc,
        ops.removeNode(getDoc(), id),
      );
      select(null);
    }
  }

  return {
    getEditingTextId: () => editingTextId,
    getEditingRegionId: () => editingRegionId,
    api: {
      addRegion,
      finishRegion,
      beginRegionLabelEdit,
      endRegionLabelEdit,
      setRegionIntent,
      beginTextEdit,
      updateTextEdit,
      endTextEdit,
    },
  };
}
