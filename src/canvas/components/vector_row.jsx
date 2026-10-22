import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { ICON_STROKE_WIDTH, IconLock, IconUnlock } from "../icons.jsx";
import { useScrubDrag } from "./use_scrub_drag.js";

const INPUT_CLASS =
  "h-7 w-full min-w-0 rounded-xl bg-neutral-800 transition-colors hover:bg-neutral-800/80 pl-5 pr-1 text-[11px] font-mono tabular-nums text-neutral-100 outline-none [appearance:textfield] focus-visible:ring-1 focus-visible:ring-[#a7ffd4] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Trim float noise the way a design tool does: 1.1, not 1.0999999. */
function display(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(3)));
}

/** Shared by the input event and its regression tests so zero stays numeric. */
export function stepVectorValue({
  draft,
  shown,
  dir = 1,
  snapStepOnShift = 10,
  min,
  max,
}) {
  const current = Number.isFinite(Number(draft)) ? Number(draft) : shown;
  const nextVal =
    Math.round((current + dir * snapStepOnShift) / snapStepOnShift) *
    snapStepOnShift;
  return min !== undefined && nextVal < min
    ? min
    : max !== undefined && nextVal > max
      ? max
      : nextVal;
}

/**
 * One axis of a vector row: a muted axis letter inside a compact number field.
 */
function VectorField({
  axis,
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  snapStepOnShift = null,
  onChange,
  onCommit,
  mixed = false,
}) {
  const field = { value, onChange, onCommit };
  const shown = field.value;
  const [draft, setDraft] = useState(mixed ? "" : display(shown));
  useEffect(() => setDraft(mixed ? "" : display(shown)), [shown, mixed]);
  const inputRef = useRef(null);
  const scrub = useScrubDrag({
    value: shown,
    step,
    min,
    max,
    snapStepOnShift,
    onScrub: (val) => field.onChange(val),
    onTap: () => inputRef.current?.focus(),
    onScrubEnd: () => field.onCommit?.(),
  });

  return (
    <div className="group relative min-w-0 flex-1">
      <span
        {...scrub}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize select-none text-[9px] text-neutral-500 hover:text-neutral-300"
      >
        {axis}
      </span>
      {mixed && draft === "" ? (
        <span
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-neutral-500"
        >
          —
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="number"
        aria-label={ariaLabel}
        className={INPUT_CLASS}
        value={draft}
        placeholder={mixed ? "—" : undefined}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const number = Number(next);
          if (
            next !== "" &&
            Number.isFinite(number) &&
            (min === undefined || number >= min) &&
            (max === undefined || number <= max)
          ) {
            field.onChange(number);
          }
        }}
        onBlur={() => {
          setDraft(mixed && draft === "" ? "" : display(shown));
          field.onCommit?.();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (
            (event.key === "ArrowUp" || event.key === "ArrowDown") &&
            event.shiftKey &&
            snapStepOnShift
          ) {
            event.preventDefault();
            const dir = event.key === "ArrowUp" ? 1 : -1;
            const clamped = stepVectorValue({
              draft,
              shown,
              dir,
              snapStepOnShift,
              min,
              max,
            });
            setDraft(display(clamped));
            field.onChange(clamped);
            field.onCommit?.();
            return;
          }
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </div>
  );
}

VectorField.propTypes = {
  axis: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  value: PropTypes.number,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  snapStepOnShift: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  mixed: PropTypes.bool,
};

/** Label on the left, up to three axis fields on the right (Spline's Transform). */
export default function VectorRow({
  label,
  fields,
  testId = undefined,
  lock = null,
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 items-center gap-2"
      role="group"
      aria-label={label}
    >
      <span className="flex w-16 shrink-0 items-center gap-1 text-[11px] text-neutral-400">
        <span className="truncate">{label}</span>
        {lock ? (
          <button
            type="button"
            data-testid={`${testId ?? "vector"}-lock`}
            aria-label={lock.label}
            title={lock.label}
            aria-pressed={lock.locked}
            onClick={lock.onToggle}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              lock.locked ? "text-[#eed0ff]" : "text-neutral-500"
            }`}
          >
            {lock.locked ? (
              <IconLock size={11} strokeWidth={ICON_STROKE_WIDTH} />
            ) : (
              <IconUnlock size={11} strokeWidth={ICON_STROKE_WIDTH} />
            )}
          </button>
        ) : null}
      </span>
      <div
        className={`flex min-w-0 flex-1 items-center gap-1 ${
          fields.length === 1 ? "max-w-[50%]" : ""
        }`}
      >
        {fields.map((field) => (
          <VectorField key={field.axis} {...field} />
        ))}
      </div>
    </div>
  );
}

VectorRow.propTypes = {
  label: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(PropTypes.shape(VectorField.propTypes)).isRequired,
  testId: PropTypes.string,
  lock: PropTypes.shape({
    locked: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    label: PropTypes.string.isRequired,
  }),
};
