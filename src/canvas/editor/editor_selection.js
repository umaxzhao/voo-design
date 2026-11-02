/**
 * What the editor currently has selected.
 *
 * The panel can target either nodes or the document background, and the two
 * are mutually exclusive — picking one has to clear the other. Keeping that
 * rule in one small state machine (rather than a node id in the engine plus a
 * boolean in React) is what stops the property panel from showing background
 * colour while a layer is selected.
 *
 * Several nodes can be selected at once, which is what operations on more
 * than one shape — combining, aligning, distributing — are expressed against.
 * The set is ordered by when each node was picked, and the last one picked is
 * the *primary*: the one a single-target action still acts on, and the one
 * whose values the property panel shows. `getId()` returns exactly that, so
 * every caller written against a single selection keeps working unchanged and
 * only code that genuinely handles a set reaches for `getIds()`.
 *
 * Pure state, no canvas and no React, so the node:test suite drives it
 * directly.
 */

export const SELECTION_KIND = {
  NONE: "none",
  NODE: "node",
  BACKGROUND: "background",
};

export function createSelection(options = {}) {
  let kind = SELECTION_KIND.NONE;
  /** Ordered by when each node was picked; the last is the primary. */
  let ids = [];
  const onChange =
    typeof options === "function" ? options : options?.onChange;

  const primary = () => (ids.length > 0 ? ids[ids.length - 1] : null);

  /** True when the set actually changed, which is what drives a repaint. */
  const commit = (nextIds) => {
    const nextKind =
      nextIds.length > 0 ? SELECTION_KIND.NODE : SELECTION_KIND.NONE;
    if (
      kind === nextKind &&
      ids.length === nextIds.length &&
      ids.every((id, index) => id === nextIds[index])
    ) {
      return false;
    }
    kind = nextKind;
    ids = nextIds;
    onChange?.(ids);
    return true;
  };

  return {
    get() {
      return { kind, id: primary(), ids: [...ids] };
    },

    /**
     * The primary selected node id, or null when nothing or the background is
     * picked. With several nodes selected this is the last one picked.
     */
    getId() {
      return kind === SELECTION_KIND.NODE ? primary() : null;
    },

    /** Every selected node id, oldest pick first. Empty unless nodes are picked. */
    getIds() {
      return kind === SELECTION_KIND.NODE ? [...ids] : [];
    },

    isSelected(id) {
      return kind === SELECTION_KIND.NODE && ids.includes(id);
    },

    isBackground() {
      return kind === SELECTION_KIND.BACKGROUND;
    },

    /**
     * Selects exactly one node, or clears the selection when given null.
     *
     * Either way the background is deselected: a click on the canvas must not
     * leave the panel pointing at the page behind it.
     *
     * @returns {boolean} true when the selection actually changed.
     */
    selectNode(nextId) {
      return commit(nextId ? [nextId] : []);
    },

    /**
     * Selects a whole set at once — what a marquee drag ends with.
     *
     * Duplicates are dropped and the surviving order is the order given, so
     * the caller decides which node ends up primary by putting it last.
     *
     * @returns {boolean} true when the selection actually changed.
     */
    selectNodes(nextIds) {
      return commit([...new Set(nextIds ?? [])]);
    },

    /**
     * Adds a node to the selection, or removes it when it is already there —
     * a shift-click.
     *
     * Adding makes the node primary, because it is the one just picked.
     * Removing the primary hands that role back to whatever was picked before
     * it, so the panel keeps pointing at something real.
     *
     * @returns {boolean} true when the selection actually changed.
     */
    toggleNode(id) {
      if (!id) return false;
      return commit(
        ids.includes(id) ? ids.filter((each) => each !== id) : [...ids, id],
      );
    },

    /**
     * Drops a node from the selection if it is in it — for a node that no
     * longer exists. A selection holding a deleted id would keep drawing an
     * outline around nothing.
     *
     * @returns {boolean} true when the selection actually changed.
     */
    forgetNode(id) {
      if (!ids.includes(id)) return false;
      return commit(ids.filter((each) => each !== id));
    },

    /** @returns {boolean} true when the selection actually changed. */
    selectBackground() {
      if (kind === SELECTION_KIND.BACKGROUND) return false;
      kind = SELECTION_KIND.BACKGROUND;
      ids = [];
      onChange?.([]);
      return true;
    },
  };
}
