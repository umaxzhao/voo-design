import { useCallback, useRef } from "react";

const TAP_SLOP_PX = 12;
const TWO_FINGER_START_WINDOW_MS = 180;
const TWO_FINGER_TAP_WINDOW_MS = 360;

/** Adds a two-finger canvas tap gesture for undo without changing canvas drags. */
export function useMobileCanvasGestures(onUndo) {
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const gestureRef = useRef({ points: new Map(), candidate: null });

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
      }
      return;
    }

    const now = performance.now();
    gesture.points.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      startAt: now,
      moved: false,
    });
    if (gesture.points.size === 2) {
      const points = [...gesture.points.entries()];
      const first = points[0][1];
      const second = points[1][1];
      gesture.candidate = Math.abs(first.startAt - second.startAt) <= TWO_FINGER_START_WINDOW_MS
        ? {
            pointerIds: new Set(points.map(([pointerId]) => pointerId)),
            startedAt: Math.min(first.startAt, second.startAt),
            ended: new Set(),
            valid: !first.moved && !second.moved,
          }
        : null;
    } else if (gesture.points.size > 2) {
      gesture.candidate = null;
    }
  }, []);

  const onPointerMoveCapture = useCallback((event) => {
    const gesture = gestureRef.current;
    const point = gesture.points.get(event.pointerId);
    if (!point) return;
    if (
      Math.hypot(event.clientX - point.startX, event.clientY - point.startY) >
      TAP_SLOP_PX
    ) {
      point.moved = true;
      if (gesture.candidate) gesture.candidate.valid = false;
    }
    point.x = event.clientX;
    point.y = event.clientY;
  }, []);

  const onPointerUpCapture = useCallback((event) => {
    const gesture = gestureRef.current;
    const candidate = gesture.candidate;
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
      if (gesture.points.size === 0) gesture.candidate = null;
      return;
    }
    gesture.points.delete(event.pointerId);
    gesture.candidate = null;
  }, []);

  const onPointerCancelCapture = useCallback(() => {
    gestureRef.current.points.clear();
    gestureRef.current.candidate = null;
  }, []);

  return {
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
  };
}
