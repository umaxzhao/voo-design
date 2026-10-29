import { useCallback, useEffect, useRef, useState } from "react";
import { useDesignStore } from "../../../store/design_store.js";

/** Keep deferred selections and component-source return contexts in one session. */
export function useEditorCanvasNavigation({ focusedId, nodeIds, nodes, multi,
  engine, enginesRef, pendingCanvasSelectionRef, focusEditorPage,
  openExistingEditorPage, handleBeforeDispose, setSelectedInstanceChild,
  setCanvasBackgroundSelected }) {
  const [returnCanvasId, setReturnCanvasId] = useState(null);
  const [navigationError, setNavigationError] = useState(false);
  const returnCanvasStackRef = useRef([]);
  const pendingNavigationRef = useRef(null);
  const handleSelectCanvasLayer = useCallback(
    (canvasId, layerId) => {
      setSelectedInstanceChild(null);
      if (canvasId !== focusedId) {
        pendingCanvasSelectionRef.current.clear();
        focusEditorPage(canvasId);
        const targetEntry = enginesRef.current.get(canvasId);
        if (targetEntry?.ready && targetEntry.engine) {
          if (layerId) {
            targetEntry.engine.selectExactly([layerId]);
          } else {
            targetEntry.engine.selectBackground?.();
          }
        } else {
          pendingCanvasSelectionRef.current.set(canvasId, layerId, !layerId);
        }
      } else {
        pendingCanvasSelectionRef.current.clear();
        if (layerId) {
          engine?.selectExactly([layerId]);
        } else {
          engine?.selectBackground?.();
        }
      }
    },
    [focusedId, focusEditorPage, engine, setSelectedInstanceChild, enginesRef, pendingCanvasSelectionRef],
  );

  const handleFocusCanvas = useCallback(
    (canvasId) => {
      setSelectedInstanceChild(null);
      setCanvasBackgroundSelected(false);
      if (canvasId !== focusedId) {
        pendingCanvasSelectionRef.current.clear();
        focusEditorPage(canvasId);
        const targetEntry = enginesRef.current.get(canvasId);
        if (targetEntry?.ready && targetEntry.engine) {
          targetEntry.engine.selectBackground?.();
        } else {
          pendingCanvasSelectionRef.current.set(canvasId, null, true);
        }
      } else {
        pendingCanvasSelectionRef.current.clear();
        engine?.selectBackground?.();
      }
    },
    [focusedId, focusEditorPage, engine, setSelectedInstanceChild, setCanvasBackgroundSelected, enginesRef, pendingCanvasSelectionRef],
  );

  useEffect(() => {
    if (!focusedId) return;
    pendingCanvasSelectionRef.current.clearIfCanvasChanges(focusedId);
    const targetEntry = enginesRef.current.get(focusedId);
    if (targetEntry?.ready && targetEntry.engine) {
      pendingCanvasSelectionRef.current.consume(focusedId, targetEntry.engine);
    }
  }, [focusedId, engine, enginesRef, pendingCanvasSelectionRef]);
  const openCanvasSource = useCallback(
    (sourceId, instanceId = null) => {
      const source = useDesignStore
        .getState()
        .nodes.find(
          (candidate) =>
            candidate.id === sourceId ||
            candidate.data?.editorDoc?.canvasId === sourceId,
        );
      if (!source) {
        setNavigationError(true);
        return;
      }
      if (source.id === focusedId) return;
      const hostEngine = enginesRef.current.get(focusedId)?.engine;
      const context = {
        pageId: focusedId,
        instanceId,
        selectedIds: hostEngine?.getSelectedIds?.() ?? [],
        playback: hostEngine?.getPlaybackState?.() ?? null,
        cameraMode: multi ? "shared" : "local",
        camera: multi
          ? useDesignStore.getState().editorCamera
          : (hostEngine?.getViewport?.() ?? null),
      };
      pendingNavigationRef.current = { kind: "enter", pageId: source.id };
      const opened = nodeIds.includes(source.id)
        ? (focusEditorPage(source.id), true)
        : openExistingEditorPage(source.id);
      if (!opened) {
        pendingNavigationRef.current = null;
        setNavigationError(true);
        return;
      }
      hostEngine?.pause?.();
      returnCanvasStackRef.current.push(context);
      setReturnCanvasId(context.pageId);
      setNavigationError(false);
    },
    [focusedId, nodeIds, multi, focusEditorPage, openExistingEditorPage, enginesRef],
  );
  useEffect(() => {
    const handler = (event) =>
      openCanvasSource(
        event?.detail?.canvasId,
        event?.detail?.instanceId ?? null,
      );
    window.addEventListener?.("voo:open-canvas-source", handler);
    return () => window.removeEventListener?.("voo:open-canvas-source", handler);
  }, [openCanvasSource]);

  const returnToCanvasInstance = useCallback(() => {
    const stack = returnCanvasStackRef.current;
    const context = stack[stack.length - 1];
    if (!context) return;
    const exists = useDesignStore
      .getState()
      .nodes.some((candidate) => candidate.id === context.pageId);
    if (!exists) {
      setNavigationError(true);
      return;
    }
    pendingNavigationRef.current = { kind: "return", ...context };
    const returned = nodeIds.includes(context.pageId)
      ? (focusEditorPage(context.pageId), true)
      : openExistingEditorPage(context.pageId);
    if (!returned) {
      pendingNavigationRef.current = null;
      setNavigationError(true);
      return;
    }
    enginesRef.current.get(focusedId)?.engine?.pause?.();
    stack.pop();
    setReturnCanvasId(stack[stack.length - 1]?.pageId ?? null);
    setNavigationError(false);
  }, [focusedId, nodeIds, focusEditorPage, openExistingEditorPage, enginesRef]);
  const selectInstanceChild = useCallback(
    (selection) => {
      if (!selection) {
        setSelectedInstanceChild(null);
        return;
      }
      const hostDoc = engine?.getDocument();
      const instance = hostDoc?.nodes.find(
        (node) =>
          node.id === selection.instanceId &&
          node.kind === "canvasInstance" &&
          node.sourceCanvasId === selection.sourceCanvasId,
      );
      const source = nodes.find(
        (node) =>
          node.id === selection.sourceCanvasId ||
          node.data?.editorDoc?.canvasId === selection.sourceCanvasId,
      );
      if (!instance || !source) return;
      if (!nodeIds.includes(source.id)) {
        // A master opened from another workflow node must join this editor
        // session so its live engine participates in save and undo.
        if (nodeIds.length === 1 && enginesRef.current.get(focusedId)?.ready) {
          void handleBeforeDispose(focusedId, engine, true);
        }
        if (!openExistingEditorPage(source.id)) return;
        focusEditorPage(focusedId);
      }
      engine.selectExactly([]);
      setSelectedInstanceChild(selection);
    },
    [
      engine,
      nodes,
      nodeIds,
      focusedId,
      handleBeforeDispose,
      openExistingEditorPage,
      focusEditorPage,
      enginesRef,
      setSelectedInstanceChild,
    ],
  );

  return { returnCanvasId, navigationError, pendingNavigationRef,
    handleSelectCanvasLayer, handleFocusCanvas, openCanvasSource,
    returnToCanvasInstance, selectInstanceChild };
}
