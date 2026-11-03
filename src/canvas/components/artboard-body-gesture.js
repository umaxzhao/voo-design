import { TOOL } from "../editor/editor_constants.js";

/** Content and selection handles take precedence over dragging the artboard.
 *
 * In default Select mode (TOOL.SELECT), artboard empty space is reserved for
 * marquee box selection of inner layers; artboard repositioning is handled via
 * its Frame title label handle.
 */
export function shouldDragArtboardBody(engine, clientX, clientY, activeTool = null) {
  if (activeTool === TOOL.SELECT) return false;
  if (!engine?.toDocPoint || !engine?.nodeAtPoint) return false;
  if (engine.hasHandleUnder?.({ clientX, clientY })) return false;
  // Path editing owns its midpoint/handle hit targets, including empty pixels.
  if (engine.isEditing?.()) return false;
  const point = engine.toDocPoint(clientX, clientY);
  // A selection elsewhere in the frame must not block dragging its empty
  // surface. Only artwork under the pointer owns this gesture.
  // Locked artwork still occupies the frame; move the frame via its title.
  return !engine.nodeAtPoint(point, { includeLocked: true });
}
