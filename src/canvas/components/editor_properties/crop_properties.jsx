/** Crop tool properties: mode, aspect ratio presets, fixed dimensions, straighten angle, and commit controls. */

import PropTypes from "prop-types";
import { useState } from "react";
import { cropModeFields } from "../../editor/crop_panel_fields.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";

export default function CropProperties({
  cropRatio = null,
  onCropRatio,
  onResetCrop,
  cropMode = "free",
  onCropMode,
  cropWidth = 0,
  cropHeight = 0,
  onCropSize,
  cropAngle = 0,
  onCropAngle,
  onAutoCrop,
  onApplyCrop,
  onApplyDestructiveCrop,
  onCancelCrop,
  imageCropMode = false,
}) {
  const { t } = useI18n();
  const [deleteCroppedPixels, setDeleteCroppedPixels] = useState(false);

  const cropFields = cropModeFields(cropMode);
  const showCropRatio = cropFields.includes("ratio");
  const showCropWidth = cropFields.includes("width");
  const showCropHeight = cropFields.includes("height");
  const activeCropRatio = cropMode === "ratio" && cropRatio > 0 ? cropRatio : 0;

  return (
    <StaticSection title={t("editor.crop")}>
      {/* Mode toggle: Free / Fixed Ratio / Fixed Size */}
      <div
        className="grid grid-cols-3 gap-1.5"
        role="radiogroup"
        aria-label={t("editor.cropMode")}
      >
        {[
          { value: "free", label: t("editor.crop.modeFree") },
          { value: "ratio", label: t("editor.crop.modeRatio") },
          { value: "size", label: t("editor.crop.modeSize") },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={cropMode === value}
            onClick={() => onCropMode?.(value)}
            className={`rounded-xl py-1.5 text-[11px] font-mono transition-all ${
              cropMode === value
                ? "bg-white text-black font-semibold"
                : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!imageCropMode && <>
      {/* Smart framing: solves the frame for the chosen ratio from the page's
          own content instead of centring it. Needs a ratio to solve for, so it
          stays disabled in Free mode and says why. Called without an optional
          chain on purpose: the handler is wired by the editor that supplies
          these props, and a missing one must throw on click rather than turn
          the button into a silent no-op. */}
      <button
        type="button"
        data-testid="crop-smart"
        disabled={!activeCropRatio}
        onClick={() => onAutoCrop()}
        title={
          activeCropRatio
            ? t("editor.crop.smartHint")
            : t("editor.crop.smartNeedsRatio")
        }
        className={`mt-1.5 w-full rounded-xl py-1.5 text-[11px] font-mono transition-all disabled:opacity-40 ${
          activeCropRatio
            ? "bg-[#222222] text-neutral-300 hover:bg-[#2a2a2a] hover:text-white"
            : "bg-[#222222] text-neutral-500"
        }`}
      >
        {t("editor.crop.smart")}
      </button>
      </>}

      {/* Fixed Ratio — aspect presets + a custom numeric ratio */}
      {showCropRatio && (
        <div className="mt-2 space-y-1.5">
          <div
            className="grid grid-cols-4 gap-1.5"
            role="radiogroup"
            aria-label={t("editor.crop.ratioPreset")}
          >
            {[
              { ratio: 1, label: "1:1" },
              { ratio: 4 / 3, label: "4:3" },
              { ratio: 3 / 2, label: "3:2" },
              { ratio: 16 / 9, label: "16:9" },
              { ratio: 9 / 16, label: "9:16" },
              { ratio: 3 / 4, label: "3:4" },
              { ratio: 4 / 5, label: "4:5" },
              { ratio: 21 / 9, label: "21:9" },
            ].map(({ ratio, label }) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={activeCropRatio === ratio}
                onClick={() => onCropRatio?.(ratio)}
                className={`rounded-lg py-1.5 text-[11px] font-mono transition-all ${
                  activeCropRatio === ratio
                    ? "bg-white text-black font-semibold"
                    : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              prefix="R"
              value={cropRatio || 1}
              min={0.1}
              max={100}
              step={0.01}
              onValueChange={(value) => onCropRatio?.(value)}
              ariaLabel={t("editor.crop.ratioCustom")}
            />
          </div>
        </div>
      )}

      {/* Fixed Size — W/H numeric entry */}
      {(showCropWidth || showCropHeight) && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <ScrubField
            prefix="W"
            value={cropWidth}
            min={1}
            onValueChange={(value) => onCropSize?.(value, cropHeight)}
            ariaLabel={t("editor.crop.width")}
          />
          <ScrubField
            prefix="H"
            value={cropHeight}
            min={1}
            onValueChange={(value) => onCropSize?.(cropWidth, value)}
            ariaLabel={t("editor.crop.height")}
          />
        </div>
      )}

      {!imageCropMode && <>
      {/* Straighten — angle slider */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wide text-neutral-400">
          <span>{t("editor.crop.straighten")}</span>
          <span>{Math.round(cropAngle)}°</span>
        </div>
        <input
          type="range"
          min={-45}
          max={45}
          step={0.5}
          value={cropAngle}
          onChange={(event) => onCropAngle?.(Number(event.target.value))}
          className="flat-range w-full"
          aria-label={t("editor.crop.straighten")}
        />
      </div>

      {/* Delete Cropped Pixels — checked routes Apply down the destructive path */}
      <label className="mt-2 flex items-center gap-2 text-[11px] text-neutral-300">
        <input
          type="checkbox"
          checked={deleteCroppedPixels}
          onChange={(event) => setDeleteCroppedPixels(event.target.checked)}
          className="flat-check"
        />
        <span>{t("editor.crop.deletePixels")}</span>
      </label>
      </>}

      {/* Apply / Cancel — always visible while the crop tool is active */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() =>
            deleteCroppedPixels && !imageCropMode
              ? onApplyDestructiveCrop?.()
              : onApplyCrop?.()
          }
          className="rounded-xl bg-white py-1.5 text-[11px] font-semibold text-black hover:bg-neutral-200 transition-colors"
        >
          {t("editor.crop.apply")}
        </button>
        <button
          type="button"
          onClick={() => onCancelCrop?.()}
          className="rounded-xl bg-[#222222] py-1.5 text-[11px] font-mono text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors"
        >
          {t("editor.crop.cancel")}
        </button>
      </div>

      {onResetCrop && (
        <button
          type="button"
          onClick={() => onResetCrop()}
          className="mt-2 w-full rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors"
        >
          {t("editor.crop.reset")}
        </button>
      )}
    </StaticSection>
  );
}

CropProperties.propTypes = {
  cropRatio: PropTypes.number,
  onCropRatio: PropTypes.func,
  onResetCrop: PropTypes.func,
  cropMode: PropTypes.oneOf(["free", "ratio", "size"]),
  onCropMode: PropTypes.func,
  cropWidth: PropTypes.number,
  cropHeight: PropTypes.number,
  onCropSize: PropTypes.func,
  cropAngle: PropTypes.number,
  onCropAngle: PropTypes.func,
  onAutoCrop: PropTypes.func,
  onApplyCrop: PropTypes.func,
  onApplyDestructiveCrop: PropTypes.func,
  onCancelCrop: PropTypes.func,
  imageCropMode: PropTypes.bool,
};
