import PropTypes from "prop-types";
import { useMemo } from "react";
import KindIcon from "./kind_icons.jsx";
import AdjustmentControls from "./adjustment_controls.jsx";
import AdjustmentSlider from "./adjustment_slider.jsx";
import { createDefaultAdjustments } from "../../editor/scene_model.js";
import { adjustmentLabelKey } from "../../editor/adjustment_catalog.js";
import { useI18n } from "../../use_i18n.js";

const ADJUSTMENT_PRESETS = {
  contrast: [
    { labelZh: "默认", labelEn: "Default", patch: { contrast: { enabled: true, value: 0 }, brightness: { enabled: true, value: 0 } } },
    { labelZh: "轻微 +15%", labelEn: "Light +15%", patch: { contrast: { enabled: true, value: 15 } } },
    { labelZh: "适度 +30%", labelEn: "Medium +30%", patch: { contrast: { enabled: true, value: 30 } } },
    { labelZh: "高反差 +50%", labelEn: "High +50%", patch: { contrast: { enabled: true, value: 50 } } },
    { labelZh: "柔和 -20%", labelEn: "Muted -20%", patch: { contrast: { enabled: true, value: -20 } } },
  ],
  brightness: [
    { labelZh: "默认", labelEn: "Default", patch: { brightness: { enabled: true, value: 0 }, contrast: { enabled: true, value: 0 } } },
    { labelZh: "提亮 +15%", labelEn: "Bright +15%", patch: { brightness: { enabled: true, value: 15 } } },
    { labelZh: "高调 +30%", labelEn: "High +30%", patch: { brightness: { enabled: true, value: 30 } } },
    { labelZh: "微暗 -15%", labelEn: "Darken -15%", patch: { brightness: { enabled: true, value: -15 } } },
    { labelZh: "低调 -30%", labelEn: "Muted -30%", patch: { brightness: { enabled: true, value: -30 } } },
  ],
  exposure: [
    { labelZh: "默认 0", labelEn: "Default 0", patch: { exposure: { enabled: true, value: 0 } } },
    { labelZh: "+0.5 EV", labelEn: "+0.5 EV", patch: { exposure: { enabled: true, value: 0.5 } } },
    { labelZh: "+1.0 EV", labelEn: "+1.0 EV", patch: { exposure: { enabled: true, value: 1.0 } } },
    { labelZh: "-0.5 EV", labelEn: "-0.5 EV", patch: { exposure: { enabled: true, value: -0.5 } } },
    { labelZh: "-1.0 EV", labelEn: "-1.0 EV", patch: { exposure: { enabled: true, value: -1.0 } } },
  ],
  temperature: [
    { labelZh: "中性 0%", labelEn: "Neutral 0%", patch: { temperature: { enabled: true, value: 0 }, tint: { enabled: true, value: 0 } } },
    { labelZh: "微暖 +15%", labelEn: "Warm +15%", patch: { temperature: { enabled: true, value: 15 } } },
    { labelZh: "金秋 +35%", labelEn: "Golden +35%", patch: { temperature: { enabled: true, value: 35 } } },
    { labelZh: "微冷 -15%", labelEn: "Cool -15%", patch: { temperature: { enabled: true, value: -15 } } },
    { labelZh: "冰蓝 -35%", labelEn: "Ice -35%", patch: { temperature: { enabled: true, value: -35 } } },
  ],
  highlights: [
    { labelZh: "默认 0%", labelEn: "Default 0%", patch: { highlights: { enabled: true, value: 0 }, shadows: { enabled: true, value: 0 } } },
    { labelZh: "压制 -30%", labelEn: "Compress -30%", patch: { highlights: { enabled: true, value: -30 } } },
    { labelZh: "提亮 +30%", labelEn: "Boost +30%", patch: { highlights: { enabled: true, value: 30 } } },
  ],
  vibrance: [
    { labelZh: "默认", labelEn: "Default", patch: { vibrance: { enabled: true, value: 0 }, saturation: { enabled: true, value: 0 } } },
    { labelZh: "生动 +20%", labelEn: "Vivid +20%", patch: { vibrance: { enabled: true, value: 20 } } },
    { labelZh: "浓郁 +40%", labelEn: "Rich +40%", patch: { vibrance: { enabled: true, value: 40 } } },
    { labelZh: "淡雅 -20%", labelEn: "Muted -20%", patch: { vibrance: { enabled: true, value: -20 } } },
    { labelZh: "黑白 -100%", labelEn: "B&W -100%", patch: { saturation: { enabled: true, value: -100 } } },
  ],
  threshold: [
    { labelZh: "标准 128", labelEn: "Mid 128", patch: { threshold: { enabled: true, value: 128 } } },
    { labelZh: "暗部 64", labelEn: "Dark 64", patch: { threshold: { enabled: true, value: 64 } } },
    { labelZh: "亮部 192", labelEn: "Bright 192", patch: { threshold: { enabled: true, value: 192 } } },
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
  const { locale } = useI18n();
  const isZh = locale === "zh";
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
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#a7ffd4]/10 text-[#a7ffd4] border border-[#a7ffd4]/20">
            <KindIcon kind={kind} size={15} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-neutral-100 tracking-tight truncate">
              {localizedTitle}
            </span>
            <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
              {isZh ? "调整图层 · 滤镜" : "Adjustment Layer"}
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
            <span>{isEnabled ? (isZh ? "启用" : "Active") : (isZh ? "旁路" : "Bypass")}</span>
          </label>
          <button
            type="button"
            onClick={resetAll}
            className="text-[10px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-white/10"
            title={isZh ? "重置该调整项为默认值" : "Reset adjustment to default"}
          >
            {t("editor.props.reset") || (isZh ? "重置" : "Reset")}
          </button>
        </div>
      </div>

      {/* 2. Quick Presets Bar (Affinity-Grade) */}
      {presets && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
            {isZh ? "快捷预设档位" : "Quick Presets"}
          </span>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(preset.patch)}
                className="rounded-lg bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-neutral-300 hover:bg-white/[0.12] hover:text-white transition-colors border border-white/[0.06] cursor-pointer"
              >
                {isZh ? preset.labelZh : preset.labelEn}
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
              label={t("editor.props.contrast") || (isZh ? "对比度" : "Contrast")}
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
              label={t("editor.props.brightness") || (isZh ? "亮度" : "Brightness")}
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
              label={t("editor.props.temperature") || (isZh ? "色温 (暖/冷)" : "Temperature")}
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
              label={t("editor.props.tint") || (isZh ? "色调 (品红/绿)" : "Tint")}
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
              label={t("editor.props.highlights") || (isZh ? "高光" : "Highlights")}
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
              label={t("editor.props.shadows") || (isZh ? "阴影" : "Shadows")}
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
              label={t("editor.props.vibrance") || (isZh ? "自然饱和度" : "Vibrance")}
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
              label={t("editor.props.saturation") || (isZh ? "饱和度" : "Saturation")}
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
