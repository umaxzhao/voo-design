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

/**
 * Lookup tables for one objects array, built once and reused by every row of
 * the same render. Without them each row rescans the whole document, which is
 * quadratic on a page with thousands of layers.
 */
const indexCache = new WeakMap();

function indexOf(objects) {
  let index = indexCache.get(objects);
  if (index) return index;
  const byId = new Map();
  const position = new Map();
  const childrenMap = new Map();
  objects.forEach((object, at) => {
    byId.set(object.id, object);
    position.set(object.id, at);
    if (!object.parentId) return;
    if (!childrenMap.has(object.parentId)) childrenMap.set(object.parentId, []);
    childrenMap.get(object.parentId).push(object);
  });
  index = { byId, position, childrenMap, artworkIds: new Map() };
  indexCache.set(objects, index);
  return index;
}

/** Every artwork id inside a folder, at any depth — its selection test. */
export function groupArtworkIds(objects, groupId) {
  const index = indexOf(objects);
  const cached = index.artworkIds.get(groupId);
  if (cached) return cached;
  const out = [];
  const walk = (id) => {
    for (const child of index.childrenMap.get(id) ?? []) {
      if (isGroupNode(child)) walk(child.id);
      else out.push(child.id);
    }
  };
  walk(groupId);
  index.artworkIds.set(groupId, out);
  return out;
}

/**
 * True when an ancestor folder of `node` has every one of its members
 * selected — the shape a canvas unit-selection leaves behind.
 *
 * Checks every ancestor, not just the immediate parent, so a member nested
 * two folders deep still defers to the outermost folder that is wholly lit.
 */
function coveredByWholeFolder(objects, node, chosen) {
  if (chosen.size === 0) return false;
  const { byId } = indexOf(objects);
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

/** The selected-id set for `selectedIds`, cached per array so rows share it. */
const chosenCache = new WeakMap();

function chosenOf(selectedIds) {
  let chosen = chosenCache.get(selectedIds);
  if (!chosen) {
    chosen = new Set(selectedIds);
    chosenCache.set(selectedIds, chosen);
  }
  return chosen;
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
  const chosen = chosenOf(selectedIds);
  if (!isGroupNode(node)) {
    // A member whose folder is lit as a whole unit defers to that folder's
    // row, so a group selection reads as one selected thing.
    if (coveredByWholeFolder(objects, node, chosen)) return false;
    const docIndex = indexOf(objects).position.get(node.id) ?? -1;
    return (
      chosen.has(node.id) ||
      (docIndex === activeIndex && !isBackgroundSelected)
    );
  }

  const ids = groupArtworkIds(objects, node.id);
  return (
    node.id === isolationGroupId ||
    (ids.length > 0 && ids.every((id) => chosen.has(id)))
  );
}
