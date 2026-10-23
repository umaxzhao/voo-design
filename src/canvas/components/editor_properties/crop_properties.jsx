/** Crop tool properties: mode, aspect ratio presets, fixed dimensions, straighten angle, and commit controls. */

import PropTypes from "prop-types";
import { useState } from "react";
import { cropModeFields } from "../../editor/crop_panel_fields.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";

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

  const toggleClass = (active) =>
    `${sectionRowClass} justify-center px-1 text-[10px] ${
      active ? "text-white ring-1 ring-white/25" : "text-neutral-400"
    }`;

  return (
    <StaticSection title={t("editor.crop")}>
      <div
        className="grid grid-cols-3 gap-1"
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
            className={toggleClass(cropMode === value)}
          >
            {label}
          </button>
        ))}
      </div>

      {!imageCropMode && (
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
          className={`${sectionRowClass} justify-center text-[10px] disabled:opacity-40 ${
            activeCropRatio ? "text-neutral-200" : "text-neutral-500"
          }`}
        >
          {t("editor.crop.smart")}
        </button>
      )}

      {showCropRatio && (
        <div className="space-y-1.5">
          <div
            className="grid grid-cols-4 gap-1"
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
                className={toggleClass(activeCropRatio === ratio)}
              >
                {label}
              </button>
            ))}
          </div>
          <ToolSliderField
            label={t("editor.crop.ratioCustom")}
            min={0.1}
            max={100}
            step={0.01}
            value={cropRatio || 1}
            onValueChange={(value) => onCropRatio?.(value)}
            ariaLabel={t("editor.crop.ratioCustom")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        </div>
      )}

      {(showCropWidth || showCropHeight) && (
        <div className="flex flex-col gap-1.5">
          {showCropWidth ? (
            <ToolSliderField
              label={t("editor.crop.width")}
              min={1}
              max={8192}
              value={cropWidth}
              onValueChange={(value) => onCropSize?.(value, cropHeight)}
              suffix="px"
              ariaLabel={t("editor.crop.width")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          ) : null}
          {showCropHeight ? (
            <ToolSliderField
              label={t("editor.crop.height")}
              min={1}
              max={8192}
              value={cropHeight}
              onValueChange={(value) => onCropSize?.(cropWidth, value)}
              suffix="px"
              ariaLabel={t("editor.crop.height")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          ) : null}
        </div>
      )}

      {!imageCropMode && (
        <>
          <ToolSliderField
            label={t("editor.crop.straighten")}
            min={-45}
            max={45}
            step={0.5}
            value={cropAngle}
            onValueChange={(value) => onCropAngle?.(value)}
            suffix="°"
            ariaLabel={t("editor.crop.straighten")}
            scrubHint={t("editor.props.dragToAdjust")}
          />

          <button
            type="button"
            role="switch"
            aria-checked={deleteCroppedPixels}
            onClick={() => setDeleteCroppedPixels((v) => !v)}
            className={`${sectionRowClass} justify-between text-[10px] ${
              deleteCroppedPixels
                ? "text-white ring-1 ring-white/25"
                : "text-neutral-400"
            }`}
          >
            <span className="truncate">{t("editor.crop.deletePixels")}</span>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                deleteCroppedPixels ? "bg-[#a7ffd4]" : "bg-neutral-600"
              }`}
            />
          </button>
        </>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() =>
            deleteCroppedPixels && !imageCropMode
              ? onApplyDestructiveCrop?.()
              : onApplyCrop?.()
          }
          className="flex h-7 w-full items-center justify-center rounded-xl bg-white text-[11px] font-semibold text-black transition-colors hover:bg-neutral-200"
        >
          {t("editor.crop.apply")}
        </button>
        <button
          type="button"
          onClick={() => onCancelCrop?.()}
          className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
        >
          {t("editor.crop.cancel")}
        </button>
      </div>

      {onResetCrop && (
        <button
          type="button"
          onClick={() => onResetCrop()}
          className={`${sectionRowClass} justify-center text-[10px] uppercase tracking-wider text-neutral-300`}
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
