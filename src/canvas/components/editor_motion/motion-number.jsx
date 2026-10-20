import PropTypes from "prop-types";
import { useEffect, useState } from "react";

export const MOTION_INPUT_CLASS =
  "h-7 min-w-0 rounded-xl bg-neutral-800 transition-colors hover:bg-neutral-800/80 px-2 py-1 text-[11px] tabular-nums text-neutral-100 outline-none focus:ring-1 focus:ring-[#a7ffd4]/40";

/** Commit at the input boundary so typing a duration creates one undo step. */
export default function MotionNumber({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = Number(draft);
    if (draft !== "" && Number.isFinite(next) && next >= min && next <= max) {
      if (next !== value) onCommit(next);
    } else {
      setDraft(String(value));
    }
  };
  return (
    <label className="flex min-w-0 items-center gap-1 text-[10px] text-neutral-400">
      <span>{label}</span>
      <input
        className={`${MOTION_INPUT_CLASS} w-16`}
        type="number"
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}

MotionNumber.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number.isRequired,
  onCommit: PropTypes.func.isRequired,
};
