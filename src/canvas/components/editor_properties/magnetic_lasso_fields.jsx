import PropTypes from "prop-types";

import { MAGNETIC_LASSO_SETTINGS } from "../../editor/magnetic_lasso.js";
import ToolSliderField from "./tool_slider_field.jsx";

const FIELDS = Object.freeze([
  ["width", "editor.magneticLasso.width"],
  ["contrast", "editor.magneticLasso.contrast"],
  ["frequency", "editor.magneticLasso.frequency"],
]);

export default function MagneticLassoFields({ t, values, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 pt-1">
      {FIELDS.map(([name, labelKey]) => {
        const definition = MAGNETIC_LASSO_SETTINGS[name];
        return (
          <ToolSliderField
            key={name}
            label={t(labelKey)}
            min={definition.min}
            max={definition.max}
            step={definition.step}
            value={values[name]}
            onValueChange={(value) => onChange(name, value)}
            ariaLabel={t(labelKey)}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        );
      })}
    </div>
  );
}

MagneticLassoFields.propTypes = {
  t: PropTypes.func.isRequired,
  values: PropTypes.shape({
    width: PropTypes.number.isRequired,
    contrast: PropTypes.number.isRequired,
    frequency: PropTypes.number.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};
