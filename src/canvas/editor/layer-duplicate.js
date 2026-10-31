import { isContainerNode } from "./scene_model.js";
import * as ops from "./doc_ops.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import { cloneNodeForDuplicate, remapDuplicateReferences } from "./node-duplicate.js";

/** Per-editor Power Duplicate state stays independent of the shared clipboard. */
export function createLayerDuplicator({ getDoc, setDoc, getPixelSelection, layerFromSelection,
  getSelectedGroup, selectedUnitIds, selectGroup, selectMany }) {
  let powerDuplicateState = null;
  function duplicateSelected({ commit = true, repeatTransform = true } = {}) {
    if (getPixelSelection()?.contours?.length) {
      void layerFromSelection();
      return;
    }
    const doc = getDoc();
    const selectedGroup = getSelectedGroup?.();
    const selectedIds = selectedUnitIds();
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
      repeatTransform &&
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
      const detached = cloneNodeForDuplicate(node);
      const copy = {
        ...detached,
        x: (node.x ?? 0) + offsetX,
        y: (node.y ?? 0) + offsetY,
        ...(targetW !== undefined ? { width: targetW, baseWidth: targetW } : {}),
        ...(targetH !== undefined ? { height: targetH, baseHeight: targetH } : {}),
        ...(offsetRotation
          ? { rotation: ((node.rotation ?? 0) + offsetRotation) % 360 }
          : {}),
        points: detached.points
          ? detached.points.map((point) =>
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
      remapDuplicateReferences(copy, copiesById);
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
      commit ? undefined : { commit: false },
    );
    // Keep the same selection units active after duplication. Filtering out
    // containers here deselected a duplicated frame/group entirely, while
    // selecting every copied leaf instead of the user's original selection.
    const newDuplicateIds = selectedIds
      .map((id) => copiesById.get(id)?.id)
      .filter(Boolean);

    const selectCopies = () => {
      if (selectedGroup && selectGroup) selectGroup(newDuplicateIds[0]);
      else selectMany(newDuplicateIds);
    };
    // A cancelled pointer preview must not seed future Power Duplicate state.
    if (!commit) { selectCopies(); return; }

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

    selectCopies();
  }

  return duplicateSelected;
}
