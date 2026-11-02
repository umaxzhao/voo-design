import { isGroupNode, isBooleanNode, describeNode } from "../editor/scene_model.js";
import { OperationIcon } from "./editor_properties/combine_section.jsx";
import { IconFrame, IconFolder, IconLayoutGrid } from "../icons.jsx";
import EditorLayerThumb, { MaskThumb } from "./editor_layer_thumb.jsx";
import LayerAssetReload from "./editor_layer_asset_reload.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
import { layerRowType } from "./editor_layers_contract.js";
export default function EditorLayerThumbnail({
  model,
  row
}) {
  const {
    maskEdit,
    onEndMaskEdit,
    pickRow,
    labels,
    getBitmap,
    onSelect,
    onBeginMaskEdit,
    t,
    getNodeMask
  } = model;
  const {
    node: object,
    index
  } = row;
  const grouped = isGroupNode(object) || isBooleanNode(object);
  const isBoolean = isBooleanNode(object);
  return <div
    className="flex items-center gap-1 shrink-0"
    data-no-drag
    onPointerDown={e => e.stopPropagation()}
  >
    <button
      type="button"
      data-no-drag
      onClick={event => {
        event.stopPropagation();
        if (maskEdit?.nodeId === object.id) {
          onEndMaskEdit?.();
        }
        pickRow(object, index, event);
      }}
      aria-label={describeNode(object, index, labels)}
      className="shrink-0"
    >
      {grouped ? <span
        className="flex h-5 w-7 items-center justify-center text-neutral-400"
      >
        {isBoolean ? <OperationIcon
          operation={object.operation ?? "union"}
        /> : object.section ? <IconLayoutGrid
          size={13}
        /> : object.frame || object.isFrame || object.containerType === "frame" ? <IconFrame
          size={13}
        /> : <IconFolder
          size={13}
        />}
      </span> : <EditorLayerThumb
        object={object}
        getBitmap={getBitmap}
      />}
    </button>
    {!grouped && object.imageId ? <LayerAssetReload
      assetKey={object.imageId}
    /> : null}
    {/* Photoshop-style side-by-side Mask thumbnail */}
    {object.maskId ? <button
      type="button"
      data-no-drag
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        onSelect(index);
        if (maskEdit?.nodeId === object.id) {
          onEndMaskEdit?.();
        } else {
          onBeginMaskEdit?.(object.id);
        }
      }}
      title={maskEdit?.nodeId === object.id ? t("editor.mask.editingHint") : t("editor.props.mask")}
      className={`shrink-0 cursor-pointer overflow-hidden rounded-md border transition-all ${maskEdit?.nodeId === object.id ? "border-[#E5B2FF] ring-2 ring-[#E5B2FF] shadow-[0_0_8px_rgba(229,178,255,0.4)]" : "border-white/10 hover:border-[#E5B2FF]/80"}`}
    >
      <MaskThumb
        object={object}
        getNodeMask={getNodeMask}
        className="h-5 w-7"
      />
    </button> : null}
  </div>;
}
if (import.meta.env.DEV) {
EditorLayerThumbnail.propTypes = {
  model: layerPanelModelType.isRequired,
  row: layerRowType.isRequired
};
}
