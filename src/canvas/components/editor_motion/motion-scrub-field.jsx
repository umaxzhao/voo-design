import PropTypes from "prop-types";
import ScrubField from "../scrub_field.jsx";
import { useMotionField } from "./motion-field-context.jsx";
import MotionKeyframeControls from "./motion_keyframe_controls.jsx";

export default function MotionScrubField({
  motionProperty,
  motionScale = 1,
  motionAdapter = null,
  value,
  onValueChange,
  onCommit,
  ...props
}) {
  const field = useMotionField(
    motionProperty,
    value / motionScale,
    (next) => onValueChange(next * motionScale),
    onCommit,
    motionAdapter,
  );
  const input = (
    <ScrubField
      {...props}
      className={
        field.motion
          ? `${props.className ?? ""} [&>input]:px-1 [&>input]:[appearance:textfield] [&>input::-webkit-inner-spin-button]:appearance-none [&>div>span]:pl-1 [&>span]:pr-1`
          : props.className
      }
      value={field.value * motionScale}
      onValueChange={(next) => field.onChange(next / motionScale)}
      onCommit={field.onCommit}
    />
  );
  if (!field.motion) return input;
  return (
    <div className="flex min-w-0 flex-1 items-center">
      <div className="min-w-0 flex-1">{input}</div>
      <MotionKeyframeControls property={motionProperty} motion={field.motion} />
    </div>
  );
}

MotionScrubField.propTypes = {
  className: PropTypes.string,
  motionProperty: PropTypes.string,
  motionScale: PropTypes.number,
  motionAdapter: PropTypes.shape({
    toDisplay: PropTypes.func,
    fromDisplay: PropTypes.func,
  }),
  value: PropTypes.number.isRequired,
  onValueChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
};
