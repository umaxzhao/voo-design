/** Frequency separation: radius field and apply action for an image layer. */

import PropTypes from "prop-types";
import { useRef } from "react";
import { useI18n } from "../../use_i18n.js";
import { fieldClass } from "./property_section.jsx";

const ERROR_PREFIX = "editor.frequencySeparation.error.";
const GENERIC_ERROR = `${ERROR_PREFIX}generic`;

export default function FrequencySeparationRow({ object, engine = null }) {
  const { t } = useI18n();
  const radius = useRef(null);
  const status = useRef(null);

  const apply = async () => {
    try {
      await engine?.frequencySeparateSelected?.(object.id, Number(radius.current?.value));
      if (status.current) status.current.textContent = "";
    } catch (error) {
      // Engine errors are i18n keys; anything else falls back to the generic message.
      const key = typeof error?.message === "string" && error.message.startsWith(ERROR_PREFIX) ? error.message : GENERIC_ERROR;
      if (status.current) status.current.textContent = t(key);
    }
  };

  return (
    <div data-testid="editor-frequency-separation" className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2">
      <span className="truncate text-[10px] font-mono uppercase tracking-wide text-neutral-200">
        {t("editor.frequencySeparation.action")}
      </span>
      <label className="flex items-center gap-2 text-[10px] text-neutral-400" htmlFor="frequency-separation-radius">
        <span className="min-w-0 flex-1 truncate">{t("editor.frequencySeparation.radius")}</span>
        <input ref={radius} id="frequency-separation-radius" type="number" min="1" max="100" defaultValue="10" className={`${fieldClass} !w-16`} />
      </label>
      <button type="button" className={`${fieldClass} cursor-pointer text-center`} onClick={apply}>
        {t("editor.frequencySeparation.action")}
      </button>
      <span ref={status} role="status" aria-live="polite" className="text-[9px] text-neutral-500" />
    </div>
  );
}

FrequencySeparationRow.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
};
