
/** Return true when this ordered shortcut stage owns the event. */
export function handleViewShortcut(event, context) {
  const { engine, onToggleRulers, onToggleGuides, onClearGuides, onToggleSnapToGrid, onToggleComments, onToggleCommentMode, onCreateComponent, onDetachInstance } = context;
  // Canvas view aids. Bindings avoid the browser's own ⌘R reload and the
  // grid/snap pair already taken by ⌘' and ⇧⌘':
  //   ⇧R        show/hide rulers          (Figma's binding)
  //   ⌘;        show/hide guides
  //   ⌥⌘;       clear all guides
  //   ⌥⌘'       snap to grid
  {
    const modifier = event.metaKey || event.ctrlKey;
    if (
      !modifier &&
      !event.altKey &&
      event.shiftKey &&
      event.code === "KeyR" &&
      onToggleRulers
    ) {
      event.preventDefault();
      onToggleRulers();
      return true;
    }
    if (
      modifier &&
      !event.altKey &&
      !event.shiftKey &&
      event.code === "Semicolon" &&
      onToggleGuides
    ) {
      event.preventDefault();
      onToggleGuides();
      return true;
    }
    if (
      modifier &&
      event.altKey &&
      !event.shiftKey &&
      event.code === "Semicolon" &&
      onClearGuides
    ) {
      event.preventDefault();
      onClearGuides();
      return true;
    }
    if (
      modifier &&
      event.altKey &&
      !event.shiftKey &&
      (event.code === "Quote" || event.key === "'") &&
      onToggleSnapToGrid
    ) {
      event.preventDefault();
      onToggleSnapToGrid();
      return true;
    }
    // Comments: ⌥⌘M opens the thread list, ⌥⌘⇧M arms placement. Alt is
    // required because ⌘M is the OS "minimise window" on macOS.
    if (
      modifier &&
      event.altKey &&
      event.shiftKey &&
      event.code === "KeyM" &&
      onToggleCommentMode
    ) {
      event.preventDefault();
      onToggleCommentMode();
      return true;
    }
    if (
      modifier &&
      event.altKey &&
      !event.shiftKey &&
      event.code === "KeyM" &&
      onToggleComments
    ) {
      event.preventDefault();
      onToggleComments();
      return true;
    }
  }

  if (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    event.code === "KeyI"
  ) {
    event.preventDefault();
    if (engine.getPixelSelection?.()?.contours?.length) {
      void engine.invertPixelSelection?.();
      return true;
    }
    const selected = engine.getSelected?.();
    if (selected?.id) {
      void engine.invertMask?.(selected.id);
    }
    return true;
  }

  // Figma's component keys: Cmd/Ctrl+Alt+K creates, Cmd/Ctrl+Alt+B detaches.
  if ((event.metaKey || event.ctrlKey) && event.altKey) {
    if (event.code === "KeyK" && onCreateComponent) {
      event.preventDefault();
      onCreateComponent();
      return true;
    }
    if (event.code === "KeyB" && onDetachInstance) {
      const selected = engine.getSelected();
      if (selected?.kind === "canvasInstance") {
        event.preventDefault();
        onDetachInstance(selected.id);
        return true;
      }
    }
  }


  return false;
}
