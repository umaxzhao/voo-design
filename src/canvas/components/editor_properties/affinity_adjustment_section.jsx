import PropTypes from "prop-types";
import { useMemo } from "react";
import AdjustmentControls from "./adjustment_controls.jsx";
import AdjustmentSlider from "./adjustment_slider.jsx";
import { createDefaultAdjustments } from "../../editor/scene_model.js";
import { adjustmentLabelKey } from "../../editor/adjustment_catalog.js";

const ADJUSTMENT_PRESETS = {
  contrast: [
    { labelKey: "editor.adjustmentPreset.contrast.0", patch: { contrast: { enabled: true, value: 0 }, brightness: { enabled: true, value: 0 } } },
    { labelKey: "editor.adjustmentPreset.contrast.1", patch: { contrast: { enabled: true, value: 15 } } },
    { labelKey: "editor.adjustmentPreset.contrast.2", patch: { contrast: { enabled: true, value: 30 } } },
    { labelKey: "editor.adjustmentPreset.contrast.3", patch: { contrast: { enabled: true, value: 50 } } },
    { labelKey: "editor.adjustmentPreset.contrast.4", patch: { contrast: { enabled: true, value: -20 } } },
  ],
  brightness: [
    { labelKey: "editor.adjustmentPreset.brightness.0", patch: { brightness: { enabled: true, value: 0 }, contrast: { enabled: true, value: 0 } } },
    { labelKey: "editor.adjustmentPreset.brightness.1", patch: { brightness: { enabled: true, value: 15 } } },
    { labelKey: "editor.adjustmentPreset.brightness.2", patch: { brightness: { enabled: true, value: 30 } } },
    { labelKey: "editor.adjustmentPreset.brightness.3", patch: { brightness: { enabled: true, value: -15 } } },
    { labelKey: "editor.adjustmentPreset.brightness.4", patch: { brightness: { enabled: true, value: -30 } } },
  ],
  exposure: [
    { labelKey: "editor.adjustmentPreset.exposure.0", patch: { exposure: { enabled: true, value: 0 } } },
    { labelKey: "editor.adjustmentPreset.exposure.1", patch: { exposure: { enabled: true, value: 0.5 } } },
    { labelKey: "editor.adjustmentPreset.exposure.2", patch: { exposure: { enabled: true, value: 1.0 } } },
    { labelKey: "editor.adjustmentPreset.exposure.3", patch: { exposure: { enabled: true, value: -0.5 } } },
    { labelKey: "editor.adjustmentPreset.exposure.4", patch: { exposure: { enabled: true, value: -1.0 } } },
  ],
  temperature: [
    { labelKey: "editor.adjustmentPreset.temperature.0", patch: { temperature: { enabled: true, value: 0 }, tint: { enabled: true, value: 0 } } },
    { labelKey: "editor.adjustmentPreset.temperature.1", patch: { temperature: { enabled: true, value: 15 } } },
    { labelKey: "editor.adjustmentPreset.temperature.2", patch: { temperature: { enabled: true, value: 35 } } },
    { labelKey: "editor.adjustmentPreset.temperature.3", patch: { temperature: { enabled: true, value: -15 } } },
    { labelKey: "editor.adjustmentPreset.temperature.4", patch: { temperature: { enabled: true, value: -35 } } },
  ],
  highlights: [
    { labelKey: "editor.adjustmentPreset.highlights.0", patch: { highlights: { enabled: true, value: 0 }, shadows: { enabled: true, value: 0 } } },
    { labelKey: "editor.adjustmentPreset.highlights.1", patch: { highlights: { enabled: true, value: -30 } } },
    { labelKey: "editor.adjustmentPreset.highlights.2", patch: { highlights: { enabled: true, value: 30 } } },
  ],
  vibrance: [
    { labelKey: "editor.adjustmentPreset.vibrance.0", patch: { vibrance: { enabled: true, value: 0 }, saturation: { enabled: true, value: 0 } } },
    { labelKey: "editor.adjustmentPreset.vibrance.1", patch: { vibrance: { enabled: true, value: 20 } } },
    { labelKey: "editor.adjustmentPreset.vibrance.2", patch: { vibrance: { enabled: true, value: 40 } } },
    { labelKey: "editor.adjustmentPreset.vibrance.3", patch: { vibrance: { enabled: true, value: -20 } } },
    { labelKey: "editor.adjustmentPreset.vibrance.4", patch: { saturation: { enabled: true, value: -100 } } },
  ],
  threshold: [
    { labelKey: "editor.adjustmentPreset.threshold.0", patch: { threshold: { enabled: true, value: 128 } } },
    { labelKey: "editor.adjustmentPreset.threshold.1", patch: { threshold: { enabled: true, value: 64 } } },
    { labelKey: "editor.adjustmentPreset.threshold.2", patch: { threshold: { enabled: true, value: 192 } } },
  ],
};

export default function AffinityAdjustmentSection({
  object,
  adjustments,
  edit,
  editAndCommit,
  commitNow = null,
  bitmap = null,
  t,
}) {
  const kind = object.adjustmentKind || "contrast";

  const Slider = useMemo(
    () =>
      function CommitSlider(props) {
        return <AdjustmentSlider {...props} onCommit={commitNow ?? undefined} />;
      },
    [commitNow]
  );

  const updateCategory = (category, patch) => {
    edit({
      adjustments: {
        ...adjustments,
        [category]: { ...(adjustments[category] ?? {}), ...patch },
      },
    });
  };

  const resetCategory = (category) => {
    const defaults = createDefaultAdjustments();
    editAndCommit({
      adjustments: { ...adjustments, [category]: defaults[category] },
    });
  };

  const resetAll = () => {
    const defaults = createDefaultAdjustments();
    if (kind === "contrast" || kind === "brightness") {
      editAndCommit({
        adjustments: {
          ...adjustments,
          contrast: defaults.contrast,
          brightness: defaults.brightness,
        },
      });
    } else if (kind === "temperature" || kind === "tint") {
      editAndCommit({
        adjustments: {
          ...adjustments,
          temperature: defaults.temperature,
          tint: defaults.tint,
        },
      });
    } else if (kind === "highlights" || kind === "shadows") {
      editAndCommit({
        adjustments: {
          ...adjustments,
          highlights: defaults.highlights,
          shadows: defaults.shadows,
        },
      });
    } else if (kind === "vibrance" || kind === "saturation") {
      editAndCommit({
        adjustments: {
          ...adjustments,
          vibrance: defaults.vibrance,
          saturation: defaults.saturation,
        },
      });
    } else {
      resetCategory(kind);
    }
  };

  const applyPreset = (presetPatch) => {
    editAndCommit({
      adjustments: {
        ...adjustments,
        ...Object.fromEntries(
          Object.entries(presetPatch).map(([cat, val]) => [
            cat,
            { ...(adjustments[cat] ?? {}), ...val },
          ])
        ),
      },
    });
  };

  // Determine if active category is enabled
  const isEnabled = adjustments[kind]?.enabled !== false;
  const toggleEnabled = (checked) => {
    updateCategory(kind, { enabled: checked });
    // Also toggle paired parameter if applicable
    if (kind === "contrast" && adjustments.brightness) {
      updateCategory("brightness", { enabled: checked });
    } else if (kind === "brightness" && adjustments.contrast) {
      updateCategory("contrast", { enabled: checked });
    }
  };

  const titleKey = adjustmentLabelKey(kind);
  const localizedTitle = t(titleKey) || kind;
  const presets = ADJUSTMENT_PRESETS[kind] || null;

  // Check if paired controls should be shown (Affinity style)
  const isContrastOrBrightness = kind === "contrast" || kind === "brightness";
  const isTemperatureOrTint = kind === "temperature" || kind === "tint";
  const isHighlightsOrShadows = kind === "highlights" || kind === "shadows";
  const isVibranceOrSaturation = kind === "vibrance";

  return (
    <div
      data-testid="affinity-adjustment-section"
      className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-3"
    >
      {/* 1. Affinity-Style Header Card */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-neutral-100 tracking-tight truncate">
              {localizedTitle}
            </span>
            <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
              {t("editor.adjustment.layer")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-mono text-neutral-300">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
              className="flat-check"
            />
            <span>{isEnabled ? t("editor.adjustment.active") : t("editor.adjustment.bypass")}</span>
          </label>
          <button
            type="button"
            onClick={resetAll}
            className="text-[10px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-white/10"
            title={t("editor.adjustment.reset")}
          >
            {t("editor.props.reset")}
          </button>
        </div>
      </div>

      {/* 2. Quick Presets Bar (Affinity-Grade) */}
      {presets && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
            {t("editor.adjustment.quickPresets")}
          </span>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(preset.patch)}
                className="rounded-lg bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-neutral-300 hover:bg-white/[0.12] hover:text-white transition-colors border border-white/[0.06] cursor-pointer"
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Parameter Controls */}
      <div className="flex flex-col gap-3 pt-1">
        {isContrastOrBrightness ? (
          <>
            {/* Contrast Slider */}
            <Slider
              label={t("editor.props.contrast")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.contrast?.value ?? 0}
              enabled={adjustments.contrast?.enabled !== false}
              onToggle={(next) => updateCategory("contrast", { enabled: next })}
              onChange={(next) => updateCategory("contrast", { value: next })}
              onReset={() => resetCategory("contrast")}
            />
            {/* Brightness Slider (Paired like in Affinity Photo) */}
            <Slider
              label={t("editor.props.brightness")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.brightness?.value ?? 0}
              enabled={adjustments.brightness?.enabled !== false}
              onToggle={(next) => updateCategory("brightness", { enabled: next })}
              onChange={(next) => updateCategory("brightness", { value: next })}
              onReset={() => resetCategory("brightness")}
            />
          </>
        ) : isTemperatureOrTint ? (
          <>
            <Slider
              label={t("editor.props.temperature")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.temperature?.value ?? 0}
              enabled={adjustments.temperature?.enabled !== false}
              onToggle={(next) => updateCategory("temperature", { enabled: next })}
              onChange={(next) => updateCategory("temperature", { value: next })}
              onReset={() => resetCategory("temperature")}
            />
            <Slider
              label={t("editor.props.tint")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.tint?.value ?? 0}
              enabled={adjustments.tint?.enabled !== false}
              onToggle={(next) => updateCategory("tint", { enabled: next })}
              onChange={(next) => updateCategory("tint", { value: next })}
              onReset={() => resetCategory("tint")}
            />
          </>
        ) : isHighlightsOrShadows ? (
          <>
            <Slider
              label={t("editor.props.highlights")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.highlights?.value ?? 0}
              enabled={adjustments.highlights?.enabled !== false}
              onToggle={(next) => updateCategory("highlights", { enabled: next })}
              onChange={(next) => updateCategory("highlights", { value: next })}
              onReset={() => resetCategory("highlights")}
            />
            <Slider
              label={t("editor.props.shadows")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.shadows?.value ?? 0}
              enabled={adjustments.shadows?.enabled !== false}
              onToggle={(next) => updateCategory("shadows", { enabled: next })}
              onChange={(next) => updateCategory("shadows", { value: next })}
              onReset={() => resetCategory("shadows")}
            />
          </>
        ) : isVibranceOrSaturation ? (
          <>
            <Slider
              label={t("editor.props.vibrance")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.vibrance?.value ?? 0}
              enabled={adjustments.vibrance?.enabled !== false}
              onToggle={(next) => updateCategory("vibrance", { enabled: next })}
              onChange={(next) => updateCategory("vibrance", { value: next })}
              onReset={() => resetCategory("vibrance")}
            />
            <Slider
              label={t("editor.props.saturation")}
              unit="%"
              min={-100}
              max={100}
              step={1}
              value={adjustments.saturation?.value ?? 0}
              enabled={adjustments.saturation?.enabled !== false}
              onToggle={(next) => updateCategory("saturation", { enabled: next })}
              onChange={(next) => updateCategory("saturation", { value: next })}
              onReset={() => resetCategory("saturation")}
            />
          </>
        ) : (
          <AdjustmentControls
            kind={kind}
            adjustments={adjustments}
            edit={edit}
            editAndCommit={editAndCommit}
            commitNow={commitNow}
            bitmap={bitmap}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

AffinityAdjustmentSection.propTypes = {
  object: PropTypes.shape({
    adjustmentKind: PropTypes.string,
    adjustments: PropTypes.object,
  }).isRequired,
  adjustments: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  bitmap: PropTypes.object,
  t: PropTypes.func.isRequired,
};
