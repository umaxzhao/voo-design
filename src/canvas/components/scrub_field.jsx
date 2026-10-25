import PropTypes from "prop-types";
import { useRef } from "react";
import BoundedNumberInput from "./bounded_number_input.jsx";
import { useScrubDrag } from "./use_scrub_drag.js";
import EditorTooltip from "./editor_tooltip.jsx";

/**
 * Figma-style numeric field: the label sits inside the box as an inline
 * prefix (`X | 123`) and doubles as a drag handle — dragging it horizontally
 * scrubs the value through the same `onValueChange` path as typing, so the
 * panel's debounced commit keeps working unchanged.
 *
 * The prefix is decorative (aria-hidden, non-focusable); keyboard users drive
 * the real input, which keeps its aria-label and focus behaviour.
 */
export default function ScrubField({
  prefix = undefined,
  suffix = undefined,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onCommit = undefined,
  onScrubStart = undefined,
  onScrubEnd = undefined,
  ariaLabel,
  scrubHint = undefined,
  bare = false,
  disabled = false,
  showRange = false,
  className = undefined,
}) {
  const inputRef = useRef(null);
  const scrub = useScrubDrag({
    value,
    step,
    min,
    max,
    onScrub: onValueChange,
    onTap: () => !disabled && inputRef.current?.focus(),
    onScrubStart,
    // A released scrub is an interaction boundary: land the snapshot.
    onScrubEnd: () => {
      onScrubEnd?.();
      onCommit?.();
    },
  });

  const containerClass = bare
    ? `flex flex-1 min-w-0 items-center bg-transparent ${disabled ? "opacity-40 pointer-events-none" : ""} ${className ?? ""}`
    : `flex h-7 min-w-0 items-center rounded-xl bg-neutral-800 transition-colors hover:bg-neutral-800/80 focus-within:bg-neutral-800 focus-within:ring-1 focus-within:ring-[#a7ffd4]/40 ${disabled ? "opacity-40 pointer-events-none" : ""} ${className ?? ""}`;

  return (
    <div
      className={`${containerClass} ${showRange ? "relative overflow-hidden" : ""}`}
    >
      {prefix ? (
        <EditorTooltip title={ariaLabel || scrubHint} side="left" delay={250}>
          <span
            aria-hidden="true"
            tabIndex={-1}
            {...(disabled ? {} : scrub)}
            className="inline-flex items-center shrink-0 cursor-ew-resize touch-none select-none pl-2.5 pr-1 text-[11px] font-mono uppercase tracking-wide text-neutral-500 transition-colors hover:text-neutral-300"
          >
            {prefix}
          </span>
        </EditorTooltip>
      ) : null}
      <BoundedNumberInput
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
        onCommit={onCommit}
        ariaLabel={ariaLabel}
        inputRef={inputRef}
        disabled={disabled}
        className="h-full w-full min-w-0 bg-transparent px-2 text-[11px] font-mono tabular-nums text-neutral-100 outline-none cursor-text disabled:cursor-not-allowed"
      />
      {suffix ? (
        <span
          aria-hidden="true"
          title={ariaLabel || scrubHint}
          {...(disabled ? {} : scrub)}
          className="shrink-0 cursor-ew-resize touch-none select-none pr-2.5 text-[11px] font-mono text-neutral-500 transition-colors hover:text-neutral-300"
        >
          {suffix}
        </span>
      ) : null}
      {showRange ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-2 right-2 h-px rounded-full bg-white/[0.08]"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-white/35 transition-[width] duration-75"
            style={{
              width: `${Math.max(0, Math.min(100, ((value - min) / Math.max(1e-9, max - min)) * 100))}%`,
            }}
          />
        </span>
      ) : null}
    </div>
  );
}

ScrubField.propTypes = {
  prefix: PropTypes.node,
  suffix: PropTypes.node,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  onValueChange: PropTypes.func.isRequired,
  /** Called at the interaction boundary (scrub release / typed commit / arrow). */
  onCommit: PropTypes.func,
  onScrubStart: PropTypes.func,
  onScrubEnd: PropTypes.func,
  ariaLabel: PropTypes.string.isRequired,
  scrubHint: PropTypes.string,
  bare: PropTypes.bool,
  disabled: PropTypes.bool,
  showRange: PropTypes.bool,
  className: PropTypes.string,
};
