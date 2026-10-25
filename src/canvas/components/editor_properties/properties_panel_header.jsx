/** Header bar for EditorProperties panel: title, tool identity, mask, motion, and side-dock controls. */

import { EDITOR_BETA_ENABLED } from "../../editor-beta-features.js";
import PropTypes from "prop-types";
import {
  IconSwap,
  IconMask,
  IconMotion,
  IconBrush,
  IconEraser,
  IconText,
  IconCrop,
  IconVectorSquare,
  IconPipette,
  IconBucket,
  IconSelectionRect,
} from "../../icons.jsx";
import { TOOL } from "../../editor/editor_constants.js";
import EditorTooltip from "../editor_tooltip.jsx";

export function activateMaskAction(hasMask, maskActions) {
  if (hasMask) {
    maskActions?.onEditToggle?.();
  } else {
    maskActions?.onAddMask?.();
  }
}

function getToolHeaderInfo(tool, t, marqueeMode = "rect") {
  if (!tool || tool === TOOL.SELECT) return null;

  switch (tool) {
    case TOOL.BRUSH:
      return { label: t("editor.tool.brush"), icon: <IconBrush size={12} className="text-neutral-300" /> };
    case TOOL.ERASER:
      return { label: t("editor.tool.eraser"), icon: <IconEraser size={12} className="text-neutral-300" /> };
    case TOOL.HEALING:
      return { label: t("editor.tool.healing"), icon: <IconBrush size={12} className="text-neutral-300" /> };
    case TOOL.BLUR:
    case TOOL.SHARPEN:
    case TOOL.SMUDGE:
    case TOOL.DODGE:
    case TOOL.BURN:
    case TOOL.SPONGE:
      return { label: t(`editor.tool.${tool}`), icon: <IconBrush size={12} className="text-neutral-300" /> };
    case TOOL.PEN:
    case TOOL.CURVATURE_PEN:
    case TOOL.FREE_PEN:
      return { label: t("editor.tool.pen"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.TEXT:
      return { label: t("editor.tool.text"), icon: <IconText size={12} className="text-neutral-300" /> };
    case TOOL.CROP:
      return { label: t("editor.tool.crop"), icon: <IconCrop size={12} className="text-neutral-300" /> };
    case TOOL.DROPPER:
      return { label: t("editor.tool.dropper"), icon: <IconPipette size={12} className="text-neutral-300" /> };
    case TOOL.FILL:
    case TOOL.GRADIENT:
      return { label: t(`editor.tool.${tool}`), icon: <IconBucket size={12} className="text-neutral-300" /> };
    case TOOL.REGION:
      return { label: t("editor.tool.region"), icon: <IconSelectionRect size={12} className="text-neutral-300" /> };
    case TOOL.WAND:
      return { label: t("editor.selection.wand"), icon: <IconSelectionRect size={12} className="text-neutral-300" /> };
    case TOOL.MARQUEE:
    case TOOL.LASSO: {
      const mode = tool === TOOL.LASSO ? "lasso" : marqueeMode;
      const key = mode === "magnetic" ? "magneticLasso" : mode;
      return { label: t(`editor.selection.${key}`), icon: <IconSelectionRect size={12} className="text-neutral-300" /> };
    }
    case TOOL.RECT:
    case TOOL.ELLIPSE:
    case TOOL.POLYGON:
    case TOOL.STAR:
    case TOOL.LINE:
    case TOOL.ARROW:
      return { label: t("editor.shape.title"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    default:
      return null;
  }
}

export default function PropertiesPanelHeader({
  tool = null,
  marqueeMode = "rect",
  isToolActive = false,
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
  const toolInfo = isToolActive ? getToolHeaderInfo(tool, t, marqueeMode) : null;

  return (
    <div className="flex items-center justify-between px-2 pb-2.5 pt-1 border-b border-white/10 mb-2 select-none">
      <div className="flex items-center gap-1.5 min-w-0">
        {toolInfo ? (
          <div className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-mono text-neutral-100 ring-1 ring-white/10 truncate">
            {toolInfo.icon}
            <span className="font-semibold text-white truncate">{toolInfo.label}</span>
          </div>
        ) : (
          <h2 className="text-[11px] font-mono tracking-wider text-neutral-400 font-medium uppercase truncate">
            {t("editor.properties")}
          </h2>
        )}
      </div>
      <div className="flex items-center gap-1">
        {showMaskBtn ? (
          <EditorTooltip
            title={hasMask ? t("editor.mask.edit") : t("editor.mask.create")}
            side="bottom"
          >
            <button
              type="button"
              onClick={() => activateMaskAction(hasMask, maskActions)}
              disabled={maskBusy}
              aria-label={
                hasMask ? t("editor.mask.edit") : t("editor.mask.create")
              }
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                maskEditing || hasMask
                  ? "bg-white/10 text-white"
                  : "text-neutral-400 hover:bg-white/10 hover:text-white"
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
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a7ffd4] ${
                motionOpen
                  ? "bg-white/10 text-neutral-200 hover:bg-white/20"
                  : "text-neutral-400 hover:bg-white/10 hover:text-white"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
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
  tool: PropTypes.string,
  marqueeMode: PropTypes.string,
  isToolActive: PropTypes.bool,
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
