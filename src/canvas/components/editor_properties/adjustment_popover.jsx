import PropTypes from "prop-types";
import { useEffect } from "react";
import {
  normalizeAdjustments,
  normalizeEffects,
} from "../../editor/scene_model.js";
import {
  adjustmentLabelKey,
  effectLabelKey,
  starterAdjustment,
  starterEffect,
} from "../../editor/adjustment_catalog.js";
import { useI18n } from "../../use_i18n.js";
import { usePropertyCommit } from "./use_property_commit.js";
import AdjustmentControls from "./adjustment_controls.jsx";
import EffectControls from "./effect_controls.jsx";
import { IconEye, IconEyeOff } from "../../icons.jsx";

/**
 * The Figma-style floating editor for one adjustment or effect kind, opened
 * from the layers panel. A transparent backdrop swallows outside clicks so it
 * closes like the other popovers; the card itself floats beside the layers
 * panel. Edits go through the shared write path (live mutate, one history
 * snapshot per burst).
 */
export default function AdjustmentPopover({
  node,
  kind,
  isEffect = false,
  bitmap = null,
  onMutate,
  onCommit,
  onClose,
  side = "left",
}) {
  const { t } = useI18n();
  const { edit, editAndCommit, commitNow } = usePropertyCommit({
    onMutate: (patch) => onMutate?.(node.id, patch),
    onCommit,
  });

  const title = t(isEffect ? effectLabelKey(kind) : adjustmentLabelKey(kind));
  const adjusted = isEffect ? null : normalizeAdjustments(node.adjustments);
  const effects = isEffect ? (normalizeEffects(node.effects) ?? {}) : null;

  // Determine enabled state for current kind
  const isEnabled = isEffect
    ? Boolean(effects?.[kind]?.enabled)
    : adjusted?.[kind]?.enabled !== false;

  const toggleEnabled = () => {
    if (isEffect) {
      const current = effects?.[kind] ?? starterEffect(kind);
      editAndCommit({
        effects: {
          ...(node.effects ?? {}),
          [kind]: { ...current, enabled: !isEnabled },
        },
      });
    } else {
      const current = adjusted?.[kind] ?? starterAdjustment(kind);
      editAndCommit({
        adjustments: {
          ...(node.adjustments ?? {}),
          [kind]: { ...current, enabled: !isEnabled },
        },
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-transparent"
        aria-label={t("editor.popover.close")}
        onClick={onClose}
      />
      <div
        className={`absolute top-1/2 -translate-y-1/2 z-50 w-80 max-w-[calc(100vw-32px)] rounded-3xl bg-neutral-900 border border-white/10 p-4 shadow-panel font-mono text-neutral-200 ${
          side === "right" ? "right-full mr-3" : "left-full ml-3"
        } max-md:fixed max-md:left-1/2 max-md:top-1/2 max-md:-translate-x-1/2 max-md:m-0`}
      >
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5 px-0.5">
          <span className="text-[12px] font-medium font-mono text-neutral-100 uppercase tracking-wider">
            {title}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleEnabled}
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                isEnabled
                  ? "text-neutral-300 hover:bg-white/10 hover:text-white"
                  : "text-neutral-500 hover:bg-white/10 hover:text-neutral-400"
              }`}
              title={t(isEnabled ? "editor.hide" : "editor.show")}
              aria-label={t(isEnabled ? "editor.hide" : "editor.show")}
            >
              {isEnabled ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white transition-colors text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
              aria-label={t("editor.popover.close")}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="no-scrollbar max-h-[65vh] overflow-y-auto">
          {isEffect ? (
            <EffectControls
              kind={kind}
              effects={effects}
              rawEffects={node.effects}
              edit={edit}
              editAndCommit={editAndCommit}
              commitNow={commitNow}
              t={t}
            />
          ) : (
            <AdjustmentControls
              kind={kind}
              adjustments={adjusted}
              edit={edit}
              editAndCommit={editAndCommit}
              commitNow={commitNow}
              bitmap={bitmap}
              t={t}
            />
          )}
        </div>
      </div>
    </>
  );
}

AdjustmentPopover.propTypes = {
  node: PropTypes.object.isRequired,
  kind: PropTypes.string.isRequired,
  isEffect: PropTypes.bool,
  /** The adjusted layer's bitmap: the levels/curves histogram source. */
  bitmap: PropTypes.object,
  onMutate: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  side: PropTypes.oneOf(["left", "right"]),
};
