import { useMemo } from "react";
import { useI18n } from "../use_i18n.js";
import { editorLayerLabels } from "./editor_layer_labels.js";
import useEditorLayersState from "./use_editor_layers_state.js";
import buildEditorLayerTree from "./editor_layer_tree_model.js";
import useEditorLayerInteractions from "./use_editor_layer_interactions.js";
export default function useEditorLayersController(props) {
  const {
    t
  } = useI18n();
  const labels = editorLayerLabels(t);
  const state = useEditorLayersState(props);
  const tree = buildEditorLayerTree({
    ...props,
    ...state,
    labels,
    t
  });
  const model = {
    ...props,
    ...state,
    ...tree,
    labels,
    t
  };
  const interactions = useEditorLayerInteractions(model);
  const {
    objects,
    getBitmap
  } = props;
  const {
    query
  } = state;
  const assetNodes = useMemo(() => (Array.isArray(objects) ? objects : []).filter(node => ["image", "video", "model3d"].includes(node?.kind)).filter(node => {
    if (!query) return true;
    const name = String(node?.name ?? node?.kind ?? "").toLowerCase();
    return name.includes(query);
  }).map(node => ({
    node,
    preview: node?.fill && /^(?:data:|blob:|https?:)/i.test(node.fill) ? node.fill : node?.src ?? node?.url ?? node?.dataUrl ?? getBitmap?.(node)?.src ?? null
  })), [objects, query, getBitmap]);
  return {
    ...model,
    ...interactions,
    assetNodes
  };
}
