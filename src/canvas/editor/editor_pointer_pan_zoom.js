/**
 * Pan / wheel zoom navigation gestures for the editor stage.
 *
 * Extracted from editor_pointer.js for modular pointer navigation control.
 */

import { wheelPanDelta, wheelZoomFactor } from "./editor_constants.js";

export function createPanPointerGestures({
  api,
  stage,
  onCanvas,
  screenPoint,
  setGesture,
}) {
  /** Wheel: Ctrl/⌘/Alt zooms, plain wheel pans (skips scrollable panels). */
  function onWheel(event) {
    // A scrollable panel over the stage keeps its own scrolling.
    if (!onCanvas(event)) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.altKey) {
      // Ctrl/⌘ is the trackpad pinch; Alt is the Photoshop wheel habit.
      api.zoomAt(wheelZoomFactor(event.deltaY), screenPoint(event));
      return;
    }
    const { dx, dy } = wheelPanDelta(event);
    api.panBy(dx, dy);
  }

  /** Starts a hand/pan gesture at the current pointer position. */
  function startPan(event) {
    setGesture({
      kind: "pan",
      lastX: event.clientX,
      lastY: event.clientY,
    });
    stage.style.cursor = "grabbing";
  }

  /** Continues an in-flight pan; mutates the gesture's last pointer. */
  function continuePan(event, gesture) {
    api.panBy(event.clientX - gesture.lastX, event.clientY - gesture.lastY);
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
  }

  return { onWheel, startPan, continuePan };
}
