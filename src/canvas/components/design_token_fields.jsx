import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import { colorPickerValue, numberDraft } from "./design_token_controls.js";
import { SETTINGS_INPUT_CLASS } from "./settings_section.jsx";

const GROUPS = ["colors", "typeScale", "spacing", "radius", "components"];
const NUMERIC_GROUPS = ["typeScale", "spacing", "radius"];
const LABEL_CLASS = "flex min-w-0 flex-col gap-2 text-xs text-neutral-300";

/** One recursive token control: colour, number, text or a nested group. */
function TokenControl({ value, path, label, kind, onChange }) {
  const { t } = useI18n();
  const name = path.join(" ");
  if (kind === "color") {
    return (
      <label className={LABEL_CLASS}>
        {label}
        <span className="flex items-center gap-2">
          <input type="color" aria-label={`${name} ${t("designSystems.pickerSuffix")}`} value={colorPickerValue(value)} onChange={(e) => onChange(path, e.target.value)} className="h-12 w-12 shrink-0 cursor-pointer rounded-lg bg-transparent" />
          <input aria-label={name} className={SETTINGS_INPUT_CLASS} value={value} onChange={(e) => onChange(path, e.target.value)} />
        </span>
      </label>
    );
  }
  if (value && typeof value === "object") {
    return (
      <fieldset className="col-span-full grid min-w-0 grid-cols-2 gap-3">
        <legend className="mb-3 text-xs text-neutral-400">{label}</legend>
        {Object.entries(value).map(([key, entry]) => (
          <TokenControl key={key} value={entry} path={[...path, key]} label={key} onChange={onChange} />
        ))}
      </fieldset>
    );
  }
  const numeric = kind === "number" || typeof value === "number";
  const scaleStep = path[0] === "typeScale" ? 0.1 : 1;
  return (
    <label className={LABEL_CLASS}>
      {label}
      <input aria-label={name} type={numeric ? "number" : "text"} min={numeric ? (path[0] === "typeScale" ? 0.1 : 0) : undefined} step={numeric ? scaleStep : undefined} className={SETTINGS_INPUT_CLASS} value={value ?? ""} onChange={(e) => onChange(path, numeric ? numberDraft(e.target.value) : e.target.value)} />
    </label>
  );
}

TokenControl.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.object]),
  path: PropTypes.arrayOf(PropTypes.string).isRequired,
  label: PropTypes.string.isRequired,
  kind: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

/** Token groups plus the markdown spec for one design system draft. */
export default function DesignTokenFields({ tokens, designMd, onTokenChange, onMarkdownChange }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6" data-testid="design-token-panel">
      {GROUPS.map((group) => (
        <fieldset key={group} className="grid min-w-0 grid-cols-2 gap-3">
          <legend className="mb-3 text-xs font-medium text-neutral-200">{t(`designSystems.group.${group}`)}</legend>
          {Object.entries(tokens[group] || {}).map(([key, value]) => {
            const index = Number(key) + 1;
            const label = Array.isArray(tokens[group])
              ? t(group === "typeScale" ? "designSystems.sizeStep" : "designSystems.step", { index })
              : key;
            const kind = group === "colors" ? "color" : NUMERIC_GROUPS.includes(group) ? "number" : undefined;
            return <TokenControl key={key} value={value} path={[group, key]} label={label} kind={kind} onChange={onTokenChange} />;
          })}
        </fieldset>
      ))}
      <label className={LABEL_CLASS}>
        {t("designSystems.markdownLabel")}
        <textarea aria-label="designMd" spellCheck={false} rows={9} placeholder={t("designSystems.markdownPlaceholder")} className={`${SETTINGS_INPUT_CLASS} w-full resize-y font-mono`} value={designMd} onChange={(e) => onMarkdownChange(e.target.value)} />
      </label>
      <p className="text-xs text-neutral-500">{t("designSystems.unitsHint")}</p>
    </div>
  );
}

DesignTokenFields.propTypes = {
  tokens: PropTypes.object.isRequired,
  designMd: PropTypes.string.isRequired,
  onTokenChange: PropTypes.func.isRequired,
  onMarkdownChange: PropTypes.func.isRequired,
};
