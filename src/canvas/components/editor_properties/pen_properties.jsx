/** Pen tool properties: shape vs path mode, stroke weight, and corner vs smooth anchor style. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";

export default function PenProperties({
  penMode = "shape",
  onPenMode,
  penStrokeWidth = 1,
  onPenStrokeWidth,
  penAnchorType = "corner",
  onPenAnchorType,
}) {
  const { t } = useI18n();

  return (
    <>
      {onPenMode && (
        <StaticSection title={t("editor.pen.mode")}>
          <div className="grid grid-cols-2 gap-1.5">
            {["shape", "path"].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onPenMode(mode)}
                aria-pressed={penMode === mode}
                className={`${sectionRowClass} justify-center text-[10px] ${
                  penMode === mode
                    ? "text-white ring-1 ring-white/25"
                    : "text-neutral-400"
                }`}
              >
                {mode === "shape"
                  ? t("editor.pen.modeShape")
                  : t("editor.pen.modePath")}
              </button>
            ))}
          </div>
        </StaticSection>
      )}

      {onPenStrokeWidth && (
        <ToolSliderField
          label={t("editor.strokeStyle.weight")}
          icon={
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line
                x1="3"
                y1="12"
                x2="21"
                y2="12"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          }
          suffix="px"
          min={1}
          max={256}
          step={1}
          value={Math.round(penStrokeWidth)}
          onValueChange={(val) => onPenStrokeWidth(val)}
          ariaLabel={t("editor.strokeStyle.weight")}
          scrubHint={t("editor.props.dragToAdjust")}
        />
      )}

      {onPenAnchorType && (
        <StaticSection title={t("editor.pen.anchorType")}>
          <div className="grid grid-cols-2 gap-1.5">
            {["corner", "smooth"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onPenAnchorType(type)}
                className={`${sectionRowClass} justify-center text-[10px] ${
                  penAnchorType === type
                    ? "text-white ring-1 ring-white/25"
                    : "text-neutral-400"
                }`}
              >
                {type === "corner"
                  ? t("editor.pen.anchorCorner")
                  : t("editor.pen.anchorSmooth")}
              </button>
            ))}
          </div>
        </StaticSection>
      )}
    </>
  );
}

PenProperties.propTypes = {
  penMode: PropTypes.oneOf(["shape", "path"]),
  onPenMode: PropTypes.func,
  penStrokeWidth: PropTypes.number,
  onPenStrokeWidth: PropTypes.func,
  penAnchorType: PropTypes.string,
  onPenAnchorType: PropTypes.func,
};
