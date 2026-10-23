/** Pressure dynamics, roundness, angle, blend mode, and clone options for brush tools. */

import PropTypes from "prop-types";
import { useState } from "react";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import ToolSliderField from "./tool_slider_field.jsx";
import FlatSelect from "../flat_select.jsx";

export const BRUSH_BLEND_OPTIONS = [
  { mode: "normal", labelKey: "editor.blend.sourceOver" },
  { mode: "darken", labelKey: "editor.blend.darken" },
  { mode: "multiply", labelKey: "editor.blend.multiply" },
  { mode: "color-burn", labelKey: "editor.blend.colorBurn" },
  { mode: "linear-burn", labelKey: "editor.blend.linearBurn" },
  { mode: "lighten", labelKey: "editor.blend.lighten" },
  { mode: "screen", labelKey: "editor.blend.screen" },
  { mode: "color-dodge", labelKey: "editor.blend.colorDodge" },
  { mode: "linear-dodge", labelKey: "editor.blend.linearDodge" },
  { mode: "overlay", labelKey: "editor.blend.overlay" },
  { mode: "soft-light", labelKey: "editor.blend.softLight" },
  { mode: "hard-light", labelKey: "editor.blend.hardLight" },
  { mode: "vivid-light", labelKey: "editor.blend.vividLight" },
  { mode: "linear-light", labelKey: "editor.blend.linearLight" },
  { mode: "pin-light", labelKey: "editor.blend.pinLight" },
  { mode: "hard-mix", labelKey: "editor.blend.hardMix" },
  { mode: "difference", labelKey: "editor.blend.difference" },
  { mode: "exclusion", labelKey: "editor.blend.exclusion" },
  { mode: "subtract", labelKey: "editor.blend.subtract" },
  { mode: "divide", labelKey: "editor.blend.divide" },
  { mode: "hue", labelKey: "editor.blend.hue" },
  { mode: "saturation", labelKey: "editor.blend.saturation" },
  { mode: "color", labelKey: "editor.blend.color" },
  { mode: "luminosity", labelKey: "editor.blend.luminosity" },
  { mode: "dissolve", labelKey: "editor.blend.dissolve" },
];

export default function BrushAdvancedControls({
  tool,
  isNormalBrush = false,
  isRetouchActive = false,
  pressureSize = false,
  onPressureSize,
  pressureOpacity = false,
  onPressureOpacity,
  brushRoundness = 1,
  onBrushRoundness,
  brushAngle = 0,
  onBrushAngle,
  brushBlendMode = "normal",
  onBrushBlendMode,
  healingMode = "aiRepair",
  cloneAligned = false,
  onCloneAligned,
}) {
  const { t } = useI18n();
  const [advancedBrushOpen, setAdvancedBrushOpen] = useState(false);

  return (
    <>
      {(onPressureSize || onPressureOpacity) &&
      (tool === TOOL.BRUSH ||
        tool === TOOL.ERASER ||
        isRetouchActive) ? (
        <div className="space-y-1.5 pt-0.5">
          {onPressureSize && (
            <button
              type="button"
              role="switch"
              aria-checked={pressureSize}
              onClick={() => onPressureSize?.(!pressureSize)}
              className={`flex h-7 w-full items-center justify-between rounded-xl px-2.5 transition-all ${
                pressureSize
                  ? "bg-neutral-800 text-white ring-1 ring-[#a7ffd4]/40"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-800/80 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-3.5 h-3.5 shrink-0 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <path d="M2 2l7.586 7.586" />
                </svg>
                <span className="text-[10px] font-mono">
                  {t("editor.pressureSize")}
                </span>
              </div>
              <div
                className={`relative h-4 w-7 rounded-full transition-colors ${
                  pressureSize ? "bg-white" : "bg-white/10"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${
                    pressureSize
                      ? "left-3.5 bg-black"
                      : "left-0.5 bg-neutral-400"
                  }`}
                />
              </div>
            </button>
          )}
          {onPressureOpacity && (
            <button
              type="button"
              role="switch"
              aria-checked={pressureOpacity}
              onClick={() => onPressureOpacity?.(!pressureOpacity)}
              className={`flex h-7 w-full items-center justify-between rounded-xl px-2.5 transition-all ${
                pressureOpacity
                  ? "bg-neutral-800 text-white ring-1 ring-[#a7ffd4]/40"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-800/80 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-3.5 h-3.5 shrink-0 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
                </svg>
                <span className="text-[10px] font-mono">
                  {t("editor.pressureOpacity")}
                </span>
              </div>
              <div
                className={`relative h-4 w-7 rounded-full transition-colors ${
                  pressureOpacity ? "bg-white" : "bg-white/10"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${
                    pressureOpacity
                      ? "left-3.5 bg-black"
                      : "left-0.5 bg-neutral-400"
                  }`}
                />
              </div>
            </button>
          )}
        </div>
      ) : null}

      {isNormalBrush &&
      (onBrushRoundness || onBrushAngle || onBrushBlendMode) ? (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => setAdvancedBrushOpen((open) => !open)}
            aria-expanded={advancedBrushOpen}
            className="mb-1.5 flex w-full items-center justify-between rounded-lg px-1 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-neutral-200"
          >
            <span>{t("editor.brushAdvanced")}</span>
            <span aria-hidden="true">
              {advancedBrushOpen ? "⌃" : "⌄"}
            </span>
          </button>
        </div>
      ) : null}

      {isNormalBrush && advancedBrushOpen ? (
        <div className="space-y-2.5">
          {isNormalBrush && onBrushRoundness ? (
            <ToolSliderField
              label={t("editor.brushRoundness")}
              icon={
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <ellipse cx="12" cy="12" rx="8" ry="5" />
                </svg>
              }
              suffix="%"
              min={1}
              max={100}
              value={Math.round(brushRoundness * 100)}
              onValueChange={(val) => onBrushRoundness(val / 100)}
              ariaLabel={t("editor.brushRoundness")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          ) : null}
          {isNormalBrush && onBrushAngle ? (
            <ToolSliderField
              label={t("editor.brushAngle")}
              icon={
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="12" x2="18" y2="6" />
                  <circle cx="12" cy="12" r="8" />
                </svg>
              }
              suffix="°"
              min={0}
              max={360}
              value={Math.round(brushAngle)}
              onValueChange={(val) => onBrushAngle(val % 360)}
              ariaLabel={t("editor.brushAngle")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          ) : null}
          {isNormalBrush && onBrushBlendMode ? (
            <FlatSelect
              value={brushBlendMode}
              onChange={onBrushBlendMode}
              label={t("editor.brushBlendMode")}
              options={BRUSH_BLEND_OPTIONS.map(
                ({ mode, labelKey }) => ({
                  value: mode,
                  label: t(labelKey),
                }),
              )}
              triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !pl-2.5 !pr-7 !text-[10px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-neutral-800/80 capitalize"
              widthClass="w-44"
            />
          ) : null}
        </div>
      ) : null}

      {tool === TOOL.HEALING &&
      healingMode === "clone" &&
      onCloneAligned ? (
        <label className="mt-1.5 flex h-7 cursor-pointer items-center gap-2 rounded-xl bg-neutral-800 px-2.5 transition-colors hover:bg-neutral-800/80">
          <input
            type="checkbox"
            checked={cloneAligned}
            onChange={(e) => onCloneAligned(e.target.checked)}
            className="accent-white h-3 w-3 rounded-lg"
          />
          <span className="text-[10px] font-mono text-neutral-300">
            {t("editor.clone.aligned")}
          </span>
        </label>
      ) : null}
    </>
  );
}

BrushAdvancedControls.propTypes = {
  tool: PropTypes.string,
  isNormalBrush: PropTypes.bool,
  isRetouchActive: PropTypes.bool,
  pressureSize: PropTypes.bool,
  onPressureSize: PropTypes.func,
  pressureOpacity: PropTypes.bool,
  onPressureOpacity: PropTypes.func,
  brushRoundness: PropTypes.number,
  onBrushRoundness: PropTypes.func,
  brushAngle: PropTypes.number,
  onBrushAngle: PropTypes.func,
  brushBlendMode: PropTypes.string,
  onBrushBlendMode: PropTypes.func,
  healingMode: PropTypes.oneOf(["spot", "aiRepair", "patch", "clone"]),
  cloneAligned: PropTypes.bool,
  onCloneAligned: PropTypes.func,
};
