import PropTypes from "prop-types";
import { useState } from "react";
import { parseOpacityInput } from "./opacity_patch.js";
import { useI18n } from "../use_i18n.js";

/** Numeric 0-100 % opacity field beside the colour model inputs. */
export function PickerOpacityField({ value, onChange, onCommit = undefined }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(null);
  return (
    <div className="flex w-14 shrink-0 items-center rounded-lg border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] focus-within:border-[#a7ffd4]/40">
      <input
        type="number"
        min={0}
        max={100}
        aria-label={t("editor.colorPicker.opacity")}
        data-testid="picker-opacity-input"
        value={draft ?? Math.round(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = parseOpacityInput(event.target.value);
          if (next !== null) onChange(next);
        }}
        onBlur={() => {
          setDraft(null);
          onCommit?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-full min-w-0 bg-transparent text-right text-white outline-none"
      />
      <span className="text-neutral-500">%</span>
    </div>
  );
}

PickerOpacityField.propTypes = {
  /** 0-100. */
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  /** Interaction-end commit (blur / Enter), same as the row field's. */
  onCommit: PropTypes.func,
};
