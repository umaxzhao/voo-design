/** Pen tool properties: shape vs path mode, stroke weight, and corner vs smooth anchor style. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";

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
                className={`rounded-xl py-1.5 text-[11px] font-mono transition-all ${
                  penMode === mode
                    ? "bg-white text-black font-semibold"
                    : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
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
        <StaticSection title={t("editor.strokeStyle.weight")}>
          <ScrubField
            prefix={
              <svg
                className="w-3.5 h-3.5 text-neutral-400"
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
        </StaticSection>
      )}

      {onPenAnchorType && (
        <StaticSection title={t("editor.pen.anchorType")}>
          <div className="grid grid-cols-2 gap-1.5">
            {["corner", "smooth"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onPenAnchorType(type)}
                className={`rounded-xl py-1.5 text-[11px] font-mono transition-all ${
                  penAnchorType === type
                    ? "bg-white text-black font-semibold"
                    : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
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
