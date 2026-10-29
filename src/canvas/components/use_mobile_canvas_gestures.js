import { useCallback, useRef } from "react";

const TAP_SLOP_PX = 12;
const TWO_FINGER_START_WINDOW_MS = 180;
const TWO_FINGER_TAP_WINDOW_MS = 360;
const THREE_FINGER_START_WINDOW_MS = 180;
const THREE_FINGER_TAP_WINDOW_MS = 360;

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function centerBetween(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

/** Adds mobile canvas pinch navigation, two-finger undo, and three-finger redo. */
export function useMobileCanvasGestures(onUndo, onPinch, onRedo) {
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onPinchRef = useRef(onPinch);
  onPinchRef.current = onPinch;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;
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
      // Cancel any active drawing or drag on the first touch now that a pinch gesture owns the stage.
      const stage = event.target.closest?.('[data-testid="editor-pages"]');
      if (stage && typeof PointerEvent === "function") {
        try {
          stage.dispatchEvent(
            new PointerEvent("pointercancel", {
              pointerId: points[0][0],
              pointerType: "touch",
              bubbles: true,
              cancelable: true,
              clientX: first.x,
              clientY: first.y,
            }),
          );
        } catch {
          // Fallback on environments without full PointerEvent support
        }
      }
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
    } else if (gesture.points.size === 3) {
      const points = [...gesture.points.entries()];
      const startTimes = points.map(([, point]) => point.startAt);
      const startedTogether =
        Math.max(...startTimes) - Math.min(...startTimes) <=
        THREE_FINGER_START_WINDOW_MS;
      gesture.candidate = startedTogether
        ? {
            pointerIds: new Set(points.map(([pointerId]) => pointerId)),
            startedAt: Math.min(...startTimes),
            ended: new Set(),
            valid: points.every(([, point]) => !point.moved),
          }
        : null;
      gesture.pinch = null;
      event.preventDefault();
      event.stopPropagation();
    } else if (gesture.points.size > 3) {
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
      const deltaX = center.x - gesture.pinch.centerX;
      const deltaY = center.y - gesture.pinch.centerY;
      const distanceChange = distance - gesture.pinch.distance;
      if (Math.hypot(deltaX, deltaY, distanceChange) < 2) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (gesture.candidate) gesture.candidate.valid = false;
      onPinchRef.current?.({
        factor: distance / gesture.pinch.distance,
        centerX: center.x,
        centerY: center.y,
        deltaX,
        deltaY,
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
      const fingerCount = candidate.pointerIds.size;
      const tapWindow =
        fingerCount === 2
          ? TWO_FINGER_TAP_WINDOW_MS
          : THREE_FINGER_TAP_WINDOW_MS;
      if (
        candidate.valid &&
        candidate.ended.size === fingerCount &&
        gesture.points.size === 0 &&
        performance.now() - candidate.startedAt <= tapWindow
      ) {
        // Wait for the canvas pointer handlers to commit a stroke on pointerup.
        const historyAction = fingerCount === 2 ? onUndoRef : onRedoRef;
        window.setTimeout(() => void historyAction.current?.(), 0);
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
