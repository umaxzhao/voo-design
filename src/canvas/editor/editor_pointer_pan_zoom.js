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

/**
 * Screen to World coordinates projection:
 * worldX = (screenX - panX) / zoom
 * worldY = (screenY - panY) / zoom
 *
 * @param {number} screenX - Screen X in viewport CSS pixels
 * @param {number} screenY - Screen Y in viewport CSS pixels
 * @param {{ panX?: number, panY?: number, zoom?: number }} camera - Viewport camera
 * @returns {{ x: number, y: number }}
 */
export function screenToWorld(screenX, screenY, camera) {
  const zoom = camera?.zoom || 1;
  const panX = camera?.panX || 0;
  const panY = camera?.panY || 0;
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
}

/**
 * World to Screen coordinates projection:
 * screenX = worldX * zoom + panX
 * screenY = worldY * zoom + panY
 *
 * @param {number} worldX - World X in workspace space
 * @param {number} worldY - World Y in workspace space
 * @param {{ panX?: number, panY?: number, zoom?: number }} camera - Viewport camera
 * @returns {{ x: number, y: number }}
 */
export function worldToScreen(worldX, worldY, camera) {
  const zoom = camera?.zoom || 1;
  const panX = camera?.panX || 0;
  const panY = camera?.panY || 0;
  return {
    x: worldX * zoom + panX,
    y: worldY * zoom + panY,
  };
}

/**
 * World to Artboard Frame local coordinates:
 * frameX = worldX - frameBounds.x
 * frameY = worldY - frameBounds.y
 *
 * @param {number} worldX
 * @param {number} worldY
 * @param {{ x?: number, y?: number }} frameBounds
 * @returns {{ x: number, y: number }}
 */
export function worldToFrame(worldX, worldY, frameBounds) {
  const fx = frameBounds?.x || 0;
  const fy = frameBounds?.y || 0;
  return {
    x: worldX - fx,
    y: worldY - fy,
  };
}

/**
 * Artboard Frame to World coordinates:
 * worldX = frameX + frameBounds.x
 * worldY = frameY + frameBounds.y
 *
 * @param {number} frameX
 * @param {number} frameY
 * @param {{ x?: number, y?: number }} frameBounds
 * @returns {{ x: number, y: number }}
 */
export function frameToWorld(frameX, frameY, frameBounds) {
  const fx = frameBounds?.x || 0;
  const fy = frameBounds?.y || 0;
  return {
    x: frameX + fx,
    y: frameY + fy,
  };
}

/**
 * Screen to Artboard Frame local coordinates:
 * Maps screen -> world -> frame.
 *
 * @param {number} screenX
 * @param {number} screenY
 * @param {{ panX?: number, panY?: number, zoom?: number }} camera
 * @param {{ x?: number, y?: number }} frameBounds
 * @returns {{ x: number, y: number }}
 */
export function screenToFrame(screenX, screenY, camera, frameBounds) {
  const world = screenToWorld(screenX, screenY, camera);
  return worldToFrame(world.x, world.y, frameBounds);
}

/**
 * Artboard Frame local to Screen coordinates:
 * Maps frame -> world -> screen.
 *
 * @param {number} frameX
 * @param {number} frameY
 * @param {{ panX?: number, panY?: number, zoom?: number }} camera
 * @param {{ x?: number, y?: number }} frameBounds
 * @returns {{ x: number, y: number }}
 */
export function frameToScreen(frameX, frameY, camera, frameBounds) {
  const world = frameToWorld(frameX, frameY, frameBounds);
  return worldToScreen(world.x, world.y, camera);
}

/**
 * Unified 4-level camera matrix transformer:
 * screen -> world -> frame -> node
 *
 * @param {{ panX?: number, panY?: number, zoom?: number }} camera
 * @param {{ x?: number, y?: number, width?: number, height?: number }} [frameBounds]
 */
export function createCameraMatrixTransformer(camera, frameBounds) {
  return {
    screenToWorld: (sx, sy) => screenToWorld(sx, sy, camera),
    worldToScreen: (wx, wy) => worldToScreen(wx, wy, camera),
    worldToFrame: (wx, wy) => worldToFrame(wx, wy, frameBounds),
    frameToWorld: (fx, fy) => frameToWorld(fx, fy, frameBounds),
    screenToFrame: (sx, sy) => screenToFrame(sx, sy, camera, frameBounds),
    frameToScreen: (fx, fy) => frameToScreen(fx, fy, camera, frameBounds),
    transformPointerEvent: (event, stageElement) => {
      const bounds = stageElement?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      const screenX = event.clientX - bounds.left;
      const screenY = event.clientY - bounds.top;
      const world = screenToWorld(screenX, screenY, camera);
      const frame = worldToFrame(world.x, world.y, frameBounds);
      return {
        screen: { x: screenX, y: screenY },
        world,
        frame,
      };
    },
  };
}
