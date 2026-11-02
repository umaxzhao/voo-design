import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import ToolSliderField from "./tool_slider_field.jsx";

export default function HealingModeControls({ healingMode, cloneSource }) {
  const { t } = useI18n();
  const [patchDirection, setPatchDirection] = useState("source");
  const [diffusion, setDiffusion] = useState(50);

  if (healingMode === "patch") {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1 rounded-xl bg-neutral-800 p-1">
          {["source", "destination"].map((direction) => (
            <button
              key={direction}
              type="button"
              aria-pressed={patchDirection === direction}
              onClick={() => setPatchDirection(direction)}
              className={`h-6 flex-1 rounded-lg px-2 text-[10px] font-mono transition-colors ${
                patchDirection === direction
                  ? "bg-neutral-600 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {t(`editor.patch.${direction}`)}
            </button>
          ))}
        </div>
        <ToolSliderField
          label={t("editor.patch.diffusion")}
          min={0}
          max={100}
          value={diffusion}
          onValueChange={setDiffusion}
          suffix="%"
          ariaLabel={t("editor.patch.diffusion")}
        />
      </div>
    );
  }

  if (healingMode === "clone") {
    return (
      <div
        className="rounded-xl bg-neutral-800 px-2.5 py-2 text-[10px] font-mono text-neutral-300"
        role="status"
        aria-live="polite"
      >
        {t(cloneSource ? "editor.clone.sourceSet" : "editor.clone.sourceUnset")}
      </div>
    );
  }

  return null;
}

HealingModeControls.propTypes = {
  healingMode: PropTypes.oneOf(["spot", "aiRepair", "patch", "clone"]),
  cloneSource: PropTypes.object,
};
