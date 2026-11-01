import * as ops from "./doc_ops.js";
import { isLockedByGroup } from "./scene_model.js";
import { isFrameSelectionBoundary } from "./frame-selection-unit.js";
import { captureMoveGestureFrame, moveGestureIds } from "./move_gesture.js";
import { beginAltDuplicate } from "./move-gesture-transaction.js";

const frameMoveEvents = new WeakMap();
export const frameMoveId = event => frameMoveEvents.get(event?.nativeEvent ?? event);

/** Title gestures reuse the native stage controller and its real pointer capture. */
export function createFrameMoveEvent(stage, event, frameId) {
  const native = event.nativeEvent ?? event;
  const forwarded = { target: stage, preventDefault: () => native.preventDefault() };
  for (const field of ["type", "button", "buttons", "pointerId", "pointerType", "clientX", "clientY",
    "shiftKey", "altKey", "ctrlKey", "metaKey", "pressure", "isPrimary"]) forwarded[field] = native[field];
  frameMoveEvents.set(forwarded, frameId);
  return forwarded;
}

/** Start one shared move/Alt-duplicate transaction; return false only for empty space. */
export function startNodeMoveGesture({ api, event, point, setGesture }) {
  const forcedId = frameMoveId(event);
  const actualHit = forcedId
    ? api.getDocument().nodes.find(node => node.id === forcedId)
    : api.nodeAtPoint(point);
  if (!actualHit) return Boolean(forcedId);
  const doc = api.getDocument();
  if (forcedId && (!isFrameSelectionBoundary(actualHit) || actualHit.visible === false ||
      actualHit.locked || actualHit.lockPosition || isLockedByGroup(doc, actualHit))) return true;
  if (forcedId && !api.isSelected(actualHit.id)) api.selectExactly([actualHit.id]);
  let hit = actualHit;
  // A drag carries the explicit selection even when its primary is another Frame.
  // Plain release still enters the original child; deep selection bypasses promotion.
  if (!forcedId && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    const selectedIds = new Set(api.getSelectedIds?.() ?? []);
    const byId = new Map(doc.nodes.map(node => [node.id, node]));
    const seen = new Set();
    for (let node = actualHit; node && !seen.has(node.id); node = byId.get(node.parentId)) {
      if (selectedIds.has(node.id) && isFrameSelectionBoundary(node) &&
          !node.locked && !node.lockPosition && !isLockedByGroup(doc, node)) {
        hit = node;
        break;
      }
      seen.add(node.id);
    }
  }
  const altTargetLocked =
    event.altKey &&
    api.getDocument().nodes.find((node) => node.id === hit.id)
      ?.lockPosition === true;
  const target = hit;
  let duplicateOnMove = false;
  if (event.altKey && !altTargetLocked) {
    const currentSelected = api.getSelectedNodes?.() ?? [];
    const isHitInMultiSelection =
      currentSelected.length > 1 &&
      currentSelected.some((n) => n.id === hit.id);

    if (!isHitInMultiSelection && !api.isSelected(hit.id)) {
      api.select(hit.id);
    }
    duplicateOnMove = true;
  }

  const deepSelect = !forcedId && Boolean(event.metaKey || event.ctrlKey);
  if (!forcedId && event.shiftKey && !duplicateOnMove) {
    if (deepSelect && typeof api.toggleExactly === "function") {
      api.toggleExactly(target.id);
    } else if (api.toggleSelect) {
      api.toggleSelect(target.id);
    } else if (api.toggleSelected) {
      api.toggleSelected(target.id);
    }
    if (!api.isSelected(target.id)) return true;
  } else if (!api.isSelected(target.id)) {
    if (deepSelect && typeof api.selectExactly === "function") {
      api.selectExactly([target.id]);
    } else {
      api.select(target.id);
    }
  }

  const moving = api.getSelectedNodes();
  const base = moving.length > 0 ? moving : [{ ...hit, id: target.id }];
  const docNow = api.getDocument();
  const selectedGroup = api.getSelectedGroup?.();
  const setIds = duplicateOnMove
    ? ops.moveAffectedIds(docNow, selectedGroup ? [selectedGroup.id] : base.map(node => node.id))
    : moveGestureIds(api, docNow, base);
  if (setIds.length === 0) return true;
  const frame = captureMoveGestureFrame(docNow, setIds);

  if (frame.origins.length > 0) {
    setGesture({
      kind: "move",
      clickTargetId: !forcedId && !event.altKey && hit.id !== actualHit.id ? actualHit.id : null,
      id: target.id,
      origins: frame.origins,
      start: point,
      origin: { x: hit.x, y: hit.y },
      lastX: point.x,
      lastY: point.y,
      moved: false,
      duplicated: false,
      beginDuplicate: duplicateOnMove ? gesture => beginAltDuplicate(api, gesture) : null,
    });
  }
  return true;
}
