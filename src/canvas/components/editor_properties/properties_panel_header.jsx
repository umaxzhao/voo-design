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

function getToolHeaderInfo(tool, t) {
  if (!tool || tool === TOOL.SELECT) return null;

  switch (tool) {
    case TOOL.BRUSH:
      return { label: t("editor.tool.brush") || "画笔工具", icon: <IconBrush size={12} className="text-[#a7ffd4]" /> };
    case TOOL.ERASER:
      return { label: t("editor.tool.eraser") || "橡皮擦工具", icon: <IconEraser size={12} className="text-[#a7ffd4]" /> };
    case TOOL.HEALING:
      return { label: t("editor.tool.healing") || "修复工具", icon: <IconBrush size={12} className="text-[#a7ffd4]" /> };
    case TOOL.BLUR:
    case TOOL.SHARPEN:
    case TOOL.SMUDGE:
    case TOOL.DODGE:
    case TOOL.BURN:
    case TOOL.SPONGE:
      return { label: t(`editor.tool.${tool}`) || "修饰工具", icon: <IconBrush size={12} className="text-[#a7ffd4]" /> };
    case TOOL.PEN:
    case TOOL.CURVATURE_PEN:
    case TOOL.FREE_PEN:
      return { label: t("editor.tool.pen") || "钢笔工具", icon: <IconVectorSquare size={12} className="text-[#a7ffd4]" /> };
    case TOOL.TEXT:
      return { label: t("editor.tool.text") || "文字工具", icon: <IconText size={12} className="text-[#a7ffd4]" /> };
    case TOOL.CROP:
      return { label: t("editor.tool.crop") || "裁切工具", icon: <IconCrop size={12} className="text-[#a7ffd4]" /> };
    case TOOL.DROPPER:
      return { label: t("editor.tool.dropper") || "吸管工具", icon: <IconPipette size={12} className="text-[#a7ffd4]" /> };
    case TOOL.FILL:
    case TOOL.GRADIENT:
      return { label: t(`editor.tool.${tool}`) || "填充渐变", icon: <IconBucket size={12} className="text-[#a7ffd4]" /> };
    case TOOL.MARQUEE:
    case TOOL.LASSO:
    case TOOL.WAND:
    case TOOL.REGION:
      return { label: t("editor.tool.selection") || "选区工具", icon: <IconSelectionRect size={12} className="text-[#a7ffd4]" /> };
    case TOOL.RECT:
    case TOOL.ELLIPSE:
    case TOOL.POLYGON:
    case TOOL.STAR:
    case TOOL.LINE:
    case TOOL.ARROW:
      return { label: t("editor.shape.title") || "形状工具", icon: <IconVectorSquare size={12} className="text-[#a7ffd4]" /> };
    default:
      return null;
  }
}

export default function PropertiesPanelHeader({
  tool = null,
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
  const toolInfo = isToolActive ? getToolHeaderInfo(tool, t) : null;

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
                  ? "bg-[#E5B2FF]/10 text-[#E5B2FF] hover:bg-[#E5B2FF]/20"
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
