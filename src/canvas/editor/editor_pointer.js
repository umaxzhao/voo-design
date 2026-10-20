/**
 * Pointer and wheel gestures for the editor stage.
 *
 * A small state machine over one pointer: at most one gesture runs at a time,
 * and each one owns the document only between `pointerdown` and `pointerup`.
 * Intermediate writes are uncommitted, so a drag costs exactly one undo step.
 */

import { NODE_KIND } from "./scene_model.js";
import { TOOL } from "./editor_constants.js";
import { orbitCameraFromDrag } from "./editor_pointer_model_orbit.js";
import { createPanPointerGestures } from "./editor_pointer_pan_zoom.js";
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
  let orbitModelId = null;
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

    if (orbitModelId && !spaceDown && event.button === 0) {
      const hit = api.nodeAtPoint(api.toDocPoint(event.clientX, event.clientY));
      if (hit?.id === orbitModelId && api.getTool() === TOOL.SELECT) {
        gesture = {
          kind: "modelOrbit",
          id: orbitModelId,
          clientX: event.clientX,
          clientY: event.clientY,
          camera: { ...hit.model?.camera },
          moved: false,
          pointerId: event.pointerId,
        };
        stage.setPointerCapture(event.pointerId);
        stage.style.cursor = "grabbing";
        return;
      }
      orbitModelId = null;
    }

    dispatchDown(event, spaceDown);

    if (gesture) {
      gesture.pointerId = event.pointerId;
      stage.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event) => {
    lastPointerEvent = event;
    if (!gesture) {
      if (onCanvas(event)) {
        if (orbitModelId) {
          const hit = api.nodeAtPoint(
            api.toDocPoint(event.clientX, event.clientY),
          );
          if (hit?.id === orbitModelId) {
            stage.style.cursor = "grab";
            return;
          }
        }
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

    if (gesture.kind === "modelOrbit") {
      const deltaX = event.clientX - gesture.clientX;
      const deltaY = event.clientY - gesture.clientY;
      if (Math.hypot(deltaX, deltaY) < 2 && !gesture.moved) return;
      gesture.moved = true;
      api.updateNode(
        gesture.id,
        {
          model: {
            camera: orbitCameraFromDrag(gesture.camera, deltaX, deltaY),
          },
        },
        { commit: false },
      );
      return;
    }

    dispatchMove(event, gesture);
  };

  const onPointerUp = (event) => {
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
    stage.style.cursor = spaceDown || orbitModelId ? "grab" : "default";

    finishGesture(event, finished);
  };

  const onDoubleClick = (event) => {
    if (!onCanvasAfterCapture(event)) return;
    if (api.getTool() === TOOL.SELECT) {
      const hit = api.nodeAtPoint(api.toDocPoint(event.clientX, event.clientY));
      if (hit?.kind === NODE_KIND.MODEL_3D) {
        orbitModelId = hit.id;
        api.select(hit.id);
        stage.style.cursor = "grab";
        return;
      }
    }
    handleEditorDoubleClick(event, { api });
  };

  const onKeyDown = (event) => {
    if (event.repeat) return;
    if (event.code === "Escape" && orbitModelId) {
      orbitModelId = null;
      stage.style.cursor = "default";
      event.preventDefault();
      return;
    }
    const isModifier =
      event.key === "Shift" ||
      event.key === "Alt" ||
      event.key === "Meta" ||
      event.key === "Control";

    if (isModifier && gesture && lastPointerEvent) {
      const shiftKey = event.key === "Shift" ? true : event.shiftKey;
      const altKey = event.key === "Alt" ? true : event.altKey;
      const metaKey = event.key === "Meta" ? true : event.metaKey;
      const ctrlKey = event.key === "Control" ? true : event.ctrlKey;
      dispatchMove(
        {
          ...lastPointerEvent,
          shiftKey,
          altKey,
          metaKey,
          ctrlKey,
        },
        gesture,
      );
    }
    if (event.code === "AltLeft" || event.code === "AltRight") {
      return;
    }
    if (event.code !== "Space") return;
    if (shared) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    event.preventDefault();
    spaceDown = true;
    if (!gesture) stage.style.cursor = "grab";
  };

  const onKeyUp = (event) => {
    const isModifier =
      event.key === "Shift" ||
      event.key === "Alt" ||
      event.key === "Meta" ||
      event.key === "Control";

    if (isModifier && gesture && lastPointerEvent) {
      const shiftKey = event.key === "Shift" ? false : event.shiftKey;
      const altKey = event.key === "Alt" ? false : event.altKey;
      const metaKey = event.key === "Meta" ? false : event.metaKey;
      const ctrlKey = event.key === "Control" ? false : event.ctrlKey;
      dispatchMove(
        {
          ...lastPointerEvent,
          shiftKey,
          altKey,
          metaKey,
          ctrlKey,
        },
        gesture,
      );
    }
    if (event.code === "AltLeft" || event.code === "AltRight") {
      return;
    }
    if (event.code !== "Space") return;
    if (shared) return;
    spaceDown = false;
    if (!gesture) stage.style.cursor = "default";
  };

  const onPointerLeave = () => {
    api.setClonePreview?.(null);
  };

  if (!shared) {
    stage.addEventListener("wheel", pan.onWheel, { passive: false });
  }
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("pointerleave", onPointerLeave);
  stage.addEventListener("dblclick", onDoubleClick);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    if (!shared) {
      stage.removeEventListener("wheel", pan.onWheel);
    }
    stage.removeEventListener("pointerdown", onPointerDown);
    stage.removeEventListener("pointermove", onPointerMove);
    stage.removeEventListener("pointerup", onPointerUp);
    stage.removeEventListener("pointercancel", onPointerUp);
    stage.removeEventListener("pointerleave", onPointerLeave);
    stage.removeEventListener("dblclick", onDoubleClick);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
