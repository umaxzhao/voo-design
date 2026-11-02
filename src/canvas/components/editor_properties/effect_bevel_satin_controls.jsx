/** Satin and bevel effect controls. */

import PropTypes from "prop-types";
import { ColourRow } from "./effect_controls_helpers.jsx";

export default function EffectBevelSatinControls({
  kind,
  current,
  title,
  setEffect,
  setAndCommit,
  Field,
  t,
}) {
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
    case "satin":
      return (
        <div className="flex flex-col gap-2">
          {colourAndOpacity(current, "#000000")}
          <div className="grid grid-cols-3 gap-2">
            <Field
              prefix={t("editor.props.effectBlur")}
              min={0}
              max={100}
              value={Math.round(current.blur)}
              onValueChange={(value) => setEffect({ blur: value })}
              ariaLabel={`${title} blur`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            <Field
              prefix={t("editor.props.effectSatinDistance")}
              min={0}
              max={100}
              value={Math.round(current.distance)}
              onValueChange={(value) => setEffect({ distance: value })}
              ariaLabel={`${title} distance`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            <Field
              prefix={t("editor.props.effectSatinAngle")}
              min={0}
              max={360}
              value={Math.round(current.angle)}
              onValueChange={(value) => setEffect({ angle: value })}
              ariaLabel={`${title} angle`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={current.invert}
              aria-label={t("editor.props.effectSatinInvert")}
              onChange={(event) => setEffect({ invert: event.target.checked })}
              className="flat-check"
            />
            <span className="text-[10px] font-mono text-neutral-400">
              {t("editor.props.effectSatinInvert")}
            </span>
          </div>
        </div>
      );

    case "bevel":
      return (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Field
              prefix={t("editor.props.effectDepth")}
              min={0}
              max={100}
              value={Math.round(current.depth)}
              onValueChange={(value) => setEffect({ depth: value })}
              ariaLabel={`${title} depth`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            <Field
              prefix={t("editor.props.effectSize")}
              min={0}
              max={200}
              value={Math.round(current.size)}
              onValueChange={(value) => setEffect({ size: value })}
              ariaLabel={`${title} size`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            <Field
              prefix={t("editor.props.effectAngle")}
              min={0}
              max={360}
              value={Math.round(current.angle)}
              onValueChange={(value) => setEffect({ angle: value })}
              ariaLabel={`${title} angle`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            <Field
              prefix={t("editor.props.effectSoftness")}
              min={0}
              max={100}
              value={Math.round(current.softness)}
              onValueChange={(value) => setEffect({ softness: value })}
              ariaLabel={`${title} softness`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

EffectBevelSatinControls.propTypes = {
  kind: PropTypes.string.isRequired,
  current: PropTypes.object.isRequired,
  title: PropTypes.string.isRequired,
  setEffect: PropTypes.func.isRequired,
  setAndCommit: PropTypes.func.isRequired,
  Field: PropTypes.elementType.isRequired,
  t: PropTypes.func.isRequired,
};
