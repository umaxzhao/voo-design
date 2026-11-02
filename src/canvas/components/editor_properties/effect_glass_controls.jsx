/** Glass effect controls: backdrop blur, tint, edge highlight and light angle. */

import PropTypes from "prop-types";
import { ColourRow } from "./effect_controls_helpers.jsx";

export default function EffectGlassControls({
  current,
  title,
  setEffect,
  setAndCommit,
  Field,
  t,
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 items-center">
        <ColourRow
          label={title}
          value={current.tint}
          fallback="#ffffff"
          onChange={(tint) => setAndCommit({ tint })}
        />
        <Field
          prefix={t("editor.props.opacity")}
          min={0}
          max={100}
          value={Math.round(current.opacity)}
          onValueChange={(opacity) => setEffect({ opacity })}
          ariaLabel={`${title} opacity`}
          scrubHint={t("editor.props.dragToAdjust")}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field
          prefix={t("editor.props.effectBlur")}
          min={0}
          max={100}
          value={Math.round(current.blur)}
          onValueChange={(blur) => setEffect({ blur })}
          ariaLabel={`${title} blur`}
          scrubHint={t("editor.props.dragToAdjust")}
        />
        <Field
          prefix={t("editor.props.effectHighlight")}
          min={0}
          max={100}
          value={Math.round(current.highlight)}
          onValueChange={(highlight) => setEffect({ highlight })}
          ariaLabel={`${title} highlight`}
          scrubHint={t("editor.props.dragToAdjust")}
        />
        <Field
          prefix={t("editor.props.effectAngle")}
          min={0}
          max={360}
          value={Math.round(current.angle)}
          onValueChange={(angle) => setEffect({ angle })}
          ariaLabel={`${title} angle`}
          scrubHint={t("editor.props.dragToAdjust")}
        />
      </div>
    </div>
  );
}

EffectGlassControls.propTypes = {
  current: PropTypes.object.isRequired,
  title: PropTypes.string.isRequired,
  setEffect: PropTypes.func.isRequired,
  setAndCommit: PropTypes.func.isRequired,
  Field: PropTypes.elementType.isRequired,
  t: PropTypes.func.isRequired,
};
