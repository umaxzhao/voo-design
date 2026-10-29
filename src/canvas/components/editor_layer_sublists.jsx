import { adjustmentLabelKey } from "../editor/adjustment_catalog.js";
import EditorInstanceChildRows from "./editor_instance_child_rows.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
import { layerRowType } from "./editor_layers_contract.js";
export default function EditorLayerSublists({
  model,
  row
}) {
  const {
    resolveCanvas,
    collapsedIds,
    t,
    query,
    selectedInstanceChild,
    onSelectInstanceChild,
    labels
  } = model;
  const {
    node: object,
    depth
  } = row;
  const instanceSourceDoc = object.kind === "canvasInstance" ? resolveCanvas?.(object.sourceCanvasId) : null;
  const instanceExpandable = Boolean(instanceSourceDoc?.nodes?.length);
  const collapsed = collapsedIds.has(object.id);
  return <>                                  {Array.isArray(object.adjustments?.liveFilters) && object.adjustments.liveFilters.length > 0 ? <div
      className="ml-7 flex flex-col gap-0.5 pb-1"
      data-testid={`layer-filter-sublist-${object.id}`}
    >
      {object.adjustments.liveFilters.filter(entry => entry?.kind).map(entry => <div
        key={entry.id ?? entry.kind}
        className="flex items-center gap-1.5 rounded-md bg-white/[0.02] px-2 py-0.5 text-[10px] text-neutral-400"
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${entry.enabled === false ? "bg-neutral-600" : "bg-[#38bdf8]"}`}
        />
        <span
          className="min-w-0 flex-1 truncate"
        >
          {t(adjustmentLabelKey(entry.kind))}
        </span>
        {entry.mask ? <span
          className="text-[9px] font-mono text-[#a7ffd4]"
          title={t("editor.liveFilters.maskFromSelection")}
        >
                                                M
                                              </span> : null}
      </div>)}
    </div> : null}
    {instanceExpandable && (!collapsed || query) ? <EditorInstanceChildRows
      instanceNode={object}
      sourceDoc={instanceSourceDoc}
      selectedInstanceChild={selectedInstanceChild}
      onSelectInstanceChild={onSelectInstanceChild}
      labels={labels}
      query={query}
      depth={depth}
    /> : null}</>;
}
if (import.meta.env.DEV) {
EditorLayerSublists.propTypes = {
  model: layerPanelModelType.isRequired,
  row: layerRowType.isRequired
};
}
