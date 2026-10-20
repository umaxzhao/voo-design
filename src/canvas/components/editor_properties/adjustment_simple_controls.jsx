/** Scalar, levels, invert, threshold, curves, and vibrance adjustment controls. */

import PropTypes from "prop-types";
import { useState } from "react";
import ToneCurvesWidget from "./tone_curves_widget.jsx";
import HistogramStrip from "./histogram_strip.jsx";
import FlatSelect from "../flat_select.jsx";
import { EditorField } from "../editor_controls.jsx";
import { HUE_BAND_KEYS } from "../../editor/scene_model_core.js";
import { SIMPLE_ADJUSTMENTS } from "../../editor/adjustment_catalog.js";
import { LEVELS_SLIDERS } from "./adjustment_controls_constants.js";

export default function AdjustmentSimpleControls({
  kind,
  adjustments,
  updateCategory,
  resetCategory,
  Slider,
  commitNow = null,
  bitmap = null,
  t,
}) {
  /** Which Hue/Saturation colour band the per-band sliders edit. */
  const [hsBand, setHsBand] = useState("reds");

  const checkboxRow = (labelKey, checked, onChange) => (
    <EditorField label={t(labelKey)} compact>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={checked}
            aria-label={t(labelKey)}
            onChange={onChange}
            className="flat-check"
          />
          <span className="text-[10px] text-neutral-300 font-mono">
            {t(checked ? "editor.props.enabled" : "editor.props.disabled")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => resetCategory(kind)}
          className="text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
        >
          {t("editor.props.reset")}
        </button>
      </div>
    </EditorField>
  );

  // Scalar adjustments share one generic slider renderer.
  const meta = SIMPLE_ADJUSTMENTS.find((a) => a.kind === kind);
  if (meta) {
    const value = adjustments[kind]?.value ?? 0;
    const enabled = adjustments[kind]?.enabled !== false;
    const slider = (
      <Slider
        label={t(meta.labelKey)}
        hideLabel
        unit={meta.unit}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={value}
        enabled={enabled}
        onToggle={(next) => updateCategory(kind, { enabled: next })}
        onChange={(next) => updateCategory(kind, { value: next })}
        onReset={() => resetCategory(kind)}
      />
    );
    // Photoshop's Hue/Saturation panel pairs the hue dial with a Colorize
    // checkbox and six per-colour bands.
    if (kind === "hue") {
      const band = adjustments.hue?.bands?.[hsBand] ?? { h: 0, s: 0, l: 0 };
      const bandLabel = (key) =>
        `editor.props.bw${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      const setBand = (field, val) =>
        updateCategory("hue", {
          bands: {
            ...(adjustments.hue?.bands ?? {}),
            [hsBand]: { ...band, [field]: val },
          },
        });
      const clearBand = () => {
        const bands = { ...(adjustments.hue?.bands ?? {}) };
        delete bands[hsBand];
        updateCategory("hue", { bands });
      };
      return (
        <>
          {slider}
          {checkboxRow(
            "editor.props.colorize",
            Boolean(adjustments.hue?.colorize),
            (event) =>
              updateCategory("hue", { colorize: event.target.checked }),
          )}
          <EditorField label={t("editor.props.hsBands")} compact>
            <FlatSelect
              value={hsBand}
              onChange={setHsBand}
              label={t("editor.props.hsBands")}
              options={HUE_BAND_KEYS.map((key) => ({
                value: key,
                label: t(bandLabel(key)),
              }))}
              triggerClassName="!h-8 !w-full !rounded-xl !bg-[#222222] !pl-3 !pr-7 !py-1.5 !text-[11px] !font-mono !text-neutral-100 hover:!bg-[#2a2a2a]"
              widthClass="w-44"
            />
            {[
              {
                key: "h",
                labelKey: "editor.props.hue",
                unit: "°",
                min: -180,
                max: 180,
              },
              {
                key: "s",
                labelKey: "editor.props.saturation",
                unit: "%",
                min: -100,
                max: 100,
              },
              {
                key: "l",
                labelKey: "editor.props.lightness",
                unit: "%",
                min: -100,
                max: 100,
              },
            ].map(({ key, labelKey, unit, min, max }) => (
              <Slider
                key={key}
                label={t(labelKey)}
                hideLabel
                unit={unit}
                min={min}
                max={max}
                value={band[key]}
                enabled={adjustments.hue?.enabled !== false}
                onToggle={(next) => updateCategory("hue", { enabled: next })}
                onChange={(next) => setBand(key, next)}
                onReset={clearBand}
              />
            ))}
          </EditorField>
        </>
      );
    }
    return slider;
  }

  switch (kind) {
    case "levels":
      return (
        <div className="flex flex-col gap-2">
          {/* Where the tones the levels sliders move actually sit. */}
          <HistogramStrip bitmap={bitmap} />
          {LEVELS_SLIDERS.map((slider) => (
            <Slider
              key={slider.key}
              label={t(slider.labelKey)}
              unit={slider.unit}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={adjustments.levels[slider.key]}
              enabled={adjustments.levels.enabled}
              onToggle={(enabled) => updateCategory("levels", { enabled })}
              onChange={(value) =>
                updateCategory("levels", { [slider.key]: value })
              }
              onReset={() => resetCategory("levels")}
            />
          ))}
        </div>
      );

    case "invert":
      return checkboxRow(
        "editor.props.invert",
        adjustments.invert.enabled,
        (event) => updateCategory("invert", { enabled: event.target.checked }),
      );

    case "threshold":
      return (
        <Slider
          label={t("editor.props.threshold")}
          min={0}
          max={255}
          step={1}
          value={adjustments.threshold.value}
          enabled={adjustments.threshold.enabled}
          onToggle={(enabled) => updateCategory("threshold", { enabled })}
          onChange={(value) => updateCategory("threshold", { value })}
          onReset={() => resetCategory("threshold")}
        />
      );

    case "curves":
      return (
        <>
          {/* The shape the curve is drawn against. */}
          <HistogramStrip bitmap={bitmap} className="mb-2" />
          {checkboxRow(
            "editor.props.curves",
            adjustments.curves.enabled,
            (event) =>
              updateCategory("curves", { enabled: event.target.checked }),
          )}
          {adjustments.curves.enabled ? (
            <ToneCurvesWidget
              curves={adjustments.curves}
              onChange={(nextCurves) => updateCategory("curves", nextCurves)}
              onCommit={commitNow}
            />
          ) : null}
        </>
      );

    case "vibrance":
      return (
        <Slider
          label={t("editor.props.vibrance")}
          min={-100}
          max={100}
          step={1}
          value={adjustments.vibrance.value}
          enabled={adjustments.vibrance.enabled}
          onToggle={(enabled) => updateCategory("vibrance", { enabled })}
          onChange={(value) => updateCategory("vibrance", { value })}
          onReset={() => resetCategory("vibrance")}
        />
      );

    default:
      return null;
  }
}

AdjustmentSimpleControls.propTypes = {
  kind: PropTypes.string.isRequired,
  adjustments: PropTypes.object.isRequired,
  updateCategory: PropTypes.func.isRequired,
  resetCategory: PropTypes.func.isRequired,
  Slider: PropTypes.elementType.isRequired,
  commitNow: PropTypes.func,
  bitmap: PropTypes.object,
  t: PropTypes.func.isRequired,
};
