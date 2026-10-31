import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";

const DEFAULT_SWATCHES = [
  "#000000",
  "#FFFFFF",
  "#F3F4F6",
  "#9CA3AF",
  "#4B5563",
  "#1F2937",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#F43F5E",
  "#84CC16",
  "#14B8A6",
];

export function SwatchGrid({ onSelectColor, swatches = DEFAULT_SWATCHES }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="text-[10px] font-mono text-neutral-500">{t("editor.colorPicker.presets")}</span>
      <div className="grid grid-cols-9 gap-1.5">
        {swatches.map((color, index) => (
          <button
            key={`${color}-${index}`}
            type="button"
            onClick={() => onSelectColor(color)}
            aria-label={t("editor.colorPicker.colorSwatch", { color })}
            style={{ backgroundColor: color }}
            className="h-5 w-5 rounded-full border border-white/10 transition-transform hover:scale-110 active:scale-95"
          />
        ))}
      </div>
    </div>
  );
}

SwatchGrid.propTypes = {
  onSelectColor: PropTypes.func.isRequired,
  swatches: PropTypes.arrayOf(PropTypes.string),
};
