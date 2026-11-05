/** Content and selection handles take precedence over dragging the artboard. */
export function shouldDragArtboardBody(engine, clientX, clientY, isFrameFocused = false) {
  if (!engine?.toDocPoint || !engine?.nodeAtPoint) return false;
  if (engine.hasHandleUnder?.({ clientX, clientY })) return false;
  // An unbounded root is the workspace, never a draggable artboard surface.
  if (engine.getDocument?.()?.isCanvasRoot) return false;
  // Path editing owns its midpoint/handle hit targets, including empty pixels.
  if (engine.isEditing?.()) return false;
  const point = engine.toDocPoint(clientX, clientY);
  // A selection elsewhere in the frame must not block dragging its empty
  // surface. Only artwork under the pointer owns this gesture.
  // Locked artwork still occupies the frame; move the frame via its title.
  const hit = engine.nodeAtPoint(point, { includeLocked: true });
  if (!hit) return true;
  // If the frame itself is already focused/selected and the hit artwork is not independently selected,
  // dragging the frame area moves the frame (Figma/FigCraft parity).
  if (isFrameFocused && !engine.isSelected?.(hit.id)) return true;
  return false;
}
