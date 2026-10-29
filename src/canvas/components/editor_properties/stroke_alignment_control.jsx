import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { STROKE_ALIGN } from "../../editor/stroke_style.js";

const ALIGNMENTS = [
  {
    value: STROKE_ALIGN.INSIDE,
    label: "editor.strokeStyle.alignInside",
    position: "inside",
  },
  {
    value: STROKE_ALIGN.CENTER,
    label: "editor.strokeStyle.alignCenter",
    position: "center",
  },
  {
    value: STROKE_ALIGN.OUTSIDE,
    label: "editor.strokeStyle.alignOutside",
    position: "outside",
  },
];

function StrokePositionIcon({ position }) {
  const inset = position === "inside" ? 4.5 : position === "outside" ? 1.5 : 3;
  const size = 16 - inset * 2;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="10"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.55"
      />
      <rect
        x={inset}
        y={inset}
        width={size}
        height={size}
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

StrokePositionIcon.propTypes = { position: PropTypes.string.isRequired };

export default function StrokeAlignmentControl({
  value,
  onChange,
  disabled = false,
}) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("editor.strokeStyle.align")}
      className={`flex h-7 shrink-0 items-center gap-0.5 rounded-lg bg-neutral-800 p-0.5 ${disabled ? "opacity-40" : ""}`}
    >
      {ALIGNMENTS.map(({ value: alignment, label, position }) => (
        <button
          key={alignment}
          type="button"
          aria-label={t(label)}
          title={t(label)}
          aria-pressed={value === alignment}
          disabled={disabled}
          onClick={() => onChange(alignment)}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
            value === alignment
              ? "bg-white/[0.12] text-white"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
        >
          <StrokePositionIcon position={position} />
        </button>
      ))}
    </div>
  );
}

StrokeAlignmentControl.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
