import { createPortal } from "react-dom";
import { canConvertToPath, convertShapeToPathNode } from "../editor/scene_model.js";
import { layerPanelModelType } from "./editor_layers_contract.js";
const RASTERIZABLE_NODE_KINDS = new Set(["image", "text", "rect", "ellipse", "path", "boolean", "group"]);
export default function EditorLayerContextMenu({
  model
}) {
  const {
    contextMenu,
    setContextMenu,
    cancelRenameRef,
    setRenamingId,
    t,
    onToggleLock,
    onDuplicateLayer,
    onLayerToFront,
    onLayerToBack,
    onRasterize,
    onConvertToPath,
    onMutate,
    onCommit,
    onDeleteSelected,
    selectedIds,
    onRemove
  } = model;
  return <>      {contextMenu ? createPortal(<>
      <div
        className="fixed inset-0 z-50"
        onMouseDown={event => {
          event.stopPropagation();
          setContextMenu(null);
        }}
        onContextMenu={event => {
          event.preventDefault();
          setContextMenu(null);
        }}
      />
      <div
        role="menu"
        className="fixed z-50 w-40 rounded-xl border border-white/10 bg-neutral-900 p-1 font-mono text-[11px] text-neutral-200 shadow-menu"
        style={{
          left: contextMenu.x,
          top: contextMenu.y
        }}
        onMouseDown={event => event.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            cancelRenameRef.current = false;
            setRenamingId(contextMenu.object.id);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {t("editor.layer.rename")}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onToggleLock?.(contextMenu.index);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {t(contextMenu.object.locked ? "editor.unlock" : "editor.lock")}
        </button>
        <div
          className="my-1 h-px bg-white/10"
        />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDuplicateLayer?.(contextMenu.index);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {t("editor.menu.duplicate")}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onLayerToFront?.(contextMenu.index);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {t("editor.menu.bringToFront")}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onLayerToBack?.(contextMenu.index);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {t("editor.menu.sendToBack")}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!RASTERIZABLE_NODE_KINDS.has(contextMenu.object.kind)}
          onClick={() => {
            if (RASTERIZABLE_NODE_KINDS.has(contextMenu.object.kind)) onRasterize?.(contextMenu.index);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
        >
          {t("editor.menu.rasterize")}
        </button>
        {canConvertToPath(contextMenu.object) ? <button
          type="button"
          role="menuitem"
          onClick={() => {
            if (onConvertToPath) {
              onConvertToPath(contextMenu.object.id);
            } else if (onMutate) {
              const converted = convertShapeToPathNode(contextMenu.object);
              if (converted) {
                onMutate(contextMenu.object.id, converted);
                onCommit?.("editor.history.entry.convertToPath");
              }
            }
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {t("editor.menu.convertToPath")}
        </button> : null}
        <div
          className="my-1 h-px bg-white/10"
        />
        <button
          type="button"
          role="menuitem"
          disabled={Boolean(contextMenu.object.locked)}
          onClick={() => {
            if (!contextMenu.object.locked) {
              if (onDeleteSelected && selectedIds.includes(contextMenu.object.id)) {
                onDeleteSelected();
              } else {
                onRemove(contextMenu.index);
              }
            }
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-rose-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-30"
        >
          {t("node.delete")}
        </button>
      </div>
    </>, document.body) : null}</>;
}
if (import.meta.env.DEV) {
EditorLayerContextMenu.propTypes = {
  model: layerPanelModelType.isRequired
};
}
