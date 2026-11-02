/** Eyedropper tool property controls: sample size, source layer, and sample ring toggle. */

import PropTypes from "prop-types";
import { dropperModeFields } from "../../editor/eyedropper_properties.js";
import { HIDE_SAMPLING_RING } from "../../editor/eyedropper_gate.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";
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

  const selectRow = (label, control) => (
    <div className="flex h-7 min-w-0 items-center gap-2">
      <span className="w-[76px] shrink-0 truncate text-[10px] font-mono uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">{control}</div>
    </div>
  );

  return (
    <StaticSection title={t("editor.tool.dropper")}>
      <div className="flex flex-col gap-2.5">
        {onDropperSampleSize
          ? selectRow(
              t("editor.dropper.sampleSize"),
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
                className="min-w-0 w-full"
                triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2.5 !text-[10px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-neutral-800/80"
                widthClass="w-full"
              />,
            )
          : null}

        {dropperFields.includes("sampleLayers") && onDropperSource
          ? selectRow(
              t("editor.dropper.source"),
              <FlatSelect
                value={dropperSource ?? "current"}
                onChange={(value) => onDropperSource(value)}
                label={t("editor.dropper.source")}
                options={[
                  { value: "current", label: t("editor.dropper.sourceCurrent") },
                  { value: "below", label: t("editor.dropper.sourceBelow") },
                  { value: "all", label: t("editor.dropper.sourceAll") },
                ]}
                className="min-w-0 w-full"
                triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2.5 !text-[10px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-neutral-800/80"
                widthClass="w-full"
              />,
            )
          : null}

        {!HIDE_SAMPLING_RING &&
        dropperFields.includes("showSampleRing") &&
        onShowSampleRing ? (
          <button
            type="button"
            onClick={() => onShowSampleRing(!showSampleRing)}
            aria-pressed={Boolean(showSampleRing)}
            className={`${sectionRowClass} justify-between text-[10px] ${
              showSampleRing
                ? "text-white ring-1 ring-white/25"
                : "text-neutral-400"
            }`}
          >
            <span className="truncate uppercase tracking-wide">
              {t("editor.dropper.sampleRing")}
            </span>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                showSampleRing ? "bg-[#a7ffd4]" : "bg-neutral-600"
              }`}
            />
          </button>
        ) : null}
      </div>
    </StaticSection>
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
