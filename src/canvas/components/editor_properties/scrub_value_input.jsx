import PropTypes from "prop-types";
import { useRef, useState } from "react";
import { useScrubDrag } from "../use_scrub_drag.js";
import { parseValueInput } from "../../editor/scrub_math.js";

/**
 * The value readout on a slider row, Figma-style: an editable number instead
 * of static text. Drag horizontally to scrub (same write path as the slider,
 * so the fallback debounced commit still applies); click — or focus and press
 * Enter — to type a value, which is snapped to the step grid and clamped on
 * commit. Escape cancels the edit.
 *
 * `onCommit` fires at the interaction boundary — scrub drag released, typed
 * value committed, arrow-step pressed — so the property panel can land one
 * history snapshot per gesture instead of per tick.
 */
export default function ScrubValueInput({
  value,
  min,
  max,
  step = 1,
  format = (value) => String(value),
  onChange,
  onCommit = undefined,
  ariaLabel,
  disabled = false,
  scrubHint = undefined,
  className = undefined,
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const scrubbedRef = useRef(false);
  const cancelRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const scrub = useScrubDrag({
    value,
    step,
    min,
    max,
    onScrub: (next) => {
      scrubbedRef.current = true;
      onChange(next);
    },
    onScrubEnd: () => onCommitRef.current?.(),
  });

  const commit = () => {
    const raw = inputRef.current?.value ?? "";
    setEditing(false);
    onChange(parseValueInput(raw, { step, min, max, fallback: value }));
    onCommitRef.current?.();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        type="text"
        inputMode="decimal"
        defaultValue={String(value)}
        aria-label={ariaLabel}
        title={ariaLabel}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancelRef.current = true;
            event.currentTarget.blur();
          }
        }}
        onKeyUp={(event) => event.stopPropagation()}
        onBlur={() => {
          if (cancelRef.current) {
            cancelRef.current = false;
            setEditing(false);
          } else {
            commit();
          }
        }}
        className={`rounded-md bg-[#2a2a2a] px-1 py-0.5 text-right text-[10px] font-mono tabular-nums text-neutral-100 outline-none ring-1 ring-white/20 ${className ?? ""}`}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      title={scrubHint}
      {...scrub}
      onClick={() => {
        // A scrub ending on this spot still fires click; ignore that one.
        if (scrubbedRef.current) {
          scrubbedRef.current = false;
          return;
        }
        setEditing(true);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? 1 : -1;
        onChange(
          parseValueInput(value + direction * step, {
            step,
            min,
            max,
            fallback: value,
          }),
        );
        onCommitRef.current?.();
      }}
      className={`cursor-text touch-none select-none rounded-md px-1 py-0.5 text-right text-[10px] font-mono tabular-nums text-neutral-400 transition-colors hover:text-neutral-200 disabled:cursor-default disabled:opacity-40 ${className ?? ""}`}
    >
      {format(value)}
    </button>
  );
}

ScrubValueInput.propTypes = {
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  format: PropTypes.func,
  onChange: PropTypes.func.isRequired,
  /** Called at the interaction boundary (scrub release / typed commit / arrow). */
  onCommit: PropTypes.func,
  ariaLabel: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  scrubHint: PropTypes.string,
  className: PropTypes.string,
};
