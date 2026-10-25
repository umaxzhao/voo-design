/** Header bar for EditorProperties panel: title, tool identity, mask, inspect and side-dock controls. */

import PropTypes from "prop-types";
import { useState } from "react";
import {
  IconCode,
  IconSwap,
  IconMask,
  IconBrush,
  IconEraser,
  IconText,
  IconCrop,
  IconVectorSquare,
  IconPipette,
  IconBucket,
  IconSelectionRect,
  IconFrame,
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

function getToolHeaderInfo(tool, t, marqueeMode = "rect", brushMode = "normal", healingMode = "aiRepair") {
  if (!tool || tool === TOOL.SELECT) return null;

  switch (tool) {
    case TOOL.BRUSH:
      return {
        label:
          brushMode === "normal"
            ? t("editor.tool.brush")
            : t(`editor.brushMode.${brushMode}`),
        icon: <IconBrush size={12} className="text-neutral-300" />,
      };
    case TOOL.ERASER:
      return { label: t("editor.tool.eraser"), icon: <IconEraser size={12} className="text-neutral-300" /> };
    case TOOL.HEALING: {
      const healingLabelKey =
        healingMode === "spot"
          ? "editor.tool.spotHealing"
          : healingMode === "patch"
            ? "editor.tool.patch"
            : healingMode === "clone"
              ? "editor.tool.clone"
              : "editor.tool.aiRepair";
      return {
        label: t(healingLabelKey),
        icon: <IconBrush size={12} className="text-neutral-300" />,
      };
    }
    case TOOL.BLUR:
    case TOOL.SHARPEN:
    case TOOL.SMUDGE:
    case TOOL.DODGE:
    case TOOL.BURN:
    case TOOL.SPONGE:
      return { label: t(`editor.tool.${tool}`), icon: <IconBrush size={12} className="text-neutral-300" /> };
    case TOOL.PEN:
      return { label: t("editor.tool.pen"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.CURVATURE_PEN:
      return { label: t("editor.tool.curvaturePen"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.FREE_PEN:
      return { label: t("editor.tool.freePen"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
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
      return { label: t("editor.tool.rect"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.ELLIPSE:
      return { label: t("editor.tool.ellipse"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.POLYGON:
      return { label: t("editor.tool.polygon"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.STAR:
      return { label: t("editor.tool.star"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.LINE:
      return { label: t("editor.tool.line"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    case TOOL.ARROW:
      return { label: t("editor.tool.arrow"), icon: <IconVectorSquare size={12} className="text-neutral-300" /> };
    default:
      return null;
  }
}

export default function PropertiesPanelHeader({
  tool = null,
  marqueeMode = "rect",
  brushMode = "normal",
  healingMode = "aiRepair",
  isToolActive = false,
  showMaskBtn,
  hasMask,
  maskActions,
  maskBusy,
  maskEditing,
  onToggleSide,
  inspectOpen = false,
  showInspect = false,
  onToggleInspect = null,
  object = null,
  selectionCount = 1,
  onRename = null,
  t,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const toolInfo = isToolActive
    ? getToolHeaderInfo(tool, t, marqueeMode, brushMode, healingMode)
    : null;
  const nodeHeader = !toolInfo && object ? objectHeader(object, selectionCount) : null;

  function objectHeader(node, count) {
    const kind = node.isFrame || node.kind === "frame" ? "frame" : node.kind;
    const typeKey = `editor.nodeType.${kind}`;
    const icon =
      kind === "frame" ? <IconFrame size={12} className="text-neutral-300" /> :
      kind === "text" ? <IconText size={12} className="text-neutral-300" /> :
      kind === "group" ? <IconFrame size={12} className="text-neutral-300" /> :
      kind === "image" ? <IconBrush size={12} className="text-neutral-300" /> :
      <IconVectorSquare size={12} className="text-neutral-300" />;
    const name = node.name || node.kind;
    const commit = () => {
      setEditing(false);
      const next = draft.trim();
      if (next && next !== name) onRename?.(next);
    };
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">{icon}</span>
        {count > 1 ? (
          <span className="truncate text-[11px] font-mono text-neutral-200">
            {t("editor.props.multiSelected", { count })}
          </span>
        ) : editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setEditing(false);
            }}
            aria-label={t("editor.props.layerName")}
            className="min-w-0 flex-1 border-b border-white/20 bg-transparent text-[11px] font-mono text-neutral-100 outline-none"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => {
              setDraft(name);
              setEditing(true);
            }}
            title={t("editor.props.renameHint")}
            className="min-w-0 truncate text-left text-[11px] font-mono text-neutral-200 transition-colors hover:text-white"
          >
            {name}
          </button>
        )}
        {count > 1 ? null : (
          <span className="shrink-0 text-[9px] font-mono uppercase tracking-wide text-neutral-500">
            {t(typeKey) === typeKey ? kind : t(typeKey)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-2 pb-2.5 pt-1 border-b border-white/10 mb-2 select-none">
      <div className="flex items-center gap-1.5 min-w-0">
        {toolInfo ? (
          <div className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-mono text-neutral-100 ring-1 ring-white/10 truncate">
            {toolInfo.icon}
            <span className="font-semibold text-white truncate">{toolInfo.label}</span>
          </div>
        ) : nodeHeader ? (
          nodeHeader
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
        {showInspect ? (
          <EditorTooltip title={t("editor.inspect.title")} side="bottom">
            <button
              type="button"
              onClick={onToggleInspect}
              title={t("editor.inspect.title")}
              aria-label={t("editor.inspect.title")}
              aria-pressed={inspectOpen}
              data-testid="editor-inspect-trigger"
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                inspectOpen
                  ? "bg-white/10 text-neutral-100 hover:bg-white/20"
                  : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <IconCode size={13} />
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
  onToggleSide: PropTypes.func,
  inspectOpen: PropTypes.bool,
  showInspect: PropTypes.bool,
  onToggleInspect: PropTypes.func,
  t: PropTypes.func.isRequired,
};
