import { describeNode } from "../editor/scene_model.js";
import { handleLayerRenameKeyDown } from "./editor_layer_rename.js";
import { layerPanelModelType } from "./editor_layers_contract.js";
import { layerRowType } from "./editor_layers_contract.js";
export default function EditorLayerName({
  model,
  row
}) {
  const {
    renamingId,
    t,
    labels,
    cancelRenameRef,
    commitRename,
    pickRow,
    onOpenCanvasInstance,
    setRenamingId
  } = model;
  const {
    node: object,
    index
  } = row;
  return <>                                      {renamingId === object.id ? <input
      ref={el => {
        el?.focus();
        el?.select();
      }}
      defaultValue={typeof object.name === "string" ? object.name : ""}
      aria-label={t("editor.layer.rename")}
      placeholder={describeNode({
        ...object,
        name: undefined
      }, index, labels)}
      data-no-drag
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => handleLayerRenameKeyDown(event, cancelRenameRef)}
      onBlur={event => commitRename(index, event.target.value)}
      className="min-w-0 flex-1 h-5 rounded-lg bg-neutral-800 px-1.5 py-0 text-left text-[11px] font-mono leading-5 text-neutral-100 outline-none ring-1 ring-inset ring-white/10"
    /> : <button
      type="button"
      onClick={event => pickRow(object, index, event)}
      onDoubleClick={() => {
        if (object.kind === "canvasInstance") {
          onOpenCanvasInstance?.(object.sourceCanvasId);
          return;
        }
        cancelRenameRef.current = false;
        setRenamingId(object.id);
      }}
      title={t("editor.layer.rename")}
      className={`flex min-w-0 flex-1 items-center gap-1.5 h-5 overflow-x-auto whitespace-nowrap text-left text-[11px] font-mono leading-5 no-scrollbar ${object.visible ? "text-neutral-200" : "text-neutral-500"}`}
    >
      <span
        className="w-max min-w-full whitespace-nowrap"
      >
        {describeNode(object, index, labels)}
      </span>
    </button>}</>;
}
if (import.meta.env.DEV) {
EditorLayerName.propTypes = {
  model: layerPanelModelType.isRequired,
  row: layerRowType.isRequired
};
}
