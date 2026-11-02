/**
 * Crop and Selection-Transform (Ctrl+T) pointer gestures.
 *
 * Extracted from editor_pointer_transform.js.
 */

import { handleAtPoint, resizeRect } from "./scene_geometry.js";
import {
  unrotatePointAroundCenterRad,
  unrotateVectorRad,
} from "./box_transform_math.js";
import { HANDLE_GRAB_RADIUS } from "./scene_renderer.js";

export function createCropPointerGestures({
  api,
  handleUnder,
  cropHandleUnder,
  getGesture,
  setGesture,
}) {
  function startCropDrag(event) {
    const rect = api.getCropRect();
    if (!rect) return false;
    const handle = (cropHandleUnder ?? handleUnder)(rect, event);
    const point = api.toDocPoint(event.clientX, event.clientY);
    if (handle) {
      setGesture({ kind: "cropResize", handle, start: point, rect });
      return true;
    }
    if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      setGesture({ kind: "cropMove", start: point, rect });
      return true;
    }
    return false;
  }

  function dragCrop(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    if (gesture.kind === "cropMove") {
      api.setCropRect({
        ...gesture.rect,
        x: gesture.rect.x + dx,
        y: gesture.rect.y + dy,
      });
      return;
    }
    const next = resizeRect(
      gesture.rect,
      gesture.handle,
      { x: dx, y: dy },
      { minSize: 16 },
    );
    api.setCropRect(next);
  }

  /**
   * Starts a "transform selection" drag: resize via the eight handles (with
   * the pointer inverse-rotated into the box's local frame), move from inside
   * the box, rotate from the grip above the top edge.
   */
  function startSelectionTransformDrag(event) {
    const transform = api.getSelectionTransform?.();
    if (!transform?.rect) return;
    const viewport = api.getViewport?.() ?? { zoom: 1 };
    const zoom = Math.max(viewport.zoom ?? 1, 0.01);
    const point = api.toDocPoint(event.clientX, event.clientY);
    const { rect, rotation = 0 } = transform;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const localPoint = unrotatePointAroundCenterRad(
      point,
      { x: cx, y: cy },
      rotation,
    );
    const tol = HANDLE_GRAB_RADIUS / zoom;
    const handle = handleAtPoint(rect, localPoint, tol);
    const onGrip =
      Math.abs(localPoint.x - cx) <= tol * 3 &&
      localPoint.y <= rect.y &&
      localPoint.y >= rect.y - 50 / zoom;
    const cornerDistances = [
      Math.hypot(localPoint.x - rect.x, localPoint.y - rect.y),
      Math.hypot(localPoint.x - (rect.x + rect.width), localPoint.y - rect.y),
      Math.hypot(
        localPoint.x - (rect.x + rect.width),
        localPoint.y - (rect.y + rect.height),
      ),
      Math.hypot(localPoint.x - rect.x, localPoint.y - (rect.y + rect.height)),
    ];
    const nearCorner = cornerDistances.some((d) => d > tol && d <= tol * 3.5);
    const inside =
      localPoint.x >= rect.x - tol &&
      localPoint.x <= rect.x + rect.width + tol &&
      localPoint.y >= rect.y - tol &&
      localPoint.y <= rect.y + rect.height + tol;

    if (handle) {
      setGesture({
        kind: "selectionTransformResize",
        handle,
        start: { x: point.x, y: point.y },
      });
    } else if (onGrip || nearCorner) {
      setGesture({
        kind: "selectionTransformRotate",
        startAngle: Math.atan2(point.y - cy, point.x - cx) - rotation,
        cx,
        cy,
      });
    } else if (inside) {
      setGesture({
        kind: "selectionTransformMove",
        start: { x: point.x, y: point.y },
      });
    }
  }

  function dragSelectionTransform(event, gesture = getGesture()) {
    const transformState = api.getSelectionTransform?.();
    if (!transformState) return;
    const point = api.toDocPoint(event.clientX, event.clientY);

    if (gesture.kind === "selectionTransformResize") {
      const rawDx = point.x - gesture.start.x;
      const rawDy = point.y - gesture.start.y;
      const rotation = transformState.rotation ?? 0;
      const unrotatedDelta = unrotateVectorRad(
        { x: rawDx, y: rawDy },
        rotation,
      );
      const next = resizeRect(
        transformState.rect,
        gesture.handle,
        { x: unrotatedDelta.x, y: unrotatedDelta.y },
        { minSize: 8, fromCentre: event.altKey },
      );
      api.setSelectionTransform?.({ rect: next });
      gesture.start = { x: point.x, y: point.y };
    } else if (gesture.kind === "selectionTransformMove") {
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      api.setSelectionTransform?.({
        rect: {
          ...transformState.rect,
          x: transformState.rect.x + dx,
          y: transformState.rect.y + dy,
        },
      });
      gesture.start = { x: point.x, y: point.y };
    } else if (gesture.kind === "selectionTransformRotate") {
      const angle =
        Math.atan2(point.y - gesture.cy, point.x - gesture.cx) -
        gesture.startAngle;
      api.setSelectionTransform?.({ rotation: angle });
    }
  }

  return {
    startCropDrag,
    dragCrop,
    startSelectionTransformDrag,
    dragSelectionTransform,
  };
}

