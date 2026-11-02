export function handleLayerRenameKeyDown(event, cancelRenameRef) {
  if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) {
    return false;
  }
  if (event.key === "Enter") {
    event.currentTarget?.blur();
    return true;
  }
  if (event.key === "Escape") {
    if (cancelRenameRef) cancelRenameRef.current = true;
    event.currentTarget?.blur();
    return true;
  }
  return false;
}
