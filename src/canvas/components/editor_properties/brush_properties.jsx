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
import ToolSliderField from "./tool_slider_field.jsx";
import { IconOpacity } from "../../icons.jsx";
import BrushRetouchControls from "./brush_retouch_controls.jsx";
import BrushAdvancedControls, {
  BRUSH_BLEND_OPTIONS,
} from "./brush_advanced_controls.jsx";

export { BRUSH_BLEND_OPTIONS };

const QUICK_BRUSH_SIZES = [4, 8, 16, 24, 48, 96, 160];

const SizeIcon = () => (
  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="3,19 21,19 21,5" />
  </svg>
);

const HardnessIcon = () => (
  <svg
    className="h-3 w-3"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="8" strokeDasharray="2.5 2.5" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);

const StrengthIcon = () => (
  <svg
    className="h-3 w-3"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M4 12h16" />
    <path d="M8 8v8M16 8v8" opacity="0.5" />
  </svg>
);

const ExposureIcon = () => (
  <svg
    className="h-3 w-3"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="7" />
    <path d="M12 5v3M12 16v3M5 12h3M16 12h3" strokeWidth="1.5" />
  </svg>
);

const FlowIcon = () => (
  <svg
    className="h-3 w-3"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4 A8 8 0 0 1 12 20 Z" fill="currentColor" opacity="0.5" />
    <path d="M12 12 L12 4" stroke="currentColor" />
  </svg>
);

const SmoothingIcon = () => (
  <svg
    className="h-3 w-3"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M3 16c3-6 6 4 9-2s6 2 9-4" />
  </svg>
);

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
  const showSize =
    Boolean(onBrushWidth) &&
    (tool !== TOOL.HEALING || healingFields.includes("size"));

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
      <div className="space-y-2.5">
        {showSize ? (
          <ToolSliderField
            label={t("editor.brushWidth")}
            icon={<SizeIcon />}
            min={BRUSH_WIDTH_MIN}
            max={BRUSH_WIDTH_MAX}
            value={Math.round(brushWidth)}
            onValueChange={onBrushWidth}
            suffix="px"
            ariaLabel={t("editor.brushWidth")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {showHardness && onBrushHardness ? (
          <ToolSliderField
            label={t("editor.brushHardness")}
            icon={<HardnessIcon />}
            min={0}
            max={100}
            value={Math.round(brushHardness * 100)}
            onValueChange={(val) => onBrushHardness(val / 100)}
            suffix="%"
            ariaLabel={t("editor.brushHardness")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {showStrength && onBrushStrength ? (
          <ToolSliderField
            label={t("editor.brushMode.strength")}
            icon={<StrengthIcon />}
            min={0}
            max={100}
            value={Math.round(brushStrength * 100)}
            onValueChange={(val) => onBrushStrength(val / 100)}
            suffix="%"
            ariaLabel={t("editor.brushMode.strength")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {showExposure && onBrushExposure ? (
          <ToolSliderField
            label={t("editor.brushMode.exposure")}
            icon={<ExposureIcon />}
            min={0}
            max={100}
            value={Math.round(brushExposure * 100)}
            onValueChange={(val) => onBrushExposure(val / 100)}
            suffix="%"
            ariaLabel={t("editor.brushMode.exposure")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {isSponge && onBrushFlow ? (
          <ToolSliderField
            label={t("editor.brushFlow")}
            icon={<FlowIcon />}
            min={0}
            max={100}
            value={Math.round(brushFlow * 100)}
            onValueChange={(val) => onBrushFlow(val / 100)}
            suffix="%"
            ariaLabel={t("editor.brushMode.sponge.flow")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {showOpacity && onBrushOpacity ? (
          <ToolSliderField
            label={t("editor.brushOpacity")}
            icon={<IconOpacity size={12} />}
            min={0}
            max={100}
            value={Math.round(brushOpacity * 100)}
            onValueChange={(val) => onBrushOpacity(val / 100)}
            suffix="%"
            ariaLabel={t("editor.brushOpacity")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {(isNormalBrush || isEraser) && onBrushFlow ? (
          <ToolSliderField
            label={t("editor.brushFlow")}
            icon={<FlowIcon />}
            min={0}
            max={100}
            value={Math.round(brushFlow * 100)}
            onValueChange={(val) => onBrushFlow(val / 100)}
            suffix="%"
            ariaLabel={t("editor.brushFlow")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {showSmoothing && onBrushSmoothing ? (
          <ToolSliderField
            label={t("editor.brushSmoothing")}
            icon={<SmoothingIcon />}
            min={0}
            max={100}
            value={Math.round(brushSmoothing * 100)}
            onValueChange={(val) => onBrushSmoothing(val / 100)}
            suffix="%"
            ariaLabel={t("editor.brushSmoothing")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {showSize ? (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <span className="mr-0.5 shrink-0 text-[9px] font-mono uppercase text-neutral-500">
              {t("editor.props.size")}
            </span>
            {QUICK_BRUSH_SIZES.map((size) => {
              const isActive = Math.round(brushWidth) === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onBrushWidth(size)}
                  className={`flex h-5 min-w-[24px] items-center justify-center rounded-md px-1.5 text-[10px] font-mono transition-all ${
                    isActive
                      ? "bg-[#a7ffd4] font-semibold text-black shadow-pop"
                      : "bg-white/[0.06] text-neutral-400 hover:bg-white/[0.12] hover:text-neutral-200"
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        ) : null}

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
          pressureSize={pressureSize}
          onPressureSize={onPressureSize}
          pressureOpacity={pressureOpacity}
          onPressureOpacity={onPressureOpacity}
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
