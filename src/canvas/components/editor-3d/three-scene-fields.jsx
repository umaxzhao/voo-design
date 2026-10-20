import PropTypes from "prop-types";
import { useEffect, useState } from "react";

const INPUT_CLASS =
  "h-7 min-w-0 flex-1 rounded-xl bg-neutral-800 px-2 text-[11px] font-mono tabular-nums text-neutral-100 outline-none transition-colors hover:bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";

export function commitColorPickerChange(onChange, onCommit, value) {
  onChange(value);
  onCommit?.();
}

export function NumberField({
  label,
  value,
  mixed = false,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
}) {
  const [draft, setDraft] = useState(mixed ? "" : String(value ?? 0));
  useEffect(() => setDraft(mixed ? "" : String(value ?? 0)), [mixed, value]);
  return (
    <label className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
      <span className="w-24 shrink-0 truncate">{label}</span>
      <input
        type="number"
        aria-label={label}
        className={INPUT_CLASS}
        value={mixed ? "" : draft}
        placeholder={mixed ? "—" : undefined}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const number = Number(nextDraft);
          if (
            nextDraft !== "" &&
            Number.isFinite(number) &&
            (min === undefined || number >= min) &&
            (max === undefined || number <= max)
          ) {
            onChange(number);
          }
        }}
        onBlur={() => {
          setDraft(mixed ? "" : String(value ?? 0));
          onCommit?.();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

NumberField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  mixed: PropTypes.bool,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
};

export function ColorField({ label, value, onChange, onCommit }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
      <span className="w-24 shrink-0 truncate">{label}</span>
      <input
        type="color"
        aria-label={label}
        className="h-7 min-w-0 flex-1 cursor-pointer rounded-lg bg-neutral-800 transition-colors hover:bg-neutral-800/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
        value={/^#[\da-fA-F]{6}$/.test(value ?? "") ? value : "#ffffff"}
        onChange={(event) => {
          commitColorPickerChange(onChange, onCommit, event.target.value);
        }}
      />
    </label>
  );
}

ColorField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
};

export function SelectField({ label, value, options, onChange, onCommit }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
      <span className="w-24 shrink-0 truncate">{label}</span>
      <select
        aria-label={label}
        className={INPUT_CLASS}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onCommit?.();
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {options.map(({ value: optionValue, label: optionLabel }) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

SelectField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
};
