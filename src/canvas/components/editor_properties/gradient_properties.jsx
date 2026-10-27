/**
 * Fill & Gradient tool properties (Affinity Style).
 * Covers Flood Fill / Bucket Fill and Gradient interactive creation:
 * type chips, multi-stop editing (reusing the colour picker's stops bar),
 * the angle slider, reverse, and apply.
 */

import PropTypes from "prop-types";
import { useState } from "react";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import {
  StaticSection,
  sectionRowClass,
  sectionTitleClass,
} from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";
import { GradientStopsBar, MIN_STOPS } from "../../color_picker/GradientStopsBar.jsx";

const DEFAULT_TOOL_STOPS = [
  { color: "#FFFFFF", opacity: 100, position: 0 },
  { color: "#A651FF", opacity: 100, position: 100 },
];

export default function GradientProperties({
  tool,
  gradientType = "linear",
  onGradientType,
  gradientStops = null,
  onGradientStops = null,
  gradientAngle = 135,
  onGradientAngle = null,
  gradientActiveStop = 0,
  onGradientActiveStop = null,
  onApplyGradientTool = null,
  onReverseGradient,
  fillOpacity = 1,
  onFillOpacity,
  fillTolerance = 32,
  onFillTolerance,
  fillContiguous = true,
  onFillContiguous,
  gradientOpacity = 1,
  onGradientOpacity,
  fillSampleAll = false,
  onFillSampleAll,
}) {
  const { t } = useI18n();
  const [localActiveStop, setLocalActiveStop] = useState(0);
  const isGradient = tool === TOOL.GRADIENT;
  const isFill = tool === TOOL.FILL;

  const stops = gradientStops?.length ? gradientStops : DEFAULT_TOOL_STOPS;
  // The stops bar needs an index that survives stop-list edits clamping; fall
  // back to local state when the parent does not own the selection.
  const activeStop = Math.max(
    0,
    Math.min(
      stops.length - 1,
      onGradientActiveStop ? gradientActiveStop : localActiveStop,
    ),
  );
  const selectStop = (index) =>
    onGradientActiveStop ? onGradientActiveStop(index) : setLocalActiveStop(index);

  const changeStops = (nextStops, nextIndex = null) => {
    if (onGradientStops) {
      onGradientStops(nextStops);
      if (nextIndex != null) selectStop(nextIndex);
      return;
    }
    selectStop(nextIndex ?? activeStop);
  };

  return (
    <StaticSection
      title={
        isGradient ? t("editor.tool.gradient") : t("editor.tool.fill")
      }
    >
      <div className="flex flex-col gap-2.5">
        {(isGradient ? Boolean(onGradientOpacity) : Boolean(onFillOpacity)) && (
          <ToolSliderField label={t("editor.props.opacity")} min={0} max={100} value={Math.round((isGradient ? gradientOpacity : fillOpacity) * 100)} onValueChange={(value) => (isGradient ? onGradientOpacity : onFillOpacity)?.(value / 100)} ariaLabel={t("editor.props.opacity")} scrubHint={t("editor.props.dragToAdjust")} />
        )}
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

            {onGradientStops && (
              <div className="flex flex-col gap-1.5">
                <span className={sectionTitleClass}>
                  {t("editor.gradient.stopsTitle")}
                </span>
                <GradientStopsBar
                  stops={stops}
                  activeStopIndex={activeStop}
                  onSelectStop={selectStop}
                  onChangeStops={(nextStops) => changeStops(nextStops)}
                  gradientType={gradientType}
                  angle={`${Math.round(gradientAngle)}deg`}
                />
                <p className="text-[9px] font-mono text-neutral-500">
                  {t("editor.gradient.stopHint")}
                </p>
              </div>
            )}

            {gradientType !== "radial" && onGradientAngle && (
              <ToolSliderField
                label={t("editor.props.gradientAngle")}
                min={0}
                max={359}
                step={1}
                value={Math.round(gradientAngle)}
                onValueChange={(val) => onGradientAngle(val)}
                ariaLabel={t("editor.props.gradientAngle")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            )}

            {(onReverseGradient || stops.length > MIN_STOPS) && (
              <button
                type="button"
                onClick={onReverseGradient}
                className={`${sectionRowClass} justify-center gap-1.5 text-[10px] text-neutral-300`}
              >
                <span aria-hidden="true">⇄</span>
                <span>{t("editor.gradient.reverse")}</span>
              </button>
            )}

            {onApplyGradientTool && (
              <button
                type="button"
                onClick={onApplyGradientTool}
                className={`${sectionRowClass} justify-center text-[10px] text-[#a7ffd4] ring-1 ring-[#a7ffd4]/40`}
              >
                {t("editor.gradient.applyToLayer")}
              </button>
            )}
          </div>
        )}
        {isFill && (
          <div className="flex flex-col gap-1.5">
            {onFillTolerance ? (
              <ToolSliderField
                label={t("editor.fill.tolerance")}
                min={0}
                max={255}
                step={1}
                value={Math.round(fillTolerance)}
                onValueChange={(value) => onFillTolerance(value)}
                ariaLabel={t("editor.fill.tolerance")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-1.5">
              {onFillContiguous ? (
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
              ) : null}
              {onFillSampleAll ? (
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
              ) : null}
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
  gradientStops: PropTypes.arrayOf(
    PropTypes.shape({
      color: PropTypes.string.isRequired,
      opacity: PropTypes.number.isRequired,
      position: PropTypes.number.isRequired,
    }),
  ),
  onGradientStops: PropTypes.func,
  gradientAngle: PropTypes.number,
  onGradientAngle: PropTypes.func,
  gradientActiveStop: PropTypes.number,
  onGradientActiveStop: PropTypes.func,
  onApplyGradientTool: PropTypes.func,
  onReverseGradient: PropTypes.func,
  fillTolerance: PropTypes.number,
  onFillTolerance: PropTypes.func,
  fillOpacity: PropTypes.number,
  onFillOpacity: PropTypes.func,
  gradientOpacity: PropTypes.number,
  onGradientOpacity: PropTypes.func,
  fillContiguous: PropTypes.bool,
  onFillContiguous: PropTypes.func,
  fillSampleAll: PropTypes.bool,
  onFillSampleAll: PropTypes.func,
};
