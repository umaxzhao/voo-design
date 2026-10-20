/** Eyedropper tool property controls: sample size, source layer, and sample ring toggle. */

import PropTypes from "prop-types";
import { dropperModeFields } from "../../editor/eyedropper_properties.js";
import { HIDE_SAMPLING_RING } from "../../editor/eyedropper_gate.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import FlatSelect from "../flat_select.jsx";

export default function EyedropperProperties({
  dropperSampleSize = 0,
  onDropperSampleSize,
  dropperSource = "current",
  onDropperSource,
  showSampleRing = true,
  onShowSampleRing,
}) {
  const { t } = useI18n();
  const dropperFields = dropperModeFields(dropperSampleSize);

  return (
    <>
      {onDropperSampleSize && (
        <StaticSection title={t("editor.dropper.sampleSize")}>
          <FlatSelect
            value={String(dropperSampleSize ?? 0)}
            onChange={(value) => onDropperSampleSize(Number(value))}
            label={t("editor.dropper.sampleSize")}
            options={[
              { value: "0", label: t("editor.dropper.sample1x1") },
              { value: "1", label: t("editor.dropper.sample3x3") },
              { value: "2", label: t("editor.dropper.sample5x5") },
              { value: "3", label: t("editor.dropper.sample11x11") },
              { value: "4", label: t("editor.dropper.sample31x31") },
            ]}
            triggerClassName="!h-8 !w-full !rounded-xl !bg-[#222222] !pl-3 !pr-7 !py-1.5 !text-[11px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-[#2a2a2a]"
            widthClass="w-44"
          />
        </StaticSection>
      )}

      {dropperFields.includes("sampleLayers") && onDropperSource && (
        <StaticSection title={t("editor.dropper.source")}>
          <FlatSelect
            value={dropperSource ?? "current"}
            onChange={(value) => onDropperSource(value)}
            label={t("editor.dropper.source")}
            options={[
              { value: "current", label: t("editor.dropper.sourceCurrent") },
              { value: "below", label: t("editor.dropper.sourceBelow") },
              { value: "all", label: t("editor.dropper.sourceAll") },
            ]}
            triggerClassName="!h-8 !w-full !rounded-xl !bg-[#222222] !pl-3 !pr-7 !py-1.5 !text-[11px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-[#2a2a2a]"
            widthClass="w-44"
          />
        </StaticSection>
      )}

      {!HIDE_SAMPLING_RING &&
        dropperFields.includes("showSampleRing") &&
        onShowSampleRing && (
          <StaticSection title={t("editor.dropper.sampleRing")}>
            <button
              type="button"
              onClick={() => onShowSampleRing(!showSampleRing)}
              aria-pressed={Boolean(showSampleRing)}
              className={`w-full rounded-xl py-1.5 text-[11px] font-mono transition-all ${
                showSampleRing
                  ? "bg-white text-black font-semibold"
                  : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-white"
              }`}
            >
              {t("editor.dropper.sampleRing")}
            </button>
          </StaticSection>
        )}
    </>
  );
}

EyedropperProperties.propTypes = {
  dropperSampleSize: PropTypes.number,
  onDropperSampleSize: PropTypes.func,
  dropperSource: PropTypes.string,
  onDropperSource: PropTypes.func,
  showSampleRing: PropTypes.bool,
  onShowSampleRing: PropTypes.func,
};
