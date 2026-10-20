/** Shadow, glow, fill, and stroke effect controls. */

import PropTypes from "prop-types";
import { ColourRow } from "./effect_controls_helpers.jsx";

export default function EffectShadowGlowControls({
  kind,
  current,
  title,
  setEffect,
  setAndCommit,
  Field,
  t,
}) {
  const twoUp = (fields) => (
    <div className="grid grid-cols-2 gap-2">{fields}</div>
  );

  const shadowFields = (effect) => [
    <Field
      key="blur"
      prefix={t("editor.props.effectBlur")}
      min={0}
      max={100}
      value={Math.round(effect.blur)}
      onValueChange={(value) => setEffect({ blur: value })}
      ariaLabel={`${title} blur`}
      scrubHint={t("editor.props.dragToAdjust")}
    />,
    <Field
      key="x"
      prefix="X"
      min={-200}
      max={200}
      value={Math.round(effect.offsetX)}
      onValueChange={(value) => setEffect({ offsetX: value })}
      ariaLabel={`${title} offset X`}
      scrubHint={t("editor.props.dragToAdjust")}
    />,
    <Field
      key="y"
      prefix="Y"
      min={-200}
      max={200}
      value={Math.round(effect.offsetY)}
      onValueChange={(value) => setEffect({ offsetY: value })}
      ariaLabel={`${title} offset Y`}
      scrubHint={t("editor.props.dragToAdjust")}
    />,
  ];

  const colourAndOpacity = (effect, fallbackColor) => (
    <div className="grid grid-cols-2 gap-2 items-center">
      <ColourRow
        label={title}
        value={effect.color}
        fallback={fallbackColor}
        onChange={(color) => setAndCommit({ color })}
      />
      <Field
        prefix={t("editor.props.opacity")}
        min={0}
        max={100}
        value={Math.round(effect.opacity)}
        onValueChange={(value) => setEffect({ opacity: value })}
        ariaLabel={`${title} opacity`}
        scrubHint={t("editor.props.dragToAdjust")}
      />
    </div>
  );

  switch (kind) {
    case "shadow":
    case "innerShadow":
      return (
        <div className="flex flex-col gap-2">
          {colourAndOpacity(current, "#000000")}
          <div className="grid grid-cols-3 gap-2">{shadowFields(current)}</div>
        </div>
      );

    case "glow":
      return (
        <div className="flex flex-col gap-2">
          {colourAndOpacity(current, "#ffd166")}
          {twoUp([
            <Field
              key="blur"
              prefix={t("editor.props.effectBlur")}
              min={0}
              max={100}
              value={Math.round(current.blur)}
              onValueChange={(value) => setEffect({ blur: value })}
              ariaLabel={`${title} blur`}
              scrubHint={t("editor.props.dragToAdjust")}
            />,
            <Field
              key="spread"
              prefix={t("editor.props.effectSpread")}
              min={0}
              max={100}
              value={Math.round(current.spread)}
              onValueChange={(value) => setEffect({ spread: value })}
              ariaLabel={`${title} spread`}
              scrubHint={t("editor.props.dragToAdjust")}
            />,
          ])}
        </div>
      );

    case "innerGlow":
      return (
        <div className="flex flex-col gap-2">
          {colourAndOpacity(current, "#ffd166")}
          {twoUp([
            <Field
              key="blur"
              prefix={t("editor.props.effectBlur")}
              min={0}
              max={100}
              value={Math.round(current.blur)}
              onValueChange={(value) => setEffect({ blur: value })}
              ariaLabel={`${title} blur`}
              scrubHint={t("editor.props.dragToAdjust")}
            />,
            <Field
              key="size"
              prefix={t("editor.props.effectInnerGlowSize")}
              min={0}
              max={100}
              value={Math.round(current.size)}
              onValueChange={(value) => setEffect({ size: value })}
              ariaLabel={`${title} size`}
              scrubHint={t("editor.props.dragToAdjust")}
            />,
          ])}
        </div>
      );

    case "fill":
      return (
        <div className="flex flex-col gap-2">
          {colourAndOpacity(current, "#22c55e")}
        </div>
      );

    case "stroke":
      return (
        <div className="flex flex-col gap-2">
          {colourAndOpacity(current, "#000000")}
          <div className="grid grid-cols-2 gap-2 items-center">
            <div className="flex items-center justify-between rounded-xl bg-[#222222] p-1">
              {["inside", "center", "outside"].map((position) => (
                <button
                  key={position}
                  type="button"
                  onClick={() => setEffect({ position })}
                  className={`flex-1 rounded-lg py-1 font-mono text-[10px] transition-colors ${
                    current.position === position
                      ? "bg-[#333333] text-neutral-100"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {t(
                    `editor.props.effectStroke${position[0].toUpperCase()}${position.slice(1)}`,
                  )}
                </button>
              ))}
            </div>
            <Field
              prefix={t("editor.props.effectStrokeWidth")}
              min={0}
              max={100}
              value={Math.round(current.width)}
              onValueChange={(value) => setEffect({ width: value })}
              ariaLabel={`${title} width`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

EffectShadowGlowControls.propTypes = {
  kind: PropTypes.string.isRequired,
  current: PropTypes.object.isRequired,
  title: PropTypes.string.isRequired,
  setEffect: PropTypes.func.isRequired,
  setAndCommit: PropTypes.func.isRequired,
  Field: PropTypes.elementType.isRequired,
  t: PropTypes.func.isRequired,
};
