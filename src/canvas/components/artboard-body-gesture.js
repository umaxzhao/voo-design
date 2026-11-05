import { isFrameSelectionBoundary } from "../editor/frame-selection-unit.js";

/** Content and selection handles take precedence over dragging the artboard. */
export function shouldDragArtboardBody(engine, clientX, clientY, isFrameFocused = false) {
  if (!engine?.toDocPoint || !engine?.nodeAtPoint) return false;
  if (engine.hasHandleUnder?.({ clientX, clientY })) return false;
  // An unbounded root is the workspace, never a draggable artboard surface.
  if (engine.getDocument?.()?.isCanvasRoot) return false;
  // Path editing owns its midpoint/handle hit targets, including empty pixels.
  if (engine.isEditing?.()) return false;
  const point = engine.toDocPoint(clientX, clientY);
  const hit = engine.nodeAtPoint(point, { includeLocked: true });
  // If no child artwork under pointer, clicking empty frame body drags the artboard.
  if (!hit) return true;
  // If the artwork hit is the frame itself (its background or frame container),
  // dragging moves the frame directly (matching Figma / FigCraft).
  if (isFrameSelectionBoundary(hit)) return true;
  return false;
}
