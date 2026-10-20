import { useCallback, useEffect, useRef } from "react";
import { SCRUB_CLICK_THRESHOLD_PX, scrubValue } from "../editor/scrub_math.js";

/**
 * Figma-style drag-to-scrub for numeric fields.
 *
 * Spread the returned handlers onto the drag handle (a label prefix or value
 * chip). A horizontal drag past SCRUB_CLICK_THRESHOLD_PX scrubs the value
 * through `onScrub` (same live-edit path as typing); releasing the drag fires
 * `onScrubEnd`, which the property panel uses to land one history snapshot per
 * gesture. A shorter gesture fires `onTap`, which is how click-to-focus /
 * click-to-edit keeps working on the same spot.
 *
 * The handle is expected to be non-focusable decoration — keyboard users drive
 * the real input next to it, so nothing here needs key handling.
 */
export function useScrubDrag({
  value,
  step,
  min,
  max,
  snapStepOnShift = null,
  onScrub,
  onTap,
  onScrubStart,
  onScrubEnd,
}) {
  const dragRef = useRef(null);
  const latestRef = useRef({
    value,
    step,
    min,
    max,
    snapStepOnShift,
    onScrub,
    onTap,
    onScrubStart,
    onScrubEnd,
  });

  useEffect(() => {
    latestRef.current = {
      value,
      step,
      min,
      max,
      snapStepOnShift,
      onScrub,
      onTap,
      onScrubStart,
      onScrubEnd,
    };
  });

  const finish = useCallback((cancelled) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved) {
      document.body.style.cursor = drag.previousCursor;
      latestRef.current.onScrubEnd?.();
    } else if (!cancelled) {
      latestRef.current.onTap?.();
    }
  }, []);

  // Unmounting mid-scrub (selection cleared, section folded) must not leave
  // the body cursor stuck on ew-resize.
  useEffect(
    () => () => {
      if (dragRef.current?.moved) {
        document.body.style.cursor = dragRef.current.previousCursor;
      }
      dragRef.current = null;
    },
    [],
  );

  const onPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    // Block text selection during the drag; click still fires afterwards.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      base: latestRef.current.value,
      moved: false,
      previousCursor: document.body.style.cursor,
    };
  }, []);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaPx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaPx) < SCRUB_CLICK_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.style.cursor = "ew-resize";
      latestRef.current.onScrubStart?.();
    }
    const { step, min, max, snapStepOnShift, onScrub } = latestRef.current;
    onScrub(
      scrubValue(drag.base, deltaPx, {
        step,
        min,
        max,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        snapStepOnShift,
      }),
    );
  }, []);

  const onPointerUp = useCallback(() => finish(false), [finish]);
  const onPointerCancel = useCallback(() => finish(true), [finish]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
