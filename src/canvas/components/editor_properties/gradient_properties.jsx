/**
 * Fill & Gradient tool properties (Affinity Style).
 * Covers Flood Fill / Bucket Fill and Gradient interactive creation.
 */

import PropTypes from "prop-types";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import {
  StaticSection,
  sectionRowClass,
  sectionTitleClass,
} from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";

export default function GradientProperties({
  tool,
  gradientType = "linear",
  onGradientType,
  fillTolerance = 32,
  onFillTolerance,
  fillContiguous = true,
  onFillContiguous,
  fillSampleAll = false,
  onFillSampleAll,
  onReverseGradient,
}) {
  const { t } = useI18n();
  const isGradient = tool === TOOL.GRADIENT;
  const isFill = tool === TOOL.FILL;

  return (
    <StaticSection
      title={
        isGradient ? t("editor.tool.gradient") : t("editor.tool.fill")
      }
    >
      <div className="flex flex-col gap-2.5">
        {isGradient && (
          <div className="flex flex-col gap-1.5">
            <span className={sectionTitleClass}>
              {t("editor.gradient.type")}
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                {
                  id: "linear",
                  label: t("editor.props.gradient.linear"),
                },
                {
                  id: "radial",
                  label: t("editor.props.gradient.radial"),
                },
                {
                  id: "angular",
                  label: t("editor.props.gradient.angular"),
                },
              ].map((gradient) => (
                <button
                  key={gradient.id}
                  type="button"
                  onClick={() => onGradientType?.(gradient.id)}
                  aria-pressed={gradientType === gradient.id}
                  className={`${sectionRowClass} justify-center text-[10px] ${
                    gradientType === gradient.id
                      ? "text-white ring-1 ring-white/25"
                      : "text-neutral-400"
                  }`}
                >
                  {gradient.label}
                </button>
              ))}
            </div>

            {onReverseGradient && (
              <button
                type="button"
                onClick={onReverseGradient}
                className={`${sectionRowClass} justify-center gap-1.5 text-[10px] text-neutral-300`}
              >
                <span aria-hidden="true">⇄</span>
                <span>{t("editor.gradient.reverse")}</span>
              </button>
            )}
          </div>
        )}

        {isFill && (
          <div className="flex flex-col gap-1.5">
            {onFillTolerance && (
              <ToolSliderField
                label={t("editor.fill.tolerance")}
                min={0}
                max={255}
                step={1}
                value={Math.round(fillTolerance)}
                onValueChange={(val) => onFillTolerance(val)}
                ariaLabel={t("editor.fill.tolerance")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {onFillContiguous && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={fillContiguous}
                  onClick={() => onFillContiguous(!fillContiguous)}
                  className={`${sectionRowClass} justify-center text-[10px] ${
                    fillContiguous
                      ? "text-[#a7ffd4] ring-1 ring-[#a7ffd4]/40"
                      : "text-neutral-400"
                  }`}
                >
                  {t("editor.fill.contiguous")}
                </button>
              )}
              {onFillSampleAll && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={fillSampleAll}
                  onClick={() => onFillSampleAll(!fillSampleAll)}
                  className={`${sectionRowClass} justify-center text-[10px] ${
                    fillSampleAll
                      ? "text-[#a7ffd4] ring-1 ring-[#a7ffd4]/40"
                      : "text-neutral-400"
                  }`}
                >
                  {t("editor.fill.sampleAll")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </StaticSection>
  );
}

GradientProperties.propTypes = {
  tool: PropTypes.string,
  gradientType: PropTypes.string,
  onGradientType: PropTypes.func,
  fillTolerance: PropTypes.number,
  onFillTolerance: PropTypes.func,
  fillContiguous: PropTypes.bool,
  onFillContiguous: PropTypes.func,
  fillSampleAll: PropTypes.bool,
  onFillSampleAll: PropTypes.func,
  onReverseGradient: PropTypes.func,
};
