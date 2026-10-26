/** Brush presets grid and Photoshop .ABR file importer. */

import PropTypes from "prop-types";
import { useState, useRef } from "react";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import { parseABR } from "../../editor/abr_parser.js";
import { DEFAULT_BRUSH_PRESETS } from "../../editor/brush_presets.js";

export default function BrushPresets({
  brushPreset = "medium_round",
  onBrushPreset,
  onBrushHardness,
  onBrushWidth,
  onBrushOpacity,
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
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl p-1.5 transition-all ${
                isActive
                  ? "bg-[#a7ffd4]/15 border border-[#a7ffd4]/50 text-white font-medium ring-1 ring-[#a7ffd4]/30"
                  : "bg-[#222222] border border-white/5 text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
              }`}
            >
              {/* Stylized Brush Tip Preview */}
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

        {/* Render Custom Imported .ABR Brushes */}
        {customBrushes.map((brush, idx) => (
          <button
            key={`custom_${idx}`}
            type="button"
            onClick={() => {
              setActivePresetId(`custom_${idx}`);
              if (brush.diameter) onBrushWidth?.(brush.diameter);
            }}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl p-1.5 transition-all ${
              activePresetId === `custom_${idx}`
                ? "bg-[#333333] text-white ring-1 ring-white/20 font-medium"
                : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
            }`}
          >
            {brush.dataUrl ? (
              <img
                src={brush.dataUrl}
                alt=""
                className="h-4.5 w-4.5 object-contain invert"
              />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full bg-white" />
            )}
            <span className="text-[9px] truncate w-full text-center">
              {brush.name}
            </span>
          </button>
        ))}
      </div>
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
};
