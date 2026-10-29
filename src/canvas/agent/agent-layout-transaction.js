import { isFrameSelectionBoundary } from "../editor/frame-selection-unit.js";
import { moveAffectedIds, moveWithFollowers } from "../editor/doc_ops_move.js";
import { updateNode } from "../editor/doc_ops_nodes.js";
import { isLockedByGroup } from "../editor/scene_model.js";
import { reflowFrameNodeResize } from "../editor/document-resize-constraints.js";
import { commitEditorDocument } from "../undo-action-contracts.js";

/** Apply one MCP layout command as one undoable engine action. */
export function mutateLayerGeometry(editor, node, patch) {
  const doc = editor.getDoc?.() ?? editor.getDocument();
  const { x, y, ...geometryPatch } = patch;
  const deltaX = x === undefined ? 0 : x - node.x;
  const deltaY = y === undefined ? 0 : y - node.y;
  const moving = deltaX !== 0 || deltaY !== 0;
  if (moving) {
    const byId = new Map(doc.nodes.map((candidate) => [candidate.id, candidate]));
    // Reject the whole patch before any resize if the canvas move would fail.
    // This includes inherited locks and external/chained clip followers.
    const blocked = moveAffectedIds(doc, [node.id]).some((id) => {
      const candidate = byId.get(id);
      return candidate.locked || candidate.lockPosition || isLockedByGroup(doc, candidate);
    });
    if (blocked) return false;
  }

  // Compute every stage before publishing: move all canvas followers, then
  // resize from that translated box, with one final snapshot for undo/redo.
  let next = moving ? moveWithFollowers(doc, [node.id], deltaX, deltaY) : doc;
  if (isFrameSelectionBoundary(node)) {
    // Pure size changes keep the panel's existing pin policy for locked children.
    next = reflowFrameNodeResize(next, node.id, geometryPatch);
    const rest = Object.fromEntries(Object.entries(geometryPatch)
      .filter(([key]) => key !== "width" && key !== "height"));
    if (Object.keys(rest).length) next = updateNode(next, node.id, rest);
  } else if (Object.keys(geometryPatch).length) {
    next = updateNode(next, node.id, geometryPatch);
  }
  if (next !== doc) commitEditorDocument("editor.document.set", editor.setDoc, next);
  return true;
}
