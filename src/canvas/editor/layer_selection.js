/**
 * The layers panel's row-selection tests, as pure data.
 *
 * The panel row and the canvas select by different rules on purpose: the
 * canvas picks *units* — a click inside a folder selects the folder — while
 * the panel targets individual layers, the way Photoshop lets a row pick
 * what the canvas auto-select would widen. `isRowSelected` is the single
 * place that reconciles the two views, so a change to either side's rule
 * shows up here as a change to the row highlight rather than a drift.
 *
 * Pure functions, no React and no DOM, so the node:test suite drives them
 * directly.
 */

import { isGroupNode } from "./scene_model.js";

/** Every artwork id inside a folder, at any depth — its selection test. */
export function groupArtworkIds(objects, groupId) {
  const childrenMap = new Map();
  for (const object of objects) {
    if (!object.parentId) continue;
    if (!childrenMap.has(object.parentId)) childrenMap.set(object.parentId, []);
    childrenMap.get(object.parentId).push(object);
  }
  const out = [];
  const walk = (id) => {
    for (const child of childrenMap.get(id) ?? []) {
      if (isGroupNode(child)) walk(child.id);
      else out.push(child.id);
    }
  };
  walk(groupId);
  return out;
}

/**
 * True when an ancestor folder of `node` has every one of its members
 * selected — the shape a canvas unit-selection leaves behind.
 *
 * Checks every ancestor, not just the immediate parent, so a member nested
 * two folders deep still defers to the outermost folder that is wholly lit.
 */
function coveredByWholeFolder(objects, node, selectedIds) {
  if (selectedIds.length === 0) return false;
  const byId = new Map(objects.map((object) => [object.id, object]));
  const chosen = new Set(selectedIds);
  let parentId = node.parentId;
  const seen = new Set();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const ids = groupArtworkIds(objects, parentId);
    if (ids.length > 0 && ids.every((id) => chosen.has(id))) return true;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return false;
}

/**
 * Whether the panel paints `node`'s row as selected.
 *
 * A folder row is selected when every artwork inside it is, because the
 * canvas selects folders as units and the row has to say so; and
 * additionally when the folder is the isolation group.
 *
 * An artwork row is selected when its id is in the set, or when it is the
 * primary selection — the row the property panel shows values for — *unless*
 * a folder above it is already lit as a whole unit. Picking a group on the
 * canvas puts every member in the set, and lighting the members as well
 * would say "these three layers are selected" when what the user selected is
 * one thing: the folder. Only the folder lights.
 *
 * Isolation is the case that still lights both. Double-clicking into a
 * folder selects one member, so the folder is no longer wholly selected: the
 * member's row lights for what is being edited, and the folder's row lights
 * because it is the isolation group, which is what tells the user where they
 * are. That is Figma's panel.
 *
 * @returns {boolean} true when the row should paint as selected.
 */
export function isRowSelected(
  objects,
  node,
  {
    selectedIds = [],
    activeIndex = -1,
    isBackgroundSelected = false,
    isolationGroupId = null,
  } = {},
) {
  if (!isGroupNode(node)) {
    // A member whose folder is lit as a whole unit defers to that folder's
    // row, so a group selection reads as one selected thing.
    if (coveredByWholeFolder(objects, node, selectedIds)) return false;
    const docIndex = objects.findIndex((object) => object.id === node.id);
    return (
      selectedIds.includes(node.id) ||
      (docIndex === activeIndex && !isBackgroundSelected)
    );
  }

  const ids = groupArtworkIds(objects, node.id);
  return (
    node.id === isolationGroupId ||
    (ids.length > 0 && ids.every((id) => selectedIds.includes(id)))
  );
}
