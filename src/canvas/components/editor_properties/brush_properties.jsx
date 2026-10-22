/** Brush, eraser, retouch, and healing tool property controls. */

import PropTypes from "prop-types";
import {
  TOOL,
  BRUSH_WIDTH_MIN,
  BRUSH_WIDTH_MAX,
} from "../../editor/editor_constants.js";
import { healingModeFields } from "../../editor/healing_properties.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";
import { IconOpacity } from "../../icons.jsx";
import BrushRetouchControls from "./brush_retouch_controls.jsx";
import BrushAdvancedControls, {
  BRUSH_BLEND_OPTIONS,
} from "./brush_advanced_controls.jsx";

export { BRUSH_BLEND_OPTIONS };

const QUICK_BRUSH_SIZES = [4, 8, 16, 24, 48, 96, 160];

export default function BrushProperties({
  tool,
  brushWidth = 24,
  onBrushWidth,
  brushHardness = 0.5,
  onBrushHardness,
  brushOpacity = 1,
  onBrushOpacity,
  brushMode = "normal",
  brushFlow = 1,
  onBrushFlow,
  brushSmoothing = 0,
  onBrushSmoothing,
  brushStrength = 0.5,
  onBrushStrength,
  brushExposure = 0.5,
  onBrushExposure,
  brushTonalRange = "midtones",
  onBrushTonalRange,
  brushProtectLuminosity = false,
  onBrushProtectLuminosity,
  brushSaturating = true,
  onBrushSaturating,
  pressureSize = false,
  onPressureSize,
  pressureOpacity = false,
  onPressureOpacity,
  brushRoundness = 1,
  onBrushRoundness,
  brushAngle = 0,
  onBrushAngle,
  healingMode = "aiRepair",
  cloneAligned = false,
  onCloneAligned,
  brushBlendMode = "normal",
  onBrushBlendMode,
}) {
  const { t } = useI18n();

  const isNormalBrush = tool === TOOL.BRUSH && brushMode === "normal";
  const RETOUCH_TOOL_MODE = {
    [TOOL.BLUR]: "blur",
    [TOOL.SHARPEN]: "sharpen",
    [TOOL.SMUDGE]: "smudge",
    [TOOL.DODGE]: "dodge",
    [TOOL.BURN]: "burn",
    [TOOL.SPONGE]: "sponge",
  };
  const retouchEffectiveMode =
    RETOUCH_TOOL_MODE[tool] ??
    (tool === TOOL.BRUSH && brushMode !== "normal" ? brushMode : null);
  const isRetouchActive = Boolean(retouchEffectiveMode);
  const isDodgeBurn =
    retouchEffectiveMode === "dodge" || retouchEffectiveMode === "burn";
  const isSponge = retouchEffectiveMode === "sponge";
  const isSmudge = retouchEffectiveMode === "smudge";
  const isBlurOrSharpen =
    retouchEffectiveMode === "blur" || retouchEffectiveMode === "sharpen";
  const isEraser = tool === TOOL.ERASER;
  const healingFields =
    tool === TOOL.HEALING ? healingModeFields(healingMode) : [];
  const showHardness =
    isNormalBrush || isEraser || healingFields.includes("hardness");
  const showOpacity =
    isNormalBrush || isEraser || healingFields.includes("opacity");
  const showSmoothing = isNormalBrush || isEraser || isRetouchActive;
  const showStrength = isBlurOrSharpen || isSmudge;
  const showExposure = isDodgeBurn;

  return (
    <StaticSection
      title={
        isRetouchActive
          ? t(`editor.tool.${retouchEffectiveMode}`)
          : tool === TOOL.ERASER
            ? t("editor.tool.eraser")
            : tool === TOOL.HEALING
              ? t("editor.tool.healing")
              : t("editor.tool.brush")
      }
    >
      <div className="space-y-2">
        {/* 1. 画笔大小 (Brush Size) & 快速尺寸阶梯 */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {onBrushWidth &&
              (tool !== TOOL.HEALING || healingFields.includes("size")) && (
                <ScrubField
                  prefix={
                    <svg
                      className="w-3.5 h-3.5 text-neutral-400"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <polygon points="3,19 21,19 21,5" />
                    </svg>
                  }
                  min={BRUSH_WIDTH_MIN}
                  max={BRUSH_WIDTH_MAX}
                  value={brushWidth}
                  onValueChange={(val) => onBrushWidth(val)}
                  ariaLabel={t("editor.brushWidth") || "画笔大小"}
                  scrubHint={t("editor.props.dragToAdjust")}
                  showRange
                />
              )}
            {showHardness && onBrushHardness ? (
              <ScrubField
                prefix={
                  <svg
                    className="w-3.5 h-3.5 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="8"
                      strokeDasharray="2.5 2.5"
                    />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                }
                suffix="%"
                min={0}
                max={100}
                value={Math.round(brushHardness * 100)}
                onValueChange={(val) => onBrushHardness(val / 100)}
                ariaLabel={t("editor.brushHardness") || "画笔硬度"}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            ) : null}
            {showStrength && onBrushStrength ? (
              <ScrubField
                prefix={
                  <svg
                    className="h-3.5 w-3.5 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 12h16" />
                    <path d="M8 8v8M16 8v8" opacity="0.5" />
                  </svg>
                }
                suffix="%"
                min={0}
                max={100}
                value={Math.round(brushStrength * 100)}
                onValueChange={(val) => onBrushStrength(val / 100)}
                ariaLabel={t(
                  `editor.brushMode.${retouchEffectiveMode}.strength`,
                )}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            ) : null}
            {showExposure && onBrushExposure ? (
              <ScrubField
                prefix={
                  <svg
                    className="h-3.5 w-3.5 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="7" />
                    <path
                      d="M12 5v3M12 16v3M5 12h3M16 12h3"
                      strokeWidth="1.5"
                    />
                  </svg>
                }
                suffix="%"
                min={0}
                max={100}
                value={Math.round(brushExposure * 100)}
                onValueChange={(val) => onBrushExposure(val / 100)}
                ariaLabel={t(
                  `editor.brushMode.${retouchEffectiveMode}.exposure`,
                )}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            ) : null}
            {isSponge && onBrushFlow ? (
              <ScrubField
                prefix={
                  <svg
                    className="w-3.5 h-3.5 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <path
                      d="M12 4 A8 8 0 0 1 12 20 Z"
                      fill="currentColor"
                      opacity="0.5"
                    />
                    <path d="M12 12 L12 4" stroke="currentColor" />
                  </svg>
                }
                suffix="%"
                min={0}
                max={100}
                value={Math.round(brushFlow * 100)}
                onValueChange={(val) => onBrushFlow(val / 100)}
                ariaLabel={t("editor.brushMode.sponge.flow")}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            ) : null}
          </div>

          {/* Quick Brush Size Presets (Affinity Style) */}
          {onBrushWidth && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[9px] font-mono text-neutral-500 uppercase shrink-0 mr-0.5">
                Size
              </span>
              {QUICK_BRUSH_SIZES.map((size) => {
                const isActive = Math.round(brushWidth) === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onBrushWidth(size)}
                    className={`h-5 min-w-[24px] px-1.5 flex items-center justify-center rounded-md text-[10px] font-mono transition-all ${
                      isActive
                        ? "bg-[#a7ffd4] text-black font-semibold shadow-pop"
                        : "bg-white/[0.06] text-neutral-400 hover:bg-white/[0.12] hover:text-neutral-200"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. 压感控制 (Pressure Dynamics: Size & Opacity - Front and Center) */}
        {(onPressureSize || onPressureOpacity) &&
          (tool === TOOL.BRUSH || tool === TOOL.ERASER || isRetouchActive) && (
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              {onPressureSize && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={pressureSize}
                  onClick={() => onPressureSize(!pressureSize)}
                  title="随压感变化笔刷粗细 (Pressure controls brush size)"
                  className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-all text-left ${
                    pressureSize
                      ? "bg-[#a7ffd4]/15 border border-[#a7ffd4]/40 text-[#a7ffd4]"
                      : "bg-[#222222] border border-white/5 text-neutral-400 hover:bg-[#282828] hover:text-neutral-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 19l7-7 3 3-7 7-3-3z" />
                      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                      <path d="M2 2l7.586 7.586" />
                    </svg>
                    <span className="text-[10px] font-mono truncate">
                      {t("editor.pressureSize") || "压感大小"}
                    </span>
                  </div>
                  <span
                    className={`size-2 rounded-full shrink-0 ${
                      pressureSize ? "bg-[#a7ffd4]" : "bg-white/20"
                    }`}
                  />
                </button>
              )}
              {onPressureOpacity && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={pressureOpacity}
                  onClick={() => onPressureOpacity(!pressureOpacity)}
                  title="随压感变化不透明度 (Pressure controls opacity)"
                  className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-all text-left ${
                    pressureOpacity
                      ? "bg-[#a7ffd4]/15 border border-[#a7ffd4]/40 text-[#a7ffd4]"
                      : "bg-[#222222] border border-white/5 text-neutral-400 hover:bg-[#282828] hover:text-neutral-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
                    </svg>
                    <span className="text-[10px] font-mono truncate">
                      {t("editor.pressureOpacity") || "压感浓度"}
                    </span>
                  </div>
                  <span
                    className={`size-2 rounded-full shrink-0 ${
                      pressureOpacity ? "bg-[#a7ffd4]" : "bg-white/20"
                    }`}
                  />
                </button>
              )}
            </div>
          )}

        {/* 3. 不透明度、流量与平滑度 (Opacity, Flow, Smoothing) */}
        <div className="grid grid-cols-2 gap-1.5">
          {showOpacity && onBrushOpacity ? (
            <ScrubField
              prefix={<IconOpacity size={14} className="text-neutral-400" />}
              suffix="%"
              min={0}
              max={100}
              value={Math.round(brushOpacity * 100)}
              onValueChange={(val) => onBrushOpacity(val / 100)}
              ariaLabel={t("editor.brushOpacity") || "不透明度"}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          ) : null}
          {(isNormalBrush || isEraser) && onBrushFlow ? (
            <ScrubField
              prefix={
                <svg
                  className="w-3.5 h-3.5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path
                    d="M12 4 A8 8 0 0 1 12 20 Z"
                    fill="currentColor"
                    opacity="0.5"
                  />
                  <path d="M12 12 L12 4" stroke="currentColor" />
                </svg>
              }
              suffix="%"
              min={0}
              max={100}
              value={Math.round(brushFlow * 100)}
              onValueChange={(val) => onBrushFlow(val / 100)}
              ariaLabel={t("editor.brushFlow") || "流量"}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          ) : null}
          {showSmoothing && onBrushSmoothing ? (
            <ScrubField
              prefix={
                <span className="text-[12px] leading-none text-neutral-400">
                  〰
                </span>
              }
              suffix="%"
              min={0}
              max={100}
              value={Math.round(brushSmoothing * 100)}
              onValueChange={(val) => onBrushSmoothing(val / 100)}
              ariaLabel={t("editor.brushSmoothing") || "平滑度"}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          ) : null}
        </div>

        <BrushRetouchControls
          isDodgeBurn={isDodgeBurn}
          brushTonalRange={brushTonalRange}
          onBrushTonalRange={onBrushTonalRange}
          brushProtectLuminosity={brushProtectLuminosity}
          onBrushProtectLuminosity={onBrushProtectLuminosity}
          isSponge={isSponge}
          brushSaturating={brushSaturating}
          onBrushSaturating={onBrushSaturating}
        />

        <BrushAdvancedControls
          tool={tool}
          isNormalBrush={isNormalBrush}
          isRetouchActive={isRetouchActive}
          brushRoundness={brushRoundness}
          onBrushRoundness={onBrushRoundness}
          brushAngle={brushAngle}
          onBrushAngle={onBrushAngle}
          brushBlendMode={brushBlendMode}
          onBrushBlendMode={onBrushBlendMode}
          healingMode={healingMode}
          cloneAligned={cloneAligned}
          onCloneAligned={onCloneAligned}
        />
      </div>
    </StaticSection>
  );
}

BrushProperties.propTypes = {
  tool: PropTypes.string,
  brushWidth: PropTypes.number,
  onBrushWidth: PropTypes.func,
  brushHardness: PropTypes.number,
  onBrushHardness: PropTypes.func,
  brushOpacity: PropTypes.number,
  onBrushOpacity: PropTypes.func,
  brushMode: PropTypes.oneOf([
    "normal",
    "smudge",
    "blur",
    "sharpen",
    "dodge",
    "burn",
    "sponge",
  ]),
  brushFlow: PropTypes.number,
  onBrushFlow: PropTypes.func,
  brushSmoothing: PropTypes.number,
  onBrushSmoothing: PropTypes.func,
  brushStrength: PropTypes.number,
  onBrushStrength: PropTypes.func,
  brushExposure: PropTypes.number,
  onBrushExposure: PropTypes.func,
  brushTonalRange: PropTypes.oneOf(["shadows", "midtones", "highlights"]),
  onBrushTonalRange: PropTypes.func,
  brushProtectLuminosity: PropTypes.bool,
  onBrushProtectLuminosity: PropTypes.func,
  brushSaturating: PropTypes.bool,
  onBrushSaturating: PropTypes.func,
  pressureSize: PropTypes.bool,
  onPressureSize: PropTypes.func,
  pressureOpacity: PropTypes.bool,
  onPressureOpacity: PropTypes.func,
  brushRoundness: PropTypes.number,
  onBrushRoundness: PropTypes.func,
  brushAngle: PropTypes.number,
  onBrushAngle: PropTypes.func,
  healingMode: PropTypes.oneOf(["spot", "aiRepair", "patch", "clone"]),
  cloneAligned: PropTypes.bool,
  onCloneAligned: PropTypes.func,
  brushBlendMode: PropTypes.string,
  onBrushBlendMode: PropTypes.func,
};
