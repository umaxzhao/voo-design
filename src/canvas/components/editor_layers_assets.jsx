import { IconFrame } from "../icons.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
export default function EditorLayersAssets({
  model
}) {
  const {
    assetNodes,
    onSelectExactly,
    objects,
    onSelect,
    t
  } = model;
  return <div
    className="min-h-0 flex-1 overflow-y-auto"
  >
    {assetNodes.length ? <div
      className="grid grid-cols-2 gap-2"
    >
      {assetNodes.map(({
        node,
        preview
      }) => <button
        key={node.id}
        type="button"
        onClick={() => {
          if (onSelectExactly) onSelectExactly([node.id]);else {
            const index = objects.findIndex(entry => entry.id === node.id);
            if (index >= 0) onSelect(index);
          }
        }}
        className="group min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-1.5 text-left transition-colors hover:bg-white/[0.06]"
      >
        <span
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-neutral-900"
        >
          {preview ? <img
            src={preview}
            alt=""
            className="h-full w-full object-contain"
          /> : <IconFrame
            size={18}
            className="text-neutral-500"
          />}
        </span>
        <span
          className="mt-1 block truncate text-[10px] text-neutral-300"
        >
          {node.name || node.kind}
        </span>
      </button>)}
    </div> : <p
      className="px-1 py-3 text-[10px] leading-4 text-neutral-400"
    >
      {t("editor.assets.empty")}
    </p>}
  </div>;
}
if (import.meta.env.DEV) {
EditorLayersAssets.propTypes = {
  model: layerPanelModelType.isRequired
};
}
