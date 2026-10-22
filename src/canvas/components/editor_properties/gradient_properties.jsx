/**
 * Fill & Gradient tool properties (Affinity Style).
 * Covers Flood Fill / Bucket Fill and Gradient interactive creation.
 */

import PropTypes from "prop-types";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";

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
      title={isGradient ? t("editor.tool.gradient") || "渐变工具" : t("editor.tool.fill") || "油漆桶填充"}
    >
      <div className="flex flex-col gap-2">
        {/* For Gradient Tool: Type Switcher & Reverse */}
        {isGradient && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-neutral-400">
              渐变类型 (Gradient Type)
            </span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-900 border border-white/10 p-0.5">
              {[
                { id: "linear", label: "线性 Linear" },
                { id: "radial", label: "径向 Radial" },
                { id: "angular", label: "角度 Angular" },
              ].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onGradientType?.(g.id)}
                  aria-pressed={gradientType === g.id}
                  className={`h-7 flex items-center justify-center rounded-md text-[10px] font-mono transition-colors ${
                    gradientType === g.id
                      ? "bg-white/20 text-white font-medium"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {onReverseGradient && (
              <button
                type="button"
                onClick={onReverseGradient}
                className="mt-0.5 flex h-7 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 border border-white/10 text-[10px] font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                <span>⇄</span>
                <span>反转渐变色标 (Reverse Gradient)</span>
              </button>
            )}
          </div>
        )}

        {/* For Bucket Fill Tool: Tolerance & Contiguous */}
        {isFill && (
          <div className="flex flex-col gap-1.5">
            {onFillTolerance && (
              <ScrubField
                prefix="容差"
                min={0}
                max={255}
                step={1}
                value={Math.round(fillTolerance)}
                onValueChange={(val) => onFillTolerance(val)}
                ariaLabel="填充容差 (Tolerance)"
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            )}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              {onFillContiguous && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={fillContiguous}
                  onClick={() => onFillContiguous(!fillContiguous)}
                  className={`flex h-7 items-center justify-center rounded-lg border text-[10px] font-mono transition-colors ${
                    fillContiguous
                      ? "bg-[#a7ffd4]/15 border-[#a7ffd4]/40 text-[#a7ffd4]"
                      : "bg-neutral-900 border-white/10 text-neutral-400 hover:text-white"
                  }`}
                >
                  连续区域 (Contiguous)
                </button>
              )}
              {onFillSampleAll && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={fillSampleAll}
                  onClick={() => onFillSampleAll(!fillSampleAll)}
                  className={`flex h-7 items-center justify-center rounded-lg border text-[10px] font-mono transition-colors ${
                    fillSampleAll
                      ? "bg-[#a7ffd4]/15 border-[#a7ffd4]/40 text-[#a7ffd4]"
                      : "bg-neutral-900 border-white/10 text-neutral-400 hover:text-white"
                  }`}
                >
                  所有图层取样
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
