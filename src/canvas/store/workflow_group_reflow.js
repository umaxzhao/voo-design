/**
 * Group reflow engine: turns the waterfall math into restacked members.
 *
 * Every auto-layout trigger routes through reflowAutoLayoutGroups - member
 * join/leave, drag reorder, and member resize - so a Group's members stay
 * non-overlapping and inside the frame no matter what changed. The member
 * sequence lives on the Group as data.memberOrder, appended with any member
 * the order does not mention, so reload, undo/redo and collaboration rebuild
 * the same layout.
 *
 * Pure logic - zero React dependencies.
 *
 * @module store/workflow_group_reflow
 */
import { NODE_TYPE } from "../nodes/types.js";
import {
  WATERFALL_LAYOUT_DEFAULTS,
  computeWaterfallLayout,
  getNodeActualSize,
} from "./workflow_group_waterfall.js";

/**
 * Orders Group members by the Group's persisted `data.memberOrder`, appending
 * members the order does not mention (joins, migrations) in current array
 * order. The order is the sequence the waterfall packs columns from, so it is
 * what keeps reloads, undo/redo and collaboration layouts identical.
 */
export function orderedGroupMembers(group, members) {
  const order = group?.data?.memberOrder;
  if (!Array.isArray(order) || order.length === 0) return members;
  const byId = new Map(members.map((member) => [member.id, member]));
  const ordered = [];
  for (const id of order) {
    const member = byId.get(id);
    if (member) {
      ordered.push(member);
      byId.delete(id);
    }
  }
  for (const member of byId.values()) ordered.push(member);
  return ordered;
}

/** The waterfall settings of one Group, with columns clamped to its members. */
function groupWaterfallLayout(group, orderedMembers) {
  const configured = { ...(group.data?.outputLayout ?? {}) };
  const groupWidth =
    Number.parseFloat(group.style?.width) || group.width || undefined;
  const configuredCols = Number(configured.cols);
  const cols = Math.min(
    configuredCols > 0 ? configuredCols : WATERFALL_LAYOUT_DEFAULTS.cols,
    orderedMembers.length,
  );
  return computeWaterfallLayout(orderedMembers, {
    ...configured,
    cols,
    ...(groupWidth ? { groupWidth } : {}),
  });
}

/**
 * The single reflow used by every auto-layout trigger: member join/leave,
 * drag reorder, and member resize. For each affected Group that has auto
 * layout on (`autoLayout !== false`), members are packed in their order and
 * the container is fitted to the result; the order is then persisted on the
 * Group so the layout survives reload/undo/collaboration.
 *
 * `memberOrders` optionally overrides a Group's order (e.g. from a
 * drag-to-relocate drop point). Returns the same array when nothing reflowed
 * so callers can stay allocation-free; `onGroupReflow` fires once whenever a
 * reflow actually happened, letting callers persist a derived change that
 * carries no undo entry of its own.
 */
export function reflowAutoLayoutGroups(
  nodes,
  groupIds,
  { memberOrders = null, onGroupReflow = null } = {},
) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  const affected = new Set(
    Array.isArray(groupIds) ? groupIds : groupIds ? [groupIds] : [],
  );
  if (affected.size === 0) return nodes;

  const layouts = new Map();
  for (const node of nodes) {
    if (
      node.type !== NODE_TYPE.GROUP ||
      !affected.has(node.id) ||
      node.data?.autoLayout === false
    ) {
      continue;
    }
    const members = nodes.filter(
      (member) =>
        member.parentNode === node.id && member.type !== NODE_TYPE.GROUP,
    );
    // Keep an empty Group's user-chosen size. As soon as a member remains,
    // auto-layout owns both the child positions and the fit-to-content size.
    if (members.length === 0) continue;
    const override = memberOrders?.get?.(node.id);
    const ordered = Array.isArray(override)
      ? orderedGroupMembers({ data: { memberOrder: override } }, members)
      : orderedGroupMembers(node, members);
    layouts.set(node.id, {
      layout: groupWaterfallLayout(node, ordered),
      order: ordered.map((member) => member.id),
    });
  }
  if (layouts.size === 0) return nodes;
  onGroupReflow?.();

  return nodes.map((node) => {
    const entry = layouts.get(node.id);
    if (entry) {
      return {
        ...node,
        style: {
          ...(node.style ?? {}),
          width: entry.layout.groupW,
          height: entry.layout.groupH,
        },
        data: { ...(node.data ?? {}), memberOrder: entry.order },
      };
    }
    if (!node.parentNode || !layouts.has(node.parentNode)) {
      return node;
    }
    const position = layouts.get(node.parentNode).layout.positions.get(node.id);
    return position
      ? { ...node, position: { x: position.x, y: position.y } }
      : node;
  });
}

/**
 * Reflows auto-layout Groups affected by a member removal.
 *
 * The Group keeps its canvas position, while the remaining direct children are
 * packed again in their existing order and the container is resized to the
 * resulting bounds. Groups with autoLayout explicitly disabled keep their
 * manual positions and dimensions.
 */
export function reflowGroupsAfterMemberRemoval(
  previousNodes,
  nextNodes,
  removedNodeIds,
) {
  if (!Array.isArray(previousNodes) || !Array.isArray(nextNodes)) {
    return nextNodes;
  }
  const removedIds = new Set(
    Array.isArray(removedNodeIds) ? removedNodeIds : [],
  );
  if (removedIds.size === 0) return nextNodes;

  const affectedGroupIds = new Set(
    previousNodes
      .filter((node) => removedIds.has(node.id) && node.parentNode)
      .map((node) => node.parentNode),
  );
  if (affectedGroupIds.size === 0) return nextNodes;

  return reflowAutoLayoutGroups(nextNodes, [...affectedGroupIds]);
}

/**
 * Slot the waterfall assigns when `draggedId` is dropped inside its Group:
 * the column comes from the drop point's x, the place within that column from
 * its y (members counted by vertical centre). Translating (column, rank) back
 * into sequence index gives the new memberOrder; the reflow then snaps the
 * dragged card into it. Returns null when the drop is not a Group member.
 */
export function computeWaterfallDropOrder({
  nodes,
  groupId,
  draggedId,
  memberOrder = null,
}) {
  const group = nodes.find(
    (node) => node.id === groupId && node.type === NODE_TYPE.GROUP,
  );
  const dragged = nodes.find((node) => node.id === draggedId);
  if (!group || !dragged || dragged.parentNode !== groupId) return null;

  const rest = orderedGroupMembers(
    memberOrder ? { data: { memberOrder } } : group,
    nodes.filter(
      (member) =>
        member.parentNode === groupId &&
        member.type !== NODE_TYPE.GROUP &&
        member.id !== draggedId,
    ),
  );
  const configured = group.data?.outputLayout ?? {};
  const gap = Number(configured.gap) || WATERFALL_LAYOUT_DEFAULTS.gap;
  const pad = Number(configured.pad) || WATERFALL_LAYOUT_DEFAULTS.pad;
  const cellW = Number(configured.cellW) || WATERFALL_LAYOUT_DEFAULTS.cellW;
  const configuredCols = Number(configured.cols);
  const cols = Math.max(
    1,
    Math.min(
      configuredCols > 0 ? configuredCols : WATERFALL_LAYOUT_DEFAULTS.cols,
      rest.length + 1,
    ),
  );

  const size = getNodeActualSize(dragged);
  const centerX = (dragged.position?.x ?? 0) + size.width / 2;
  const centerY = (dragged.position?.y ?? 0) + size.height / 2;
  let col = 0;
  let bestDistance = Infinity;
  for (let c = 0; c < cols; c += 1) {
    const columnCenter = pad + c * (cellW + gap) + cellW / 2;
    const distance = Math.abs(centerX - columnCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      col = c;
    }
  }

  let rank = 0;
  rest.forEach((member, index) => {
    if (index % cols !== col) return;
    const memberSize = getNodeActualSize(member);
    const memberCenterY =
      (member.position?.y ?? 0) + memberSize.height / 2;
    if (memberCenterY < centerY) rank += 1;
  });

  const ids = rest.map((member) => member.id);
  ids.splice(Math.min(rank * cols + col, ids.length), 0, draggedId);
  return ids;
}
