import PropTypes from "prop-types";
import {
  ANIMATION_PRESETS,
  applyAnimationPreset,
} from "../../editor/animation_presets.js";
import { InspectorGroup } from "./three-inspector.jsx";

/**
 * One-click animation presets for the selected object (Spline's Modifiers).
 * Each writes normal keyframes, so the timeline shows and edits the result.
 */
export default function ThreeModifiersGroup({
  node,
  duration,
  onPatchNode,
  onCommit,
  t,
  titleKey = "editor.three.modifiers",
  defaultOpen = false,
  testId = "editor-three-modifiers-group",
}) {
  return (
    <InspectorGroup
      title={t(titleKey)}
      defaultOpen={defaultOpen}
      testId={testId}
    >
      <div className="grid grid-cols-2 gap-1">
        {ANIMATION_PRESETS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            data-testid={`editor-three-preset-${id}`}
            className="h-7 truncate rounded-lg bg-neutral-800 px-2 text-left text-[11px] text-neutral-300 transition-colors hover:bg-neutral-800/80 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            onClick={() => {
              const next = applyAnimationPreset(node, id, duration);
              onPatchNode?.(node.id, { animations: next.animations });
              onCommit?.();
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </InspectorGroup>
  );
}

ThreeModifiersGroup.propTypes = {
  node: PropTypes.object.isRequired,
  duration: PropTypes.number.isRequired,
  onPatchNode: PropTypes.func,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
  titleKey: PropTypes.string,
  defaultOpen: PropTypes.bool,
  testId: PropTypes.string,
};
