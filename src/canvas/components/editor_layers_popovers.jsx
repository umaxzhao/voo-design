import AddKindPicker from "./editor_properties/add_kind_picker.jsx";
import AdjustmentPopover from "./editor_properties/adjustment_popover.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
export default function EditorLayersPopovers({
  model
}) {
  const {
    newAdjustmentPicker,
    setNewAdjustmentPicker,
    onAddAdjustmentLayer,
    swapSide,
    popoverNode,
    popover,
    getBitmap,
    onMutate,
    onCommit,
    setPopover,
    addKind,
    applyPreset
  } = model;
  return <>      {newAdjustmentPicker ? <AddKindPicker
      isImage={true}
      showEffects={false}
      onPick={kind => {
        setNewAdjustmentPicker(false);
        onAddAdjustmentLayer?.(kind);
      }}
      onClose={() => setNewAdjustmentPicker(false)}
      side={swapSide ? "right" : "left"}
    /> : null}
    {popoverNode && popover ? popover.kind ? <AdjustmentPopover
      node={popoverNode}
      kind={popover.kind}
      isEffect={popover.isEffect}
      bitmap={getBitmap?.(popoverNode) ?? null}
      onMutate={onMutate}
      onCommit={onCommit}
      onClose={() => setPopover(null)}
      side={swapSide ? "right" : "left"}
    /> : <AddKindPicker
      isImage={popoverNode.kind === "image"}
      bitmap={getBitmap?.(popoverNode) ?? null}
      imageKey={popoverNode.imageId ?? popoverNode.src ?? null}
      adjustments={popoverNode.adjustments ?? null}
      onPick={(kind, isEffect) => addKind(popoverNode.id, kind, isEffect)}
      onApplyPreset={preset => applyPreset(popoverNode.id, preset)}
      onClose={() => setPopover(null)}
      side={swapSide ? "right" : "left"}
    /> : null}</>;
}
if (import.meta.env.DEV) {
EditorLayersPopovers.propTypes = {
  model: layerPanelModelType.isRequired
};
}
