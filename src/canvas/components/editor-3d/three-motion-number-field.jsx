import PropTypes from "prop-types";
import { useMotionField } from "../editor_motion/motion-field-context.jsx";
import MotionKeyframeControls from "../editor_motion/motion_keyframe_controls.jsx";
import { NumberField } from "./three-scene-fields.jsx";

/** Keep the numeric editor and timeline diamond on one property row. */
export default function ThreeMotionNumberField({ property, ...fieldProps }) {
  const motionField = useMotionField(
    property,
    fieldProps.value,
    fieldProps.onChange,
    fieldProps.onCommit,
  );
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">
        <NumberField
          {...fieldProps}
          value={motionField.value}
          onChange={motionField.onChange}
          onCommit={motionField.onCommit}
        />
      </div>
      <MotionKeyframeControls property={property} motion={motionField.motion} />
    </div>
  );
}

ThreeMotionNumberField.propTypes = {
  property: PropTypes.string.isRequired,
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
};
