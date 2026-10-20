/** Magic wand tolerance, sample size, and sample flags controls. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import ScrubField from "../scrub_field.jsx";
import FlatSelect from "../flat_select.jsx";

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
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField
          prefix={
            <svg
              className="w-3.5 h-3.5 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="22" y1="12" x2="18" y2="12" />
              <line x1="6" y1="12" x2="2" y2="12" />
              <line x1="12" y1="6" x2="12" y2="2" />
              <line x1="12" y1="22" x2="12" y2="18" />
            </svg>
          }
          min={0}
          max={255}
          value={wandTolerance}
          onValueChange={(val) => onWandTolerance?.(val)}
          ariaLabel={t("editor.wand.tolerance")}
          scrubHint={t("editor.props.dragToAdjust")}
        />
        {onWandSampleSize ? (
          <FlatSelect
            value={String(wandSampleSize ?? 0)}
            onChange={(value) => onWandSampleSize(Number(value))}
            label={t("editor.wand.sampleSize")}
            options={[
              { value: "0", label: t("editor.wand.samplePoint") },
              { value: "1", label: t("editor.wand.sample3x3") },
              { value: "2", label: t("editor.wand.sample5x5") },
            ]}
            triggerClassName="!h-8 !w-full !rounded-xl !bg-[#222222] !pl-3 !pr-7 !py-1.5 !text-[11px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-[#282828]"
            widthClass="w-40"
          />
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onWandContiguous?.(!wandContiguous)}
          aria-pressed={wandContiguous}
          className={`rounded-xl py-1.5 text-[10px] font-mono transition-all ${
            wandContiguous
              ? "bg-white text-black font-semibold"
              : "bg-[#222222] text-neutral-400 hover:bg-[#282828] hover:text-white"
          }`}
        >
          {t("editor.wand.contiguous")}
        </button>
        <button
          type="button"
          onClick={() => onWandAntiAlias?.(!wandAntiAlias)}
          aria-pressed={wandAntiAlias}
          className={`rounded-xl py-1.5 text-[10px] font-mono transition-all ${
            wandAntiAlias
              ? "bg-white text-black font-semibold"
              : "bg-[#222222] text-neutral-400 hover:bg-[#282828] hover:text-white"
          }`}
        >
          {t("editor.wand.antiAlias")}
        </button>
        <button
          type="button"
          onClick={() => onWandSampleAll?.(!wandSampleAll)}
          aria-pressed={wandSampleAll}
          className={`rounded-xl py-1.5 text-[10px] font-mono transition-all ${
            wandSampleAll
              ? "bg-white text-black font-semibold"
              : "bg-[#222222] text-neutral-400 hover:bg-[#282828] hover:text-white"
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
