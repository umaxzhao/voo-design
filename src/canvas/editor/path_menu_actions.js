/**
 * Decides which path operations the context menu offers for a selection.
 *
 * Kept free of JSX so the rules can be unit-tested without a DOM. The menu
 * component only renders what this module returns.
 */

/** Amount, in document units, for the menu's outset / inset entries. */
export const PATH_OFFSET_AMOUNT = 4;

export const PATH_MENU_ACTION = Object.freeze({
  SIMPLIFY: "simplify",
  REVERSE: "reverse",
  JOIN: "join",
  TOGGLE_CLOSE: "toggleClose",
  OUTSET: "outset",
  INSET: "inset",
});

/** A pen path is closed when its last anchor carries the close flag. */
export function isClosedPath(node) {
  return node?.points?.[node.points.length - 1]?.close === true;
}

function isPathNode(node) {
  return node?.kind === "path" && Array.isArray(node.points) && node.points.length > 0;
}

/**
 * Path actions for the given selected nodes, in menu order.
 * Two or more selected paths offer only Join; a single path offers the rest,
 * and the offset entries only when the path is closed.
 */
export function pathMenuActions(selectedNodes) {
  const nodes = Array.isArray(selectedNodes) ? selectedNodes : [];
  if (nodes.length === 0 || !nodes.every(isPathNode)) return [];
  if (nodes.length >= 2) return [PATH_MENU_ACTION.JOIN];
  const [path] = nodes;
  const actions = [
    PATH_MENU_ACTION.SIMPLIFY,
    PATH_MENU_ACTION.REVERSE,
    PATH_MENU_ACTION.TOGGLE_CLOSE,
  ];
  if (isClosedPath(path)) {
    actions.push(PATH_MENU_ACTION.OUTSET, PATH_MENU_ACTION.INSET);
  }
  return actions;
}
