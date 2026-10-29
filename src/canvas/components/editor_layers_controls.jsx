import ScrubField from "./scrub_field.jsx";
import FlatSelect from "./flat_select.jsx";
import { DEFAULT_BLEND_MODE, BLEND_MODES } from "../editor/scene_model_core.js";
import { layerPanelModelType } from "./editor_layers_contract.js";
export default function EditorLayersControls({
  model
}) {
  const {
    opacityPct,
    activeObject,
    edit,
    commitNow,
    t,
    editAndCommit,
    blendModeLabelKey
  } = model;
  return <div
    className="flex flex-row-reverse items-center gap-2 mb-2 border-b border-white/[0.08] pb-2 [&>*:first-child]:w-20 [&>*:last-child]:min-w-0 [&>*:last-child]:flex-1"
  >
    <ScrubField
      suffix="%"
      min={0}
      max={100}
      value={opacityPct}
      onValueChange={value => activeObject && edit({
        opacity: value / 100
      })}
      onCommit={commitNow}
      ariaLabel={t("editor.props.opacity")}
      scrubHint={t("editor.props.dragToAdjust")}
      disabled={!activeObject}
      className="layers-opacity-control"
    />
    <FlatSelect
      value={activeObject?.blendMode ?? DEFAULT_BLEND_MODE}
      disabled={!activeObject}
      onChange={value => editAndCommit({
        blendMode: value
      })}
      label={t("editor.props.blendMode")}
      options={BLEND_MODES.map(mode => ({
        value: mode,
        label: t(blendModeLabelKey(mode))
      }))}
      triggerClassName="!h-7 !w-full !rounded-xl !bg-white/[0.06] !px-2.5 !text-[11px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      widthClass="w-44"
    />
  </div>;
}
if (import.meta.env.DEV) {
EditorLayersControls.propTypes = {
  model: layerPanelModelType.isRequired
};
}
