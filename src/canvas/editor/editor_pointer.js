/**
 * Pointer and wheel gestures for the editor stage.
 *
 * A small state machine over one pointer: at most one gesture runs at a time,
 * and each one owns the document only between `pointerdown` and `pointerup`.
 * Intermediate writes are uncommitted, so a drag costs exactly one undo step.
 */

import {
  createPanPointerGestures,
  screenToWorld,
  worldToScreen,
  worldToFrame,
  frameToWorld,
  screenToFrame,
  frameToScreen,
  createCameraMatrixTransformer,
} from "./editor_pointer_pan_zoom.js";
import { createSelectionPointerGestures } from "./editor_pointer_selection.js";
import { createMarqueePointerGestures } from "./editor_pointer_marquee.js";
import {
  createDrawingPointerGestures,
  resolveCloneAnchor,
} from "./editor_pointer_drawing.js";
import {
  createShapesPointerGestures,
  textBoxDrag,
} from "./editor_pointer_shapes.js";
import { createWarpPointerGestures } from "./editor_pointer_warp.js";
import { createTransformPointerGestures } from "./editor_pointer_transform.js";
import {
  projectOnSegment,
  pointToSegmentDistance,
  rebuildGradient,
  gradientControlGrab,
  dragGradientStop,
  dragGradientEndpoint,
  dragGradientLine,
} from "./editor_pointer_gradient.js";
import { createPointerHitTester } from "./editor_pointer_hit_test.js";
import { createHoverCursorController } from "./editor_pointer_hover.js";
import { createPointerMoveDispatcher } from "./editor_pointer_move.js";
import { createPointerFinishDispatcher } from "./editor_pointer_finish.js";
import { createPointerKeyboard, bindPointerEvents } from "./editor-pointer-bindings.js";
import {
  createPointerDownDispatcher,
  handleEditorDoubleClick,
} from "./editor_pointer_events.js";

// Re-export public API for backwards compatibility and tests
export {
  resolveCloneAnchor,
  textBoxDrag,
  projectOnSegment,
  pointToSegmentDistance,
  rebuildGradient,
  gradientControlGrab,
  dragGradientStop,
  dragGradientEndpoint,
  dragGradientLine,
  screenToWorld,
  worldToScreen,
  worldToFrame,
  frameToWorld,
  screenToFrame,
  frameToScreen,
  createCameraMatrixTransformer,
};

export function attachPointerHandlers({
  stage,
  canvas,
  api,
  cameraMode = "page",
}) {
  const shared = cameraMode === "shared";
  let gesture = null;
  let spaceDown = false;
  let lastBrushPoint = null;
  let lastPointerEvent = null;

  const onCanvas = (event) => {
    const target = event.target;
    if (!target) return false;
    if (target === canvas || target === stage) return true;
    if (stage.contains(target)) {
      if (target.tagName === "CANVAS") return true;
      if (
        target.closest?.(
          "button, input, select, textarea, a, [role='button'], [role='menu'], [role='dialog'], [data-interactive]",
        )
      ) {
        return false;
      }
      return true;
    }
    return false;
  };

  const onCanvasAfterCapture = (event) => onCanvas(event);

  const screenPoint = (event) => {
    const bounds = stage.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  // ------------------------------------------------------------- hit testing
  const hitTest = createPointerHitTester({ api, stage, screenPoint });
  const {
    rectRadiusHandleUnder,
    handleUnder,
    cropHandleUnder,
    nodeHandleUnder,
    rotateHandleUnder,
    imageAt,
    pointInContours,
  } = hitTest;

  // ----------------------------------------------------------------- pan
  const pan = createPanPointerGestures({
    api,
    stage,
    onCanvas,
    screenPoint,
    setGesture: (next) => {
      gesture = next;
    },
  });

  // -------------------------------------------------------------- shapes
  const shapes = createShapesPointerGestures({
    api,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
  });

  // ------------------------------------------------------------- marquee
  const marquee = createMarqueePointerGestures({
    api,
    imageAt,
    pointInContours,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
  });

  // ----------------------------------------------------------- selection
  const selection = createSelectionPointerGestures({
    api,
    imageAt,
    pointInContours,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
  });

  // ------------------------------------------------------------- drawing
  const drawing = createDrawingPointerGestures({
    api,
    imageAt,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
    getLastBrushPoint: () => lastBrushPoint,
    setLastBrushPoint: (next) => {
      lastBrushPoint = next;
    },
    textBoxDrag,
    resolveCloneAnchor,
  });

  // ---------------------------------------------------------------- warp
  const warp = createWarpPointerGestures({
    api,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
  });

  // ----------------------------------------------------------- transform
  const transform = createTransformPointerGestures({
    api,
    stage,
    screenPoint,
    handleUnder,
    cropHandleUnder,
    nodeHandleUnder,
    rotateHandleUnder,
    rectRadiusHandleUnder,
    gradientControlGrab,
    pointInContours,
    penEditPress: drawing.penEditPress,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
  });

  // --------------------------------------------------------------- hover
  const hover = createHoverCursorController({
    api,
    stage,
    hitTest,
    isSpaceDown: () => spaceDown,
  });
  api.refreshBrushCursor = hover.refreshBrushCursor;

  // ---------------------------------------------------------- dispatchers
  const { dispatchDown } = createPointerDownDispatcher({
    api,
    shared,
    pan,
    drawing,
    shapes,
    marquee,
    selection,
    transform,
    setGesture: (next) => {
      gesture = next;
    },
  });

  const { dispatchMove } = createPointerMoveDispatcher({
    api,
    pan,
    drawing,
    shapes,
    marquee,
    selection,
    transform,
    warp,
  });

  const { finishGesture } = createPointerFinishDispatcher({
    api,
    setLastBrushPoint: (next) => {
      lastBrushPoint = next;
    },
  });

  const onPointerDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.button === 1) {
      event.preventDefault();
    }
    if (gesture) {
      if (
        gesture.pointerId !== undefined &&
        event.pointerId !== undefined &&
        event.pointerId !== gesture.pointerId
      ) {
        return;
      }
      onPointerUp(event);
    }
    if (!onCanvas(event)) return;

    lastPointerEvent = event;

    dispatchDown(event, spaceDown);

    if (gesture) {
      gesture.pointerId = event.pointerId;
      stage.setPointerCapture(event.pointerId);
    }
  };

  let moveRafId = 0;
  let pendingMoveEvent = null;
  let pendingGesture = null;

  const flushPendingMove = () => {
    if (moveRafId) {
      cancelAnimationFrame(moveRafId);
      moveRafId = 0;
    }
    if (pendingMoveEvent && pendingGesture) {
      const evt = pendingMoveEvent;
      const g = pendingGesture;
      pendingMoveEvent = null;
      pendingGesture = null;
      dispatchMove(evt, g);
    }
  };

  const onPointerMove = (event) => {
    lastPointerEvent = event;
    if (!gesture) {
      if (onCanvas(event)) {
        if (api.getPolygonDraft?.()) {
          api.updatePolygonPreview(
            api.toDocPoint(event.clientX, event.clientY),
          );
        }
        if (api.getMagneticLassoDraft?.()) {
          api.updateMagneticLasso?.(
            api.toDocPoint(event.clientX, event.clientY),
            {
              forceStraight: event.altKey,
            },
          );
        }
        if (api.getPenDraft?.() || api.getEdit?.()) {
          api.penHover?.(api.toDocPoint(event.clientX, event.clientY));
        }
        hover.updateHoverCursor(event);
      }
      return;
    }

    if (
      gesture.pointerId !== undefined &&
      event.pointerId !== undefined &&
      event.pointerId !== gesture.pointerId
    ) {
      return;
    }

    // Heavy geometric & snapping gestures coalesce with rAF to sustain 60/120FPS.
    // Kind names match transform/crop gesture creators (not a generic "transform").
    if (
      gesture.kind === "move" ||
      gesture.kind === "pan" ||
      gesture.kind === "resize" ||
      gesture.kind === "rotate" ||
      gesture.kind === "cropMove" ||
      gesture.kind === "cropResize"
    ) {
      pendingMoveEvent = event;
      pendingGesture = gesture;
      if (!moveRafId) {
        moveRafId = requestAnimationFrame(flushPendingMove);
      }
      return;
    }

    dispatchMove(event, gesture);
  };

  const onPointerUp = (event) => {
    flushPendingMove();
    lastPointerEvent = null;
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
    api.setGuides([]);
    if (!gesture) return;

    if (
      gesture.pointerId !== undefined &&
      event.pointerId !== undefined &&
      event.pointerId !== gesture.pointerId
    ) {
      return;
    }

    const finished = gesture;
    gesture = null;
    stage.style.cursor = spaceDown ? "grab" : "default";

    finishGesture(event, finished);
  };

  const onDoubleClick = (event) => {
    if (!onCanvasAfterCapture(event)) return;
    handleEditorDoubleClick(event, { api, nodeHandleUnder });
  };

  const keyboard = createPointerKeyboard({
    stage, shared, getGesture: () => gesture,
    getLastPointerEvent: () => lastPointerEvent,
    setSpaceDown: value => { spaceDown = value; },
    dispatchMove, onPointerUp, hover,
  });

  const onPointerLeave = () => {
    hover.clearLastPointerEvent?.();
    api.setClonePreview?.(null);
  };

  const onAuxClick = (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  };

  return bindPointerEvents({ stage, shared, api, hover, pan, keyboard,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onAuxClick, onDoubleClick },
  });
}
