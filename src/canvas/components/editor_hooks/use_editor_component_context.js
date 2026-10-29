import { useCallback, useEffect, useMemo } from "react";
import { countInstances } from "../../editor/component_extract.js";
import { getCanvasType } from "../../editor/canvas-composition-model.js";
import { useDesignStore } from "../../../store/design_store.js";

/** Resolve live component documents before snapshots and track nested selections. */
export function useEditorComponentContext({
  doc, nodes, nodeIds, focusedId, selected, selectedInstanceChild,
  setSelectedInstanceChild, enginesRef, snapshotsRef, pageTitle,
}) {
  const resolveCanvas = useCallback((sourceId) => {
    for (const entry of enginesRef.current.values()) {
      const component = entry?.engine?.getDocument?.()?.components?.[sourceId];
      if (component) return component;
    }
    const fromLive = enginesRef.current.get(sourceId)?.engine?.getDocument?.();
    if (fromLive) return fromLive;
    for (const entry of enginesRef.current.values()) {
      const doc = entry?.engine?.getDocument?.();
      if (doc && (doc.canvasId === sourceId || doc.id === sourceId)) {
        return doc;
      }
    }
    const fromSnapshot = snapshotsRef.current.get(sourceId)?.doc;
    if (fromSnapshot) return fromSnapshot;
    for (const snap of snapshotsRef.current.values()) {
      if (snap?.doc?.canvasId === sourceId || snap?.doc?.id === sourceId) {
        return snap.doc;
      }
    }
    const state = useDesignStore.getState();
    const source = state.nodes.find(
      (candidate) =>
        candidate.id === sourceId ||
        candidate.data?.editorDoc?.canvasId === sourceId,
    );
    return source?.data?.editorDoc ?? null;
  }, [enginesRef, snapshotsRef]);
  const nestedInstance = selectedInstanceChild
    ? doc?.nodes.find(
        (node) =>
          node.id === selectedInstanceChild.instanceId &&
          node.kind === "canvasInstance" &&
          node.sourceCanvasId === selectedInstanceChild.sourceCanvasId,
      )
    : null;
  const nestedSourcePageId = nestedInstance
    ? nodes.find(
        (node) =>
          node.id === nestedInstance.sourceCanvasId ||
          node.data?.editorDoc?.canvasId === nestedInstance.sourceCanvasId,
      )?.id
    : null;
  const nestedEngineState = nestedSourcePageId
    ? enginesRef.current.get(nestedSourcePageId)
    : null;
  const nestedEngine = nestedEngineState?.ready
    ? nestedEngineState.engine
    : null;
  const nestedDoc = nestedInstance
    ? (nestedEngine?.getDocument() ??
      resolveCanvas(nestedInstance.sourceCanvasId))
    : null;
  const nestedNodeIds = useMemo(
    () =>
      Array.isArray(selectedInstanceChild?.nodeIds) &&
      selectedInstanceChild.nodeIds.length > 0
        ? selectedInstanceChild.nodeIds
        : selectedInstanceChild?.nodeId
          ? [selectedInstanceChild.nodeId]
          : [],
    [selectedInstanceChild?.nodeId, selectedInstanceChild?.nodeIds],
  );
  const nestedNode = nestedDoc?.nodes.find(
    (node) => node.id === nestedNodeIds[0],
  );
  const nestedNodes = (nestedDoc?.nodes ?? []).filter((node) =>
    nestedNodeIds.includes(node.id),
  );
  const instanceSources = (doc?.nodes ?? [])
    .filter((node) => node.kind === "canvasInstance")
    .map((node) => ({
      instanceId: node.id,
      sourceCanvasId: node.sourceCanvasId,
      doc: resolveCanvas(node.sourceCanvasId),
    }))
    .filter((entry) => entry.doc);
  useEffect(() => {
    if (!selectedInstanceChild || !nestedEngine || nestedNodes.length === 0)
      return;
    const currentSelected = nestedEngine.getSelectedIds?.() ?? [];
    const isSame =
      currentSelected.length === nestedNodeIds.length &&
      nestedNodeIds.every((id) => currentSelected.includes(id));
    if (!isSame) {
      nestedEngine.selectExactly(nestedNodeIds);
    }
  }, [selectedInstanceChild, nestedEngine, nestedNodes, nestedNodeIds]);
  useEffect(() => {
    setSelectedInstanceChild(null);
  }, [focusedId, setSelectedInstanceChild]);
  useEffect(() => {
    if (selected?.id) setSelectedInstanceChild(null);
  }, [selected?.id, setSelectedInstanceChild]);
  const instanceCounts = countInstances(nodeIds.map((id) => resolveCanvas(id)));
  const usesOfPage = (id) =>
    instanceCounts.get(resolveCanvas(id)?.canvasId) ?? 0;
  const canvasPages = nodeIds.map((id, index) => {
    const pageDoc = resolveCanvas(id);
    const pageEngine = enginesRef.current.get(id)?.engine;
    const uses = usesOfPage(id);
    return {
      id,
      title: pageTitle(id, index),
      isCanvasRoot: pageDoc?.isCanvasRoot === true,
      type: pageDoc ? getCanvasType(pageDoc) : "design",
      nodes: pageDoc?.nodes ?? [],
      selectedIds: pageEngine?.getSelectedIds?.() ?? [],
      selectedGroupId: pageEngine?.getSelectedGroup?.()?.id ?? null,
      isComponent: Boolean(pageDoc?.isComponent || uses > 0),
      componentUses: uses,
    };
  });

  return { resolveCanvas, nestedEngine, nestedDoc, nestedNode, instanceSources, instanceCounts, usesOfPage, canvasPages };
}
