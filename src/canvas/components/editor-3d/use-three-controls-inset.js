import { useEffect, useLayoutEffect, useState } from "react";
import { visibleThreeControlsRect } from "./three-controls-visible-rect.js";

// Space kept between the controls and whatever they move away from.
const GAP = 12;
// Moves tried before giving up: a panel and the timeline can share a corner.
const MAX_MOVES = 3;
// Panels and the timeline open, resize and animate without re-rendering the
// viewport, so the corner is re-checked on this interval as well.
const RECHECK_MS = 300;

function sameInset(a, b) {
  return a === b || (a && b && a.right === b.right && a.bottom === b.bottom);
}

/**
 * The outermost element above `point` that is not part of `frame`: a docked
 * panel or the timeline laid over the frame. Null when the frame is on top.
 */
function coveringElement(frame, x, y) {
  let hit = document.elementFromPoint(x, y);
  if (!hit || frame.contains(hit)) return null;
  while (hit.parentElement && !hit.parentElement.contains(frame)) {
    hit = hit.parentElement;
  }
  return hit;
}

/** Corners and centre of a rect, pulled 1px inside so they hit it. */
function samplePoints(rect) {
  const left = rect.left + 1;
  const right = rect.right - 1;
  const top = rect.top + 1;
  const bottom = rect.bottom - 1;
  return [
    [right, bottom],
    [left, bottom],
    [right, top],
    [left, top],
    [(left + right) / 2, (top + bottom) / 2],
  ];
}

/**
 * How far a 3D frame's corner controls sit in from its bottom-right: GAP
 * from the visible intersection, further when a panel or timeline covers it. The
 * controls step up or left past each cover, whichever is shorter. Null means
 * hide them: stepping clear would push them out of the frame.
 *
 * Measured after every render (pan and zoom move the frame without changing
 * any input here) and every RECHECK_MS; setInset bails out when nothing moved.
 */
export function useThreeControlsInset(frameRef, controlsRef, enabled) {
  const [inset, setInset] = useState({ right: GAP, bottom: GAP });
  const measure = () => {
    const frame = frameRef.current;
    const controls = controlsRef.current;
    if (!enabled || !frame) return;
    const box = frame.getBoundingClientRect();
    const visible = visibleThreeControlsRect(frame);
    if (!visible || !box.width || !box.height) {
      setInset(null);
      return;
    }
    // Offsets are local CSS pixels; clipping and hit tests use client pixels.
    const scaleX = frame.offsetWidth ? box.width / frame.offsetWidth : 1;
    const scaleY = frame.offsetHeight ? box.height / frame.offsetHeight : 1;
    // Before the first paint of the controls, assume the gizmo-sized block.
    const width = controls?.offsetWidth || 84;
    const height = controls?.offsetHeight || 122;
    let next = {
      right: (box.right - visible.right) / scaleX + GAP,
      bottom: (box.bottom - visible.bottom) / scaleY + GAP,
    };
    if (
      (width + GAP * 2) * scaleX > visible.right - visible.left ||
      (height + GAP * 2) * scaleY > visible.bottom - visible.top
    ) {
      setInset(null);
      return;
    }
    for (let move = 0; move < MAX_MOVES && next; move += 1) {
      const rect = {
        left: box.right - (next.right + width) * scaleX,
        right: box.right - next.right * scaleX,
        top: box.bottom - (next.bottom + height) * scaleY,
        bottom: box.bottom - next.bottom * scaleY,
      };
      const cover = samplePoints(rect)
        .map(([x, y]) => coveringElement(frame, x, y))
        .find(Boolean);
      if (!cover) break;
      const over = cover.getBoundingClientRect();
      // A stage-wide layer over the whole frame leaves no corner to step to.
      if (over.left <= box.left && over.top <= box.top) break;
      const up = (rect.bottom - over.top) / scaleY + GAP;
      const left = (rect.right - over.left) / scaleX + GAP;
      next =
        up <= left
          ? { ...next, bottom: next.bottom + up }
          : { ...next, right: next.right + left };
      if (
        box.right - (next.right + width) * scaleX < visible.left ||
        box.bottom - (next.bottom + height) * scaleY < visible.top
      ) {
        next = null;
      }
    }
    setInset((current) => (sameInset(current, next) ? current : next));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure);
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(measure, RECHECK_MS);
    return () => clearInterval(timer);
    // measure reads refs only; restarting the timer each render is wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return inset;
}
