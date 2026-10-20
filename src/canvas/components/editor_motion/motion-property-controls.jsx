import PropTypes from "prop-types";
import { IconDiamond } from "../../icons.jsx";
import MotionNumber, { MOTION_INPUT_CLASS } from "./motion-number.jsx";

const BUTTON_CLASS =
  "flex h-7 shrink-0 items-center justify-center rounded-lg px-2 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40";

/** One property editor for 2D layers, 3D objects, and source-backed instances. */
export default function MotionPropertyControls({
  selectedNode,
  propertyOptions,
  property,
  propertyState,
  onChooseProperty,
  onChangeValue,
  onToggleFrame,
  t,
}) {
  if (!selectedNode) return null;
  const frameLabel = t(
    propertyState?.keyframe
      ? "editor.motion.removeKeyframe"
      : "editor.motion.addKeyframe",
  );
  return (
    <div className="flex shrink-0 items-center gap-2 bg-white/[0.02] px-3 py-1">
      <span className="max-w-24 truncate text-[10px] text-neutral-400">
        {selectedNode.name || t("editor.motion.unnamedObject")}
      </span>
      <select
        data-testid="motion-property-select"
        className={`${MOTION_INPUT_CLASS} max-w-40 flex-1`}
        aria-label={t("editor.motion.property")}
        value={property}
        onChange={(event) => onChooseProperty(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {propertyOptions.map(([path, label]) => (
          <option key={path} value={path}>
            {t(label)}
          </option>
        ))}
      </select>
      {propertyState?.value !== null && propertyState?.value !== undefined ? (
        <MotionNumber
          label={t("editor.motion.currentValue")}
          value={propertyState.value}
          min={-Number.MAX_VALUE}
          max={Number.MAX_VALUE}
          step={0.1}
          onCommit={onChangeValue}
        />
      ) : null}
      <button
        type="button"
        data-testid="motion-add-keyframe"
        className={BUTTON_CLASS}
        disabled={propertyState?.value === null}
        aria-label={frameLabel}
        title={frameLabel}
        aria-pressed={Boolean(propertyState?.keyframe)}
        onClick={onToggleFrame}
      >
        <IconDiamond
          size={14}
          strokeWidth={1.5}
          fill={propertyState?.keyframe ? "currentColor" : "none"}
        />
      </button>
    </div>
  );
}

MotionPropertyControls.propTypes = {
  selectedNode: PropTypes.object,
  propertyOptions: PropTypes.array.isRequired,
  property: PropTypes.string,
  propertyState: PropTypes.object,
  onChooseProperty: PropTypes.func.isRequired,
  onChangeValue: PropTypes.func.isRequired,
  onToggleFrame: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
