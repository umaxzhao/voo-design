/** Brush presets grid and Photoshop .ABR file importer. */

import PropTypes from "prop-types";
import { useState, useRef } from "react";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import { parseABR } from "../../editor/abr_parser.js";
import { DEFAULT_BRUSH_PRESETS } from "../../editor/brush_presets.js";

function BrushStrokePreview({ preset, active }) {
  const soft = preset.hardness === 0;
  const feather = preset.hardness < 0.8;
  const roundness = Math.max(0.15, preset.roundness ?? 1);
  const outerWidth = Math.max(1.5, Math.min(7, (preset.width / 5) * roundness));
  const innerWidth = Math.max(1, Math.min(3, (preset.width / 12) * roundness));
  return (
    <svg
      viewBox="0 0 120 26"
      aria-hidden="true"
      className={`h-6 w-[104px] shrink-0 ${active ? "text-[#a7ffd4]" : "text-neutral-200"}`}
      style={{ filter: soft ? "blur(1.4px)" : feather ? "blur(0.6px)" : undefined }}
    >
      <path
        d="M3 18C22 16 31 7 47 9C63 11 69 20 84 17C97 14 108 9 117 11"
        fill="none"
        stroke="currentColor"
        strokeWidth={outerWidth}
        strokeLinecap="round"
        opacity={Math.max(0.35, preset.opacity)}
      />
      <path
        d="M3 18C22 16 31 7 47 9C63 11 69 20 84 17C97 14 108 9 117 11"
        fill="none"
        stroke="currentColor"
        strokeWidth={innerWidth}
        strokeLinecap="round"
        opacity={Math.min(1, preset.opacity * 1.2)}
      />
    </svg>
  );
}

BrushStrokePreview.propTypes = {
  preset: PropTypes.object.isRequired,
  active: PropTypes.bool,
};

export default function BrushPresets({
  brushPreset = "medium_round",
  onBrushPreset,
  onBrushHardness,
  onBrushWidth,
  onBrushOpacity,
  onBrushRoundness,
  onBrushAngle,
  variant = "grid",
  onOpenDetails = null,
}) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [customBrushes, setCustomBrushes] = useState([]);
  const [activePresetId, setActivePresetId] = useState(brushPreset || "medium_round");
  const [importError, setImportError] = useState(null);

  const effectiveActive = brushPreset || activePresetId;

  const handleImportABR = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseABR(buffer);
      if (parsed && parsed.length > 0) {
        setCustomBrushes((prev) => [...prev, ...parsed]);
      } else {
        setImportError(t("editor.toolOptions.abrImportFailed"));
      }
    } catch (err) {
      console.error("Failed to parse ABR:", err);
      setImportError(t("editor.toolOptions.abrImportFailed"));
    }
    e.target.value = "";
  };

  return (
    <StaticSection
      title={t("editor.brushes")}
      extra={
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-6 items-center rounded-lg bg-[#222222] px-2 py-1 text-[10px] font-mono text-neutral-400 hover:bg-[#2a2a2a] hover:text-white transition-colors"
          title={t("editor.toolOptions.importABR")}
        >
          + .ABR
        </button>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".abr"
        className="hidden"
        onChange={handleImportABR}
      />

      {variant === "list" ? (
        <div className="flex flex-col gap-1.5">
          {DEFAULT_BRUSH_PRESETS.map((preset) => {
            const isActive = effectiveActive === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setActivePresetId(preset.id);
                  onBrushPreset?.(preset.id);
                  onBrushHardness?.(preset.hardness);
                  onBrushWidth?.(preset.width);
                  onBrushOpacity?.(preset.opacity);
                  onBrushRoundness?.(preset.roundness ?? 1);
                  onBrushAngle?.(preset.angle ?? 0);
                  onOpenDetails?.(preset.id);
                }}
                className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-white/[0.12] ring-1 ring-[#a7ffd4]/40"
                    : "bg-neutral-800 hover:bg-neutral-700"
                }`}
              >
                <BrushStrokePreview preset={preset} active={isActive} />
                <span className="min-w-0 flex-1 truncate text-[10px] font-mono text-neutral-200">
                  {preset.labelKey ? t(preset.labelKey) : preset.id}
                </span>
              </button>
            );
          })}
          {customBrushes.map((brush, idx) => (
            <button
              key={`custom_${idx}`}
              type="button"
              onClick={() => {
                setActivePresetId(`custom_${idx}`);
                if (brush.diameter) onBrushWidth?.(brush.diameter);
                onOpenDetails?.(`custom_${idx}`);
              }}
              className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left transition-colors ${
                effectiveActive === `custom_${idx}`
                  ? "bg-white/[0.12] ring-1 ring-[#a7ffd4]/40"
                  : "bg-neutral-800 hover:bg-neutral-700"
              }`}
            >
              {brush.dataUrl ? (
                <img src={brush.dataUrl} alt="" className="h-5 w-5 shrink-0 object-contain invert" />
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full bg-white" />
              )}
              <span className="min-w-0 flex-1 truncate text-[10px] font-mono text-neutral-200">
                {brush.name}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {DEFAULT_BRUSH_PRESETS.map((preset) => {
            const isActive = effectiveActive === preset.id;
            const displayName = (preset.labelKey ? t(preset.labelKey) : null);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setActivePresetId(preset.id);
                  onBrushPreset?.(preset.id);
                  onBrushHardness?.(preset.hardness);
                  onBrushWidth?.(preset.width);
                  onBrushOpacity?.(preset.opacity);
                  onBrushRoundness?.(preset.roundness ?? 1);
                  onBrushAngle?.(preset.angle ?? 0);
                }}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl p-1.5 transition-all ${
                  isActive
                    ? "bg-[#a7ffd4]/15 border border-[#a7ffd4]/50 text-white font-medium ring-1 ring-[#a7ffd4]/30"
                    : "bg-[#222222] border border-white/5 text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
                }`}
              >
                <div
                  className="rounded-full bg-white transition-transform"
                  style={{
                    width: Math.min(18, Math.max(6, preset.width / 2)),
                    height: Math.min(18, Math.max(6, preset.width / 2)),
                    opacity: preset.opacity,
                    filter:
                      preset.hardness === 0
                        ? "blur(2px)"
                        : preset.hardness < 0.8
                          ? "blur(1px)"
                          : "none",
                  }}
                />
                <span className="text-[9px] truncate w-full text-center">
                  {displayName}
                </span>
              </button>
            );
          })}
          {customBrushes.map((brush, idx) => (
            <button
              key={`custom_${idx}`}
              type="button"
              onClick={() => {
                setActivePresetId(`custom_${idx}`);
                if (brush.diameter) onBrushWidth?.(brush.diameter);
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl p-1.5 transition-all ${
                effectiveActive === `custom_${idx}`
                  ? "bg-[#333333] text-white ring-1 ring-white/20 font-medium"
                  : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
              }`}
            >
              {brush.dataUrl ? (
                <img src={brush.dataUrl} alt="" className="h-4.5 w-4.5 object-contain invert" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full bg-white" />
              )}
              <span className="text-[9px] truncate w-full text-center">
                {brush.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {importError && (
        <p className="mt-1.5 text-[10px] text-rose-400" role="alert">
          {importError}
        </p>
      )}
    </StaticSection>
  );
}

BrushPresets.propTypes = {
  brushPreset: PropTypes.string,
  onBrushPreset: PropTypes.func,
  onBrushHardness: PropTypes.func,
  onBrushWidth: PropTypes.func,
  onBrushOpacity: PropTypes.func,
  onBrushRoundness: PropTypes.func,
  onBrushAngle: PropTypes.func,
  variant: PropTypes.oneOf(["grid", "list"]),
  onOpenDetails: PropTypes.func,
};
