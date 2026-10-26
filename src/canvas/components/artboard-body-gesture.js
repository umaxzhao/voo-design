/** Content and selection handles take precedence over dragging the artboard. */
export function shouldDragArtboardBody(engine, clientX, clientY) {
  if (!engine?.toDocPoint || !engine?.nodeAtPoint) return false;
  if ((engine.getSelectedIds?.().length ?? 0) > 0) return false;
  const point = engine.toDocPoint(clientX, clientY);
  // Locked artwork still occupies the frame; move the frame via its title.
  return !engine.nodeAtPoint(point, { includeLocked: true });
}
