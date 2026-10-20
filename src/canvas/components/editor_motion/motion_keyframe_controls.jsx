import { EDITOR_BETA_ENABLED } from "../../editor-beta-features.js";
import PropTypes from "prop-types";
import { IconDiamond } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";

/** Inline beside the original property field; never duplicates its value. */
export default function MotionKeyframeControls({
  property,
  motion,
  className = "",
}) {
  const { t } = useI18n();
  if (!EDITOR_BETA_ENABLED || !motion) return null;
  const label = t(
    motion.active
      ? "editor.motion.removeKeyframe"
      : "editor.motion.addKeyframe",
  );
  return (
    <button
      type="button"
      data-testid={`motion-keyframe-${property}`}
      aria-label={label}
      title={label}
      aria-pressed={motion.active}
      className={`flex h-7 w-6 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${motion.animated ? "text-[#E5B2FF]" : "text-neutral-500 hover:text-neutral-200"} ${className}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        motion.toggle();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <IconDiamond
        size={12}
        strokeWidth={1.5}
        fill={motion.active ? "currentColor" : "none"}
      />
    </button>
  );
}

MotionKeyframeControls.propTypes = {
  property: PropTypes.string.isRequired,
  className: PropTypes.string,
  motion: PropTypes.shape({
    active: PropTypes.bool,
    animated: PropTypes.bool,
    toggle: PropTypes.func,
  }),
};
