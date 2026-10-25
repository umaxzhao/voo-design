import PropTypes from "prop-types";
import { BLEND_MODES } from "../editor/scene_model.js";
import { useI18n } from "../use_i18n.js";

/**
 * Blend mode dropdown of the fill colour picker. Normal is stored as
 * "source-over"; the other options are the CSS/PSD mode identifiers.
 */
export function BlendModeSelect({ value, onChange }) {
  const { t } = useI18n();
  return (
    <label className="flex items-center gap-2 font-mono text-[11px] text-neutral-400">
      <span className="shrink-0">{t("editor.colorPicker.blendMode")}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t("editor.colorPicker.blendMode")}
        data-testid="picker-blend-mode"
        className="h-6 min-w-0 flex-1 cursor-pointer rounded-lg bg-white/5 px-1.5 text-neutral-200 outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        {BLEND_MODES.map((mode) => (
          <option key={mode} value={mode} className="bg-neutral-900">
            {mode === "source-over" ? t("editor.colorPicker.blendNormal") : mode}
          </option>
        ))}
      </select>
    </label>
  );
}

BlendModeSelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
