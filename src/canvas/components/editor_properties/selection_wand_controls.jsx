/** Magic wand tolerance, sample size, and sample flags controls. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import ToolSliderField from "./tool_slider_field.jsx";
import FlatSelect from "../flat_select.jsx";
import { sectionRowClass } from "./property_section.jsx";

export default function SelectionWandControls({
  isWand = false,
  wandTolerance = 32,
  onWandTolerance,
  wandSampleSize = 0,
  onWandSampleSize,
  wandContiguous = true,
  onWandContiguous,
  wandAntiAlias = true,
  onWandAntiAlias,
  wandSampleAll = false,
  onWandSampleAll,
}) {
  const { t } = useI18n();

  if (!isWand) return null;

  return (
    <div className="space-y-1.5 pt-1">
      <ToolSliderField
        label={t("editor.wand.tolerance")}
        min={0}
        max={255}
        value={Math.round(wandTolerance)}
        onValueChange={(val) => onWandTolerance?.(val)}
        ariaLabel={t("editor.wand.tolerance")}
        scrubHint={t("editor.props.dragToAdjust")}
      />
      {onWandSampleSize ? (
        <div className="flex h-7 min-w-0 items-center gap-2">
          <span className="w-[64px] shrink-0 truncate text-[10px] font-mono uppercase tracking-wide text-neutral-500">
            {t("editor.wand.sampleSize")}
          </span>
          <FlatSelect
            value={String(wandSampleSize ?? 0)}
            onChange={(value) => onWandSampleSize(Number(value))}
            label={t("editor.wand.sampleSize")}
            options={[
              { value: "0", label: t("editor.wand.samplePoint") },
              { value: "1", label: t("editor.wand.sample3x3") },
              { value: "2", label: t("editor.wand.sample5x5") },
            ]}
            className="min-w-0 flex-1"
            triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2.5 !text-[10px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-neutral-800/80"
            widthClass="w-40"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onWandContiguous?.(!wandContiguous)}
          aria-pressed={wandContiguous}
          className={`${sectionRowClass} justify-center px-1 text-[10px] ${
            wandContiguous
              ? "text-white ring-1 ring-white/25"
              : "text-neutral-400"
          }`}
        >
          {t("editor.wand.contiguous")}
        </button>
        <button
          type="button"
          onClick={() => onWandAntiAlias?.(!wandAntiAlias)}
          aria-pressed={wandAntiAlias}
          className={`${sectionRowClass} justify-center px-1 text-[10px] ${
            wandAntiAlias
              ? "text-white ring-1 ring-white/25"
              : "text-neutral-400"
          }`}
        >
          {t("editor.wand.antiAlias")}
        </button>
        <button
          type="button"
          onClick={() => onWandSampleAll?.(!wandSampleAll)}
          aria-pressed={wandSampleAll}
          className={`${sectionRowClass} justify-center px-1 text-[10px] ${
            wandSampleAll
              ? "text-white ring-1 ring-white/25"
              : "text-neutral-400"
          }`}
        >
          {t("editor.wand.sampleAll")}
        </button>
      </div>
    </div>
  );
}

SelectionWandControls.propTypes = {
  isWand: PropTypes.bool,
  wandTolerance: PropTypes.number,
  onWandTolerance: PropTypes.func,
  wandSampleSize: PropTypes.number,
  onWandSampleSize: PropTypes.func,
  wandContiguous: PropTypes.bool,
  onWandContiguous: PropTypes.func,
  wandAntiAlias: PropTypes.bool,
  onWandAntiAlias: PropTypes.func,
  wandSampleAll: PropTypes.bool,
  onWandSampleAll: PropTypes.func,
};
