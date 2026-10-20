import { useEffect } from "react";

/**
 * Normalizes wheel event delta across pixels, lines, and pages.
 *
 * @param {WheelEvent} event
 * @returns {number}
 */
export function normalizeWheelDelta(event) {
  let delta = event.deltaY;
  if (event.deltaMode === 1) delta *= 24;
  else if (event.deltaMode === 2) delta *= 400;
  return delta;
}

/**
 * Attaches a horizontal wheel listener to an HTML element.
 * Converts vertical wheel motions (deltaY) into horizontal scroll (scrollLeft).
 * Does not interfere with native horizontal gestures (e.g. trackpad horizontal swipe).
 *
 * @param {HTMLElement} el
 * @returns {() => void} Cleanup function to remove listener
 */
export function attachHorizontalWheel(el) {
  if (!el || typeof el.addEventListener !== "function") {
    return () => {};
  }

  const onWheel = (event) => {
    // If the gesture is primarily horizontal (trackpad swipe / tilt wheel), let browser handle it
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || event.deltaY === 0) {
      return;
    }

    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;

    const delta = normalizeWheelDelta(event);
    const canScrollRight = delta > 0 && el.scrollLeft < maxScroll - 1;
    const canScrollLeft = delta < 0 && el.scrollLeft > 1;

    if (canScrollRight || canScrollLeft) {
      event.preventDefault();
      el.scrollLeft += delta;
    }
  };

  el.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    el.removeEventListener("wheel", onWheel);
  };
}

/**
 * Hook that enables mouse wheel horizontal scrolling for containers with overflow-x.
 *
 * @param {import("react").RefObject<HTMLElement | null>} ref
 * @param {boolean} [enabled=true]
 */
export function useHorizontalWheel(ref, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const el = ref?.current;
    if (!el) return undefined;
    return attachHorizontalWheel(el);
  }, [ref, enabled]);
}
