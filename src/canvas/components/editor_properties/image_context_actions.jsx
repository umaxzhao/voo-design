import PropTypes from "prop-types";
import { useRef, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import HistogramStrip from "./histogram_strip.jsx";
import CustomSelect from "../custom_select.jsx";

const ACTION_BUTTON_CLASS =
  "min-h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-left text-[11px] text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";

export default function ImageContextActions({
  object,
  engine,
  editAndCommit,
  bitmap = null,
}) {
  const { t } = useI18n();
  const frequencyRadiusRef = useRef(null);
  const [frequencyError, setFrequencyError] = useState("");
  if (object?.kind !== "image") return null;

  const applyFrequencySeparation = async () => {
    try {
      await engine?.frequencySeparateSelected?.(
        object.id,
        Number(frequencyRadiusRef.current?.value),
      );
      setFrequencyError("");
    } catch (error) {
      const key =
        typeof error?.message === "string" &&
        error.message.startsWith("editor.frequencySeparation.error.")
          ? error.message
          : "editor.frequencySeparation.error.generic";
      setFrequencyError(t(key));
    }
  };

  const applyFitOrFill = (event) => {
    const mode = event.target.value;
    event.target.value = "";
    if (!mode) return;

    const doc = engine?.getDocument?.();
    const parent =
      doc?.nodes?.find((node) => node.id === object.parentId) ?? doc;
    if (!parent?.width || !parent?.height || !object.width || !object.height) {
      return;
    }

    const scale = Math[mode === "fit" ? "min" : "max"](
      parent.width / object.width,
      parent.height / object.height,
    );
    const width = object.width * scale;
    const height = object.height * scale;
    editAndCommit({
      width,
      height,
      x: (parent.x ?? 0) + (parent.width - width) / 2,
      y: (parent.y ?? 0) + (parent.height - height) / 2,
    });
  };

  return (
    // Image-only tools now live in a regular, always-open inspector section so
    // they are visible without opening a disclosure. The regular fill, stroke
    // and effects sections still follow like any rectangle.
    <StaticSection title={t("editor.image.tools")} testId="image-context-actions">
      <div
        role="group"
        aria-label={t("editor.context.image")}
        className="flex flex-col gap-2 pb-1"
      >
        <HistogramStrip bitmap={bitmap} />
        <div className="flex items-stretch gap-1.5">
          <label className="flex min-h-8 min-w-0 flex-1 items-center justify-between gap-1 rounded-lg bg-white/[0.04] px-2 text-[10px] text-neutral-400">
            <span className="truncate">{t("editor.frequencySeparation.radius")}</span>
            <input
              ref={frequencyRadiusRef}
              type="number"
              min="1"
              max="100"
              defaultValue="10"
              aria-label={t("editor.frequencySeparation.radius")}
              className="h-6 w-12 shrink-0 rounded-md border border-white/10 bg-neutral-900 px-1 text-right text-[11px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
            />
          </label>
          <button
            type="button"
            aria-label={t("editor.frequencySeparation.action")}
            className={`${ACTION_BUTTON_CLASS} min-w-0 flex-1 truncate px-2 text-center`}
            onClick={applyFrequencySeparation}
          >
            {t("editor.frequencySeparation.action")}
          </button>
        </div>
        {frequencyError ? (
          <p
            role="status"
            aria-live="polite"
            className="text-[10px] text-rose-300"
          >
            {frequencyError}
          </p>
        ) : null}
        <CustomSelect
          aria-label={t("editor.image.fitFill")}
          defaultValue=""
          onChange={applyFitOrFill}
          className="h-8 w-full rounded-lg border border-white/10 bg-neutral-900 px-2 text-[10px] text-neutral-300 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
        >
          <option value="" disabled>
            {t("editor.image.fitFill")}
          </option>
          <option value="fit">{t("editor.image.fit")}</option>
          <option value="fill">{t("editor.image.fill")}</option>
        </CustomSelect>
      </div>
    </StaticSection>
  );
}

ImageContextActions.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
  editAndCommit: PropTypes.func.isRequired,
  /** Decoded bitmap for the live histogram; null when unavailable. */
  bitmap: PropTypes.object,
};
