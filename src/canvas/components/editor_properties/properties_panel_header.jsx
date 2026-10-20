/** Header bar for EditorProperties panel: title, mask, motion, and side-dock controls. */

import { EDITOR_BETA_ENABLED } from "../../editor-beta-features.js";
import PropTypes from "prop-types";
import { IconSwap, IconMask, IconMotion } from "../../icons.jsx";
import EditorTooltip from "../editor_tooltip.jsx";

export default function PropertiesPanelHeader({
  showMaskBtn,
  hasMask,
  maskActions,
  maskBusy,
  maskEditing,
  onToggleMotion,
  motionTriggerRef,
  motionOpen,
  onToggleSide,
  t,
}) {
  return (
    <div className="flex items-center justify-between px-2 pb-2.5 pt-1 border-b border-white/10 mb-2 select-none">
      <h2 className="text-[11px] font-mono tracking-wider text-neutral-400 font-medium uppercase truncate">
        {t("editor.properties")}
      </h2>
      <div className="flex items-center gap-1">
        {showMaskBtn ? (
          <EditorTooltip
            title={hasMask ? t("editor.mask.edit") : t("editor.mask.create")}
            side="bottom"
          >
            <button
              type="button"
              onClick={() => {
                if (maskActions?.onAddMask) {
                  maskActions.onAddMask();
                } else {
                  maskActions?.onEditToggle?.();
                }
              }}
              disabled={maskBusy}
              aria-label={
                hasMask ? t("editor.mask.edit") : t("editor.mask.create")
              }
              className={`rounded-full p-1 transition-colors ${
                maskEditing || hasMask
                  ? "text-neutral-200 hover:bg-[#262626] hover:text-white"
                  : "text-neutral-500 hover:bg-[#262626] hover:text-neutral-300"
              }`}
            >
              <IconMask size={13} />
            </button>
          </EditorTooltip>
        ) : null}
        {EDITOR_BETA_ENABLED && onToggleMotion ? (
          <EditorTooltip title={t("editor.motion.title")} side="bottom">
            <button
              ref={motionTriggerRef}
              type="button"
              onClick={onToggleMotion}
              title={t("editor.motion.title")}
              aria-label={t("editor.motion.title")}
              aria-controls="editor-motion-timeline"
              aria-expanded={motionOpen}
              aria-pressed={motionOpen}
              data-testid="editor-motion-trigger"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a7ffd4] ${
                motionOpen
                  ? "bg-[#E5B2FF]/10 text-[#E5B2FF] hover:bg-[#E5B2FF]/20"
                  : "text-neutral-500 hover:bg-[#262626] hover:text-neutral-300"
              }`}
            >
              <IconMotion size={13} />
            </button>
          </EditorTooltip>
        ) : null}
        {onToggleSide ? (
          <EditorTooltip title={t("editor.pages.toggleAxis")} side="bottom">
            <button
              type="button"
              onClick={onToggleSide}
              aria-label={t("editor.pages.toggleAxis")}
              className="rounded-full p-1 text-neutral-400 transition-colors hover:bg-[#262626] hover:text-white"
            >
              <IconSwap size={13} />
            </button>
          </EditorTooltip>
        ) : null}
      </div>
    </div>
  );
}

PropertiesPanelHeader.propTypes = {
  showMaskBtn: PropTypes.bool,
  hasMask: PropTypes.bool,
  maskActions: PropTypes.object,
  maskBusy: PropTypes.bool,
  maskEditing: PropTypes.object,
  onToggleMotion: PropTypes.func,
  motionTriggerRef: PropTypes.object,
  motionOpen: PropTypes.bool,
  onToggleSide: PropTypes.func,
  t: PropTypes.func.isRequired,
};
