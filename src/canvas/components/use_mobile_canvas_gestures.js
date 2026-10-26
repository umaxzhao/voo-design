import { useCallback, useRef } from "react";

const TAP_SLOP_PX = 12;
const TWO_FINGER_START_WINDOW_MS = 180;
const TWO_FINGER_TAP_WINDOW_MS = 360;

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function centerBetween(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

/** Adds mobile canvas pinch navigation and a two-finger tap gesture for undo. */
export function useMobileCanvasGestures(onUndo, onPinch) {
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onPinchRef = useRef(onPinch);
  onPinchRef.current = onPinch;
  const gestureRef = useRef({ points: new Map(), candidate: null, pinch: null });

  const onPointerDownCapture = useCallback((event) => {
    const gesture = gestureRef.current;
    const isCanvasTarget = Boolean(
      event.target.closest?.('[data-testid="editor-pages"]') &&
      !event.target.closest?.(
        'button, input, textarea, select, [role="menu"], [role="dialog"], [data-testid="editor-toolbar"], [data-testid="editor-canvas-aids"]',
      ),
    );
    if (event.pointerType !== "touch" || !isCanvasTarget) {
      if (event.pointerType === "touch") {
        gesture.points.clear();
        gesture.candidate = null;
        gesture.pinch = null;
      }
      return;
    }

    const now = performance.now();
    gesture.points.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      startAt: now,
      moved: false,
    });
    if (gesture.points.size === 2) {
      const points = [...gesture.points.entries()];
      const first = points[0][1];
      const second = points[1][1];
      const center = centerBetween(first, second);
      gesture.pinch = {
        distance: Math.max(1, distanceBetween(first, second)),
        centerX: center.x,
        centerY: center.y,
      };
      onPinchRef.current?.({ isStart: true });
      gesture.candidate = Math.abs(first.startAt - second.startAt) <= TWO_FINGER_START_WINDOW_MS
        ? {
            pointerIds: new Set(points.map(([pointerId]) => pointerId)),
            startedAt: Math.min(first.startAt, second.startAt),
            ended: new Set(),
            valid: !first.moved && !second.moved,
          }
        : null;
      event.preventDefault();
      event.stopPropagation();
    } else if (gesture.points.size > 2) {
      gesture.candidate = null;
      gesture.pinch = null;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const onPointerMoveCapture = useCallback((event) => {
    const gesture = gestureRef.current;
    const point = gesture.points.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (
      Math.hypot(event.clientX - point.startX, event.clientY - point.startY) >
      TAP_SLOP_PX
    ) {
      point.moved = true;
      if (gesture.candidate) gesture.candidate.valid = false;
    }
    if (gesture.points.size >= 2 && gesture.pinch) {
      const points = [...gesture.points.values()];
      const center = centerBetween(points[0], points[1]);
      const distance = Math.max(1, distanceBetween(points[0], points[1]));
      onPinchRef.current?.({
        factor: distance / gesture.pinch.distance,
        centerX: center.x,
        centerY: center.y,
        deltaX: center.x - gesture.pinch.centerX,
        deltaY: center.y - gesture.pinch.centerY,
      });
      gesture.pinch = {
        distance,
        centerX: center.x,
        centerY: center.y,
      };
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const onPointerUpCapture = useCallback((event) => {
    const gesture = gestureRef.current;
    const candidate = gesture.candidate;
    if (gesture.pinch || gesture.points.size > 1) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (candidate?.pointerIds.has(event.pointerId)) {
      candidate.ended.add(event.pointerId);
      gesture.points.delete(event.pointerId);
      if (
        candidate.valid &&
        candidate.ended.size === 2 &&
        gesture.points.size === 0 &&
        performance.now() - candidate.startedAt <= TWO_FINGER_TAP_WINDOW_MS
      ) {
        // Wait for the canvas pointer handlers to commit a stroke on pointerup.
        window.setTimeout(() => void onUndoRef.current?.(), 0);
      }
      if (gesture.points.size === 0) {
        gesture.candidate = null;
        gesture.pinch = null;
      } else {
        gesture.pinch = null;
      }
      return;
    }
    gesture.points.delete(event.pointerId);
    gesture.candidate = null;
    gesture.pinch = null;
  }, []);

  const onPointerCancelCapture = useCallback(() => {
    gestureRef.current.points.clear();
    gestureRef.current.candidate = null;
    gestureRef.current.pinch = null;
  }, []);

  return {
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
  };
}
