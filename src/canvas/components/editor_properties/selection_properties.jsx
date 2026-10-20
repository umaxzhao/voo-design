/** Selection tool properties: mode, feather, marquee aspect ratio, magic wand, and lasso controls. */

import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import {
  TOOL,
  REMOVE_BRUSH_MIN,
  REMOVE_BRUSH_MAX,
} from "../../editor/editor_constants.js";
import { MARQUEE_MODE_IDS } from "../../editor/tool_families.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";
import MagneticLassoFields from "./magnetic_lasso_fields.jsx";
import SelectionModeButtons from "./selection_mode_buttons.jsx";
import SelectionWandControls from "./selection_wand_controls.jsx";
import SelectionLassoWorkflow from "./selection_lasso_workflow.jsx";

export default function SelectionProperties({
  tool,
  selectionMode = "replace",
  onSelectionMode,
  selectionFeather: propSelectionFeather = 0,
  onFeatherSelection,
  marqueeMode = "rect",
  marqueeRatio = null,
  onMarqueeRatio,
  magneticLassoSettings = { width: 64, contrast: 50, frequency: 57 },
  onMagneticLassoSetting,
  isWand = false,
  wandTolerance = 32,
  onWandTolerance,
  wandSampleSize = 0,
  onWandSampleSize,
  wandContiguous = true,
  onWandContiguous,
  wandAntiAlias = true,
  onWandAntiAlias,
  wandSampleAll = false,
  onWandSampleAll,
  regionTarget = "all",
  onRegionTarget,
  regionMode = "object",
  brushWidth = 24,
  onBrushWidth,
  lassoSaved = false,
  lassoBusy = false,
  localMattingSupported = true,
  onLassoCutout,
  onLassoEraseInside,
  onLassoKeepInside,
  onLassoCancel,
  onSelectSubject,
}) {
  const { t } = useI18n();
  const [selectionFeather, setSelectionFeather] = useState(
    propSelectionFeather ?? 0,
  );

  useEffect(() => {
    if (propSelectionFeather !== undefined) {
      setSelectionFeather(propSelectionFeather);
    }
  }, [propSelectionFeather]);

  return (
    <StaticSection title={t("editor.toolOptions")}>
      <div className="space-y-2">
        <SelectionModeButtons
          selectionMode={selectionMode}
          onSelectionMode={onSelectionMode}
        />

        {/* Feathering */}
        {onFeatherSelection ? (
          <div className="pt-0.5">
            <ScrubField
              prefix={
                <span className="text-[10px] font-mono text-neutral-400">
                  {t("editor.selection.feather")}
                </span>
              }
              suffix="px"
              min={0}
              max={250}
              value={selectionFeather}
              onValueChange={(val) => {
                setSelectionFeather(val);
                onFeatherSelection(val);
              }}
              ariaLabel={t("editor.selection.feather")}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          </div>
        ) : null}

        {/* Marquee aspect ratio presets */}
        {tool === TOOL.MARQUEE && onMarqueeRatio && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              {t("editor.selection.ratio")}
            </span>
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: t("editor.selection.ratioFree"), value: null },
                { label: "1:1", value: 1 },
                { label: "4:3", value: 4 / 3 },
                { label: "16:9", value: 16 / 9 },
                { label: "9:16", value: 9 / 16 },
              ].map(({ label, value }) => {
                const active =
                  value === null
                    ? marqueeRatio === null
                    : marqueeRatio !== null &&
                      Math.abs(marqueeRatio - value) < 0.01;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onMarqueeRatio(value)}
                    aria-pressed={active}
                    className={`rounded-xl py-1.5 text-[10px] font-mono transition-all ${
                      active
                        ? "bg-white text-black font-semibold"
                        : "bg-[#222222] text-neutral-400 hover:bg-[#282828] hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tool === TOOL.MARQUEE && marqueeMode === "magnetic" ? (
          <MagneticLassoFields
            t={t}
            values={magneticLassoSettings}
            onChange={(name, value) =>
              onMagneticLassoSetting?.(name, value)
            }
          />
        ) : null}

        {/* Magic Wand specific options */}
        <SelectionWandControls
          isWand={isWand}
          wandTolerance={wandTolerance}
          onWandTolerance={onWandTolerance}
          wandSampleSize={wandSampleSize}
          onWandSampleSize={onWandSampleSize}
          wandContiguous={wandContiguous}
          onWandContiguous={onWandContiguous}
          wandAntiAlias={wandAntiAlias}
          onWandAntiAlias={onWandAntiAlias}
          wandSampleAll={wandSampleAll}
          onWandSampleAll={onWandSampleAll}
        />

        {/* Region target options */}
        {tool === TOOL.REGION && onRegionTarget ? (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              {t("editor.region.target")}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: "all", labelKey: "editor.region.targetAll" },
                { value: "layer", labelKey: "editor.region.targetLayer" },
              ].map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onRegionTarget(value)}
                  aria-pressed={regionTarget === value}
                  className={`rounded-xl py-1.5 text-[10px] font-mono transition-all ${
                    regionTarget === value
                      ? "bg-white text-black font-semibold"
                      : "bg-[#222222] text-neutral-400 hover:bg-[#282828] hover:text-white"
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Region Remove paints its band with a dedicated brush — size it here. */}
        {tool === TOOL.REGION &&
        regionMode === "remove" &&
        onBrushWidth ? (
          <div className="space-y-1.5 pt-1">
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
              min={REMOVE_BRUSH_MIN}
              max={REMOVE_BRUSH_MAX}
              value={brushWidth}
              onValueChange={(val) => onBrushWidth(val)}
              ariaLabel={t("editor.brushWidth")}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          </div>
        ) : null}

        {/* Lasso cutout / keep / erase workflow & Select Subject */}
        <SelectionLassoWorkflow
          tool={tool}
          lassoSaved={lassoSaved}
          lassoBusy={lassoBusy}
          localMattingSupported={localMattingSupported}
          onLassoCutout={onLassoCutout}
          onLassoEraseInside={onLassoEraseInside}
          onLassoKeepInside={onLassoKeepInside}
          onLassoCancel={onLassoCancel}
          onSelectSubject={onSelectSubject}
        />
      </div>
    </StaticSection>
  );
}

SelectionProperties.propTypes = {
  tool: PropTypes.string,
  selectionMode: PropTypes.string,
  onSelectionMode: PropTypes.func,
  selectionFeather: PropTypes.number,
  onFeatherSelection: PropTypes.func,
  marqueeMode: PropTypes.oneOf(MARQUEE_MODE_IDS),
  marqueeRatio: PropTypes.number,
  onMarqueeRatio: PropTypes.func,
  magneticLassoSettings: PropTypes.shape({
    width: PropTypes.number.isRequired,
    contrast: PropTypes.number.isRequired,
    frequency: PropTypes.number.isRequired,
  }),
  onMagneticLassoSetting: PropTypes.func,
  isWand: PropTypes.bool,
  wandTolerance: PropTypes.number,
  onWandTolerance: PropTypes.func,
  wandSampleSize: PropTypes.number,
  onWandSampleSize: PropTypes.func,
  wandContiguous: PropTypes.bool,
  onWandContiguous: PropTypes.func,
  wandAntiAlias: PropTypes.bool,
  onWandAntiAlias: PropTypes.func,
  wandSampleAll: PropTypes.bool,
  onWandSampleAll: PropTypes.func,
  regionTarget: PropTypes.string,
  onRegionTarget: PropTypes.func,
  regionMode: PropTypes.string,
  brushWidth: PropTypes.number,
  onBrushWidth: PropTypes.func,
  lassoSaved: PropTypes.bool,
  lassoBusy: PropTypes.bool,
  localMattingSupported: PropTypes.bool,
  onLassoCutout: PropTypes.func,
  onLassoEraseInside: PropTypes.func,
  onLassoKeepInside: PropTypes.func,
  onLassoCancel: PropTypes.func,
  onSelectSubject: PropTypes.func,
};
