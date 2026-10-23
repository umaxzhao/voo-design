// Inspector subscriptions need document edits/undo, while DOM layer renderers
// also need camera-only frames. Keep those subscription requirements explicit.
export function documentRenderListener(getDoc, listener) {
  let previous = getDoc();
  return () => {
    const next = getDoc();
    if (next === previous) return;
    previous = next;
    listener();
  };
}
