export function handleExportShortcut(event) {
  if ((event.type && event.type !== "keydown") || event.repeat) return false;
  if (event.code !== "KeyE" || !(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.isComposing) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.dispatchEvent(new CustomEvent("voo:editor-export"));
  return true;
}
