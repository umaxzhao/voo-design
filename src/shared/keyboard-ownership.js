/** IME candidates own their keys, including browsers reporting only keyCode 229. */
export function isComposingKey(event, composing = false) {
  return composing || event.isComposing || event.keyCode === 229;
}

/** Controls keep Space for activation; it must not arm a canvas hand tool. */
export function isPanControlTarget(target) {
  return Boolean(
    target?.isContentEditable ||
    target?.closest?.(
      'input, textarea, select, button, a[href], [contenteditable], [role="button"], [role="textbox"], [role="menu"], [role="listbox"], [role="dialog"], [data-modal-overlay], [data-settings-drawer], [data-presentation-overlay]',
    ),
  );
}
