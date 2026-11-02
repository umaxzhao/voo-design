import { useRef, useEffect } from "react";

/** Curves stay readable — and the LUT stays cheap — with a hard point cap. */
const MAX_POINTS = 20;
/** Minimum horizontal gap when inserting, so two points never stack up. */
const INSERT_MIN_GAP = 0.015;
/** Minimum horizontal gap a dragged point keeps from its neighbours. */
const DRAG_MIN_GAP = 0.005;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const round4 = (value) => Number(value.toFixed(4));

/**
 * Photoshop-grade pointer interaction for the tone-curve editor.
 *
 * Smooth continuous drag:
 * 1. Tracks latest channelPoints & activeCurves via refs so rapid stream of events
 *    never reads stale closures or causes jumping/lag.
 * 2. Drag moves control points (endpoints stay pinned to x = 0 / x = 1).
 * 3. Supports live active index tracking, coordinate feedback, click to insert,
 *    and double-click/Delete to remove.
 */
export function useCurveDrag({
  svgRef,
  channel,
  activeCurves,
  channelPoints,
  onChange,
  onCommit,
  onSelectPoint = null,
}) {
  const dragIndexRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const hasDraggedRef = useRef(false);

  // Keep latest props in refs to avoid stale closure state during window mousemove
  const channelPointsRef = useRef(channelPoints);
  channelPointsRef.current = channelPoints;

  const activeCurvesRef = useRef(activeCurves);
  activeCurvesRef.current = activeCurves;

  const channelRef = useRef(channel);
  channelRef.current = channel;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const clearDragState = () => {
    dragIndexRef.current = null;
    activePointerIdRef.current = null;
    hasDraggedRef.current = false;
  };

  const writePoints = (points) => {
    onChangeRef.current?.({
      enabled: true,
      ...activeCurvesRef.current,
      [channelRef.current]: points,
    });
  };

  // Setup global pointer move/up handlers
  useEffect(() => {
    const handleWindowPointerMove = (moveEvent) => {
      const activePointerId = activePointerIdRef.current;
      const index = dragIndexRef.current;
      if (index === null || activePointerId === null) return;
      if (
        moveEvent.pointerId !== undefined &&
        moveEvent.pointerId !== activePointerId
      )
        return;

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      hasDraggedRef.current = true;

      let xNorm = clamp01((moveEvent.clientX - rect.left) / rect.width);
      const yNorm = clamp01(1 - (moveEvent.clientY - rect.top) / rect.height);

      const currentPts = channelPointsRef.current
        ? [...channelPointsRef.current]
        : [];
      if (index < 0 || index >= currentPts.length) return;

      if (index === 0) {
        xNorm = 0;
      } else if (index === currentPts.length - 1) {
        xNorm = 1;
      } else {
        const minAllowed = currentPts[index - 1].x + DRAG_MIN_GAP;
        const maxAllowed = currentPts[index + 1].x - DRAG_MIN_GAP;
        xNorm =
          minAllowed <= maxAllowed
            ? Math.max(minAllowed, Math.min(maxAllowed, xNorm))
            : (currentPts[index - 1].x + currentPts[index + 1].x) / 2;
      }

      currentPts[index] = { x: round4(xNorm), y: round4(yNorm) };
      channelPointsRef.current = currentPts;
      writePoints(currentPts);
    };

    const handleWindowPointerUp = (upEvent) => {
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null) return;
      if (
        upEvent.pointerId !== undefined &&
        upEvent.pointerId !== activePointerId
      )
        return;

      const didDrag = hasDraggedRef.current;
      clearDragState();
      if (didDrag) {
        onCommitRef.current?.();
      }
    };

    window.addEventListener("pointermove", handleWindowPointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handleWindowPointerUp, {
      passive: true,
    });
    window.addEventListener("pointercancel", handleWindowPointerUp, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [svgRef]);

  const onPointDown = (index, event) => {
    event.stopPropagation();
    event.preventDefault();
    const { pointerId } = event;
    const target = event.currentTarget;

    dragIndexRef.current = index;
    activePointerIdRef.current = pointerId ?? 1;
    hasDraggedRef.current = false;
    onSelectPoint?.(index);

    if (target?.setPointerCapture && pointerId !== undefined) {
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Capture is optional; window listeners handle it
      }
    }
  };

  const onSurfaceClick = (event) => {
    if (dragIndexRef.current !== null || hasDraggedRef.current) return;
    if (event.target.tagName?.toLowerCase() === "circle") return;
    const svg = svgRef.current;
    if (!svg) return;

    const currentPts = channelPointsRef.current ?? [];
    if (currentPts.length >= MAX_POINTS) return;

    const rect = svg.getBoundingClientRect();
    const xNorm = clamp01((event.clientX - rect.left) / rect.width);
    const yNorm = clamp01(1 - (event.clientY - rect.top) / rect.height);

    if (
      currentPts.some((point) => Math.abs(point.x - xNorm) < INSERT_MIN_GAP)
    ) {
      return;
    }

    const newPoint = { x: round4(xNorm), y: round4(yNorm) };
    const nextPoints = [...currentPts, newPoint].sort((a, b) => a.x - b.x);
    const insertedIndex = nextPoints.findIndex(
      (p) => p.x === newPoint.x && p.y === newPoint.y,
    );

    clearDragState();
    channelPointsRef.current = nextPoints;
    writePoints(nextPoints);
    onCommitRef.current?.();

    if (insertedIndex >= 0) {
      onSelectPoint?.(insertedIndex);
    }
  };

  const onPointDoubleClick = (index, event) => {
    event?.stopPropagation?.();
    const currentPts = channelPointsRef.current ?? [];
    if (index === 0 || index === currentPts.length - 1) return;

    clearDragState();
    const nextPoints = currentPts.filter((_, current) => current !== index);
    channelPointsRef.current = nextPoints;
    writePoints(nextPoints);
    onCommitRef.current?.();
    onSelectPoint?.(null);
  };

  const resetChannel = () => {
    clearDragState();
    const identity = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    channelPointsRef.current = identity;
    writePoints(identity);
    onCommitRef.current?.();
    onSelectPoint?.(null);
  };

  return {
    onPointDown,
    onSurfaceClick,
    onPointDoubleClick,
    resetChannel,
    clearDragState,
  };
}
