import EditorTooltip from "./editor_tooltip.jsx";
import { IconFolder, IconMask, ICON_STROKE_WIDTH, IconTrash } from "../icons.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
export default function EditorLayersFooter({
  model
}) {
  const {
    selectedIds,
    t,
    canGroupSelected,
    onGroupSelected,
    canCombineSelected,
    onCombineSelected,
    onAddMask,
    activeObject,
    setNewAdjustmentPicker,
    onAddLayer,
    maskEdit,
    onRemoveMask,
    onDeleteSelected,
    activeIndex,
    onRemove
  } = model;
  return <div
    className="flex items-center justify-between border-t border-white/10 pt-2 mt-2 px-1"
  >
    <div
      className="flex items-center gap-1"
    >
      {selectedIds.length > 1 ? <>
        {/* Group Selected Layers button */}
        <EditorTooltip
          title={t("editor.layers.groupSelected")}
          side="top"
          disabled={!canGroupSelected}
        >
          <button
            type="button"
            onClick={() => onGroupSelected?.()}
            disabled={!canGroupSelected}
            aria-label={t("editor.layers.groupSelected")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <IconFolder
              size={13}
            />
          </button>
        </EditorTooltip>
        {/* Merge / Combine Selected Layers button */}
        <EditorTooltip
          title={t("editor.layers.mergeSelected")}
          side="top"
          disabled={!canCombineSelected && !canGroupSelected}
        >
          <button
            type="button"
            onClick={() => {
              if (onCombineSelected) {
                onCombineSelected("union");
              }
            }}
            disabled={!canCombineSelected}
            aria-label={t("editor.layers.mergeSelected")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect
                x="2"
                y="6"
                width="13"
                height="13"
                rx="2"
              />
              <path
                d="M9 18h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H9"
              />
            </svg>
          </button>
        </EditorTooltip>
      </> : <>
        {/* Add Layer Mask button */}
        <EditorTooltip
          title={t("editor.props.mask")}
          side="top"
        >
          <button
            type="button"
            onClick={() => onAddMask?.()}
            disabled={!activeObject || Boolean(activeObject.locked)}
            aria-label={t("editor.props.mask")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <IconMask
              size={13}
              strokeWidth={ICON_STROKE_WIDTH}
            />
          </button>
        </EditorTooltip>
        {/* New Adjustment Layer button */}
        <EditorTooltip
          title={t("editor.layers.addAdjustment")}
          side="top"
        >
          <button
            type="button"
            onClick={() => setNewAdjustmentPicker(open => !open)}
            aria-label={t("editor.layers.addAdjustment")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 3a9 9 0 0 1 0 18V3z"
                fill="currentColor"
              />
            </svg>
          </button>
        </EditorTooltip>
      </>}
      {/* Create New Layer button */}
      <EditorTooltip
        title={t("editor.layer.new")}
        side="top"
      >
        <button
          type="button"
          onClick={() => onAddLayer?.()}
          aria-label={t("editor.layer.new")}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline
              points="14 2 14 8 20 8"
            />
          </svg>
        </button>
      </EditorTooltip>
    </div>
    {/* Unified Delete Selected Layer(s) button */}
    <EditorTooltip
      title={maskEdit?.nodeId ? t("editor.mask.delete") : t("node.delete")}
      side="top"
      disabled={!maskEdit?.nodeId && selectedIds.length === 0 && (!activeObject || Boolean(activeObject.locked))}
    >
      <button
        type="button"
        onClick={() => {
          if (maskEdit?.nodeId) {
            if (onRemoveMask) {
              onRemoveMask(maskEdit.nodeId);
            } else if (onDeleteSelected) {
              onDeleteSelected();
            }
          } else if (onDeleteSelected) {
            onDeleteSelected();
          } else if (activeObject && !activeObject.locked && activeIndex >= 0) {
            onRemove(activeIndex);
          }
        }}
        disabled={!maskEdit?.nodeId && selectedIds.length === 0 && (!activeObject || Boolean(activeObject.locked))}
        aria-label={maskEdit?.nodeId ? t("editor.mask.delete") : t("node.delete")}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
      >
        <IconTrash
          size={13}
        />
      </button>
    </EditorTooltip>
  </div>;
}
if (import.meta.env.DEV) {
EditorLayersFooter.propTypes = {
  model: layerPanelModelType.isRequired
};
}
