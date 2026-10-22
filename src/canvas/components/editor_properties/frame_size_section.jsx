import { useState } from "react";
import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";

const FIELD_CLASS =
  "h-7 w-full min-w-0 rounded-lg bg-neutral-800 px-2 text-[11px] font-mono text-neutral-200 outline-none focus:bg-neutral-700";

/** One labelled number field; applies on blur or Enter, reverts when the value is not usable. */
function NumberField({ label, value, min, ariaLabel, onApply }) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < min) {
      setDraft(String(Math.round(value)));
      return;
    }
    if (Math.round(next) !== Math.round(value)) onApply(Math.round(next));
  };
  return (
    <label className="flex items-center gap-2">
      <span className="w-3 text-[10px] font-mono text-neutral-500">{label}</span>
      <input
        type="number"
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={FIELD_CLASS}
      />
    </label>
  );
}

NumberField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  onApply: PropTypes.func.isRequired,
};

/** Position (X, Y) and size (W, H) of the selected frame, edited like the object transform. */
export default function FrameSizeSection({
  x,
  y,
  width,
  height,
  onSetPosition,
  onSetSize,
}) {
  const { t } = useI18n();
  const label = t("editor.frame.size");
  return (
    <div className="grid grid-cols-2 gap-2 px-3 py-2">
      <NumberField
        label="X"
        value={x}
        min={-1000000}
        ariaLabel={`${label} X`}
        onApply={(next) => onSetPosition(next, y)}
      />
      <NumberField
        label="Y"
        value={y}
        min={-1000000}
        ariaLabel={`${label} Y`}
        onApply={(next) => onSetPosition(x, next)}
      />
      <NumberField
        label="W"
        value={width}
        min={1}
        ariaLabel={`${label} W`}
        onApply={(next) => onSetSize(next, height)}
      />
      <NumberField
        label="H"
        value={height}
        min={1}
        ariaLabel={`${label} H`}
        onApply={(next) => onSetSize(width, next)}
      />
    </div>
  );
}

FrameSizeSection.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onSetPosition: PropTypes.func.isRequired,
  onSetSize: PropTypes.func.isRequired,
};
