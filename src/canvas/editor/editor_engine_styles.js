/** Engine controller for copy/paste appearance and "select same". */

import { findNode } from "./scene_model.js";
import { copyStyleFrom, pasteStyleInto, selectSame } from "./style_clipboard.js";

export function createEngineStyleController({
  getDoc,
  setDoc,
  selection,
  selectMany,
  notify,
  requestRender,
}) {
  let styleClipboard = null;

  const selectedNode = () => {
    const id = selection?.getId?.();
    return id ? findNode(getDoc(), id) : null;
  };

  return {
    /** Copies the selected layer's appearance; returns false without a selection. */
    copyStyle() {
      const node = selectedNode();
      const style = copyStyleFrom(node);
      if (!style) return false;
      styleClipboard = style;
      notify?.();
      return true;
    },

    /** Applies the last copied appearance to the whole selection (one undo step). */
    pasteStyle() {
      const ids = selection?.getIds?.() ?? [];
      if (!styleClipboard || ids.length === 0) return false;
      const next = pasteStyleInto(getDoc(), ids, styleClipboard);
      if (next === getDoc()) return false;
      setDoc(next, { name: "editor.history.entry.pasteStyle" });
      notify?.();
      requestRender?.();
      return true;
    },

    hasStyleClipboard: () => Boolean(styleClipboard),

    /**
     * Selects every layer sharing a fill/stroke/font/kind with the selected
     * layer. Returns the matching ids (empty when there is nothing to match).
     */
    selectSame(criteria) {
      const source = selectedNode();
      if (!source) return [];
      const matches = selectSame(getDoc(), source, criteria);
      if (matches.length === 0) return [];
      // The selected layer stays in the set: "select same" grows the selection.
      const ids = [source.id, ...matches];
      selectMany?.(ids);
      notify?.();
      requestRender?.();
      return ids;
    },
  };
}
