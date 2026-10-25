import PropTypes from "prop-types";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Explanations that wait to be asked for.
 *
 * The settings drawer is 360px wide and every panel used to carry two or three
 * lines of prose above its controls. Read once, that text is useful; read on
 * every visit it is noise, and it pushed the real controls below the fold. So
 * the words stay and only their moment changes.
 *
 * Two shapes, because the drawer has two situations:
 *
 * - `InfoHint` adds a small "?" beside a plain title — for headings that are
 *   not interactive on their own.
 * - `useHint` hands the same behaviour to an element that is *already* a
 *   button, which matters because the model rows are buttons end to end and a
 *   nested button there would be invalid markup with two competing click
 *   targets.
 *
 * The tooltip is a portal in both cases: the drawer body is `overflow-y-auto`,
 * so anything positioned inside the flow gets clipped by the scroll container,
 * worst at the bottom panels where the longest hints happen to live. Fixed
 * positioning against the viewport is the only placement that cannot be cut
 * off, and it flips above the trigger when there is no room below.
 */

/** Roughly how tall a tooltip gets; used to decide whether to flip it up. */
const ESTIMATED_HEIGHT = 96;
const GAP = 8;
const WIDTH = 244;

/**
 * Tooltip behaviour for an element that can already take focus.
 *
 * @param {string} text the explanation, already translated.
 * @returns {{triggerProps: object, tooltip: React.ReactNode}} spread
 *   `triggerProps` onto the trigger and render `tooltip` anywhere.
 */
export function useHint(text) {
  const triggerRef = useRef(null);
  const [position, setPosition] = useState(null);
  const id = useId();

  const show = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();

    // Prefer below; flip above when the viewport's lower edge is too close.
    const below = window.innerHeight - rect.bottom >= ESTIMATED_HEIGHT + GAP;
    // Keep the box on screen horizontally: anchor to the trigger, then pull it
    // back from the right edge rather than letting it run off.
    const left = Math.min(
      Math.max(GAP, rect.left),
      Math.max(GAP, window.innerWidth - WIDTH - GAP),
    );

    setPosition(
      below
        ? { left, top: rect.bottom + GAP }
        : { left, bottom: window.innerHeight - rect.top + GAP },
    );
  }, []);

  const hide = useCallback(() => setPosition(null), []);

  useEffect(() => {
    if (!position) return undefined;
    // Without this the drawer scrolls under a pinned tooltip, leaving it beside
    // whatever text happened to scroll into that spot.
    const onKey = (event) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [position, hide]);

  const tooltip = position
    ? createPortal(
        <span
          id={id}
          role="tooltip"
          style={{ ...position, width: WIDTH }}
          className="pointer-events-none fixed z-[120] rounded-lg bg-neutral-900 px-3 py-2 text-[11px] font-normal leading-relaxed text-neutral-300 shadow-pop backdrop-blur-xl whitespace-pre-line"
        >
          {text}
        </span>,
        document.body,
      )
    : null;

  return {
    triggerProps: {
      ref: triggerRef,
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
      "aria-describedby": position ? id : undefined,
    },
    tooltip,
  };
}

/** A title with a "?" that reveals its explanation on hover or focus. */
export default function InfoHint({ text, label, className = "" }) {
  const { triggerProps, tooltip } = useHint(text);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{label}</span>
      <button
        type="button"
        // The text is the whole point of the control, so it is also its name —
        // a bare "more info" would tell a screen reader nothing.
        aria-label={text}
        {...triggerProps}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[9px] font-semibold leading-none text-neutral-500 transition-colors hover:border-white/30 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/50"
      >
        ?
      </button>
      {tooltip}
    </span>
  );
}

InfoHint.propTypes = {
  /** The explanation itself, already translated. */
  text: PropTypes.string.isRequired,
  /** The visible title the hint belongs to. */
  label: PropTypes.node.isRequired,
  className: PropTypes.string,
};
