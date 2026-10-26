/** Texture effect controls: tint, grain opacity/density, scale and seed. */

import PropTypes from "prop-types";
import { ColourRow } from "./effect_controls_helpers.jsx";

export default function EffectTextureControls({
  current,
  title,
  setEffect,
  setAndCommit,
  Field,
  t,
}) {
  return (
    <div className="flex flex-col gap-2">
      <ColourRow
        label={title}
        value={current.color}
        fallback="#808080"
        onChange={(color) => setAndCommit({ color })}
      />
      <div className="grid grid-cols-3 gap-2">
        <Field
          prefix={t("editor.props.opacity")}
          min={0}
          max={100}
          value={Math.round((current.opacity ?? 0) * 100)}
          onValueChange={(value) => setEffect({ opacity: value / 100 })}
          ariaLabel={`${title} opacity`}
          scrubHint={t("editor.props.dragToAdjust")}
        />
        <Field
          prefix={t("editor.props.noiseDensity")}
          min={0}
          max={100}
          value={Math.round((current.density ?? 0) * 100)}
          onValueChange={(value) => setEffect({ density: value / 100 })}
          ariaLabel={`${title} density`}
          scrubHint={t("editor.props.dragToAdjust")}
        />
        <Field
          prefix={t("editor.props.noiseSize")}
          min={1}
          max={12}
          value={Math.round(current.size ?? 2)}
          onValueChange={(size) => setEffect({ size })}
          ariaLabel={`${title} size`}
          scrubHint={t("editor.props.dragToAdjust")}
        />
      </div>
    </div>
  );
}

EffectTextureControls.propTypes = {
  current: PropTypes.object.isRequired,
  title: PropTypes.string.isRequired,
  setEffect: PropTypes.func.isRequired,
  setAndCommit: PropTypes.func.isRequired,
  Field: PropTypes.elementType.isRequired,
  t: PropTypes.func.isRequired,
};
