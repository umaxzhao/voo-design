/**
 * Whether a finishing layer rename may hand focus back to the Layers list.
 *
 * Renames are committed from `blur`, so the user may already have clicked the
 * next control (a numeric field, another layer name, the canvas). Restoring the
 * list with an unconditional animation frame would steal that new focus and
 * turn the following characters into canvas shortcuts. Reclaim focus only when
 * nothing else took it.
 */
export function shouldRestoreLayerListFocus(list, activeElement) {
  if (!list) return false;
  const body = list.ownerDocument?.body;
  if (!activeElement || activeElement === body || activeElement === list) {
    return true;
  }
  return list.contains(activeElement);
}

/** Focus the Layers list when the completed rename still owns focus. */
export function restoreLayerListFocus(listRef) {
  const list = listRef?.current;
  if (!list) return false;
  if (!shouldRestoreLayerListFocus(list, list.ownerDocument?.activeElement)) {
    return false;
  }
  list.focus?.();
  return true;
}
