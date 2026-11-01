import { useCallback, useEffect, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { useEditorEngine } from "../../use_editor_engine.js";
import { useSkiaPage } from "../../use_skia_page.js";
import { collectExternalImageLayers } from "../../editor_open_state.js";
import { TOOL } from "../../editor/editor_constants.js";
import { effectivePage } from "../../editor/scene_model.js";
import { getCanvasType } from "../../editor/canvas-composition-model.js";
import { confirmCanvasDelete } from "../../editor/doc_ops_canvas.js";
import { skiaRendererEnabled } from "../../editor/renderer_flag.js";
import { requiresCanvas2dMediaFallback } from "../../editor/skia_scene_adapter.js";
import { buildEditorSource } from "../editor_page_source.js";

/** Keep engine activation, notifications, ingestion and renderer ownership together. */
export function useEditorPageEngine({ props, refs, free, t }) {
  const { nodeId, snapshot, readOnly, active, onChange, onBeforeDispose,
    onGeneratedOutput, getFitInsets, onDeleteCanvas,
    onEngine, sharedZoom } = props;
  const { canvasRef, stageRef, skiaCanvasRef } = refs;
  // Held in a ref so the dispose callback can read the latest readiness
  // without re-creating the engine every time it changes.
  const readyRef = useRef(false);
  const beforeDispose = useCallback(
    (engine) => onBeforeDispose(nodeId, engine, readyRef.current),
    [nodeId, onBeforeDispose],
  );

  const {
    engine,
    ready,
    error,
    retry,
    tool,
    doc,
    selected,
    selectedIds,
    editingTextId,
    editingRegionId,
  } = useEditorEngine({
    registerCommands: !readOnly,
    canvasRef,
    stageRef,
    // The engine captures this factory only when activating/retrying a page;
    // ordinary snapshot/image-cache changes must preserve its live document.
    getSource: () => buildEditorSource(nodeId, snapshot),
    active,
    onChange,
    onBeforeDispose: beforeDispose,
    onGeneratedOutput,
    sourceWorkflowNodeId: nodeId,
    cameraMode: free ? "shared" : "page",
    getFitInsets,
  });
  const brushWidth = engine?.getBrushWidth?.() ?? 24;
  useEffect(() => {
    if (tool === TOOL.BRUSH || tool === TOOL.ERASER) {
      engine?.refreshBrushCursor?.();
    }
  }, [engine, tool, brushWidth]);
  const canvasType = doc
    ? getCanvasType(doc)
    : snapshot?.canvasType ||
      (snapshot?.doc ? getCanvasType(snapshot.doc) : "design");
  const hasCanvasInstances = doc?.nodes.some(
    (node) => node.kind === "canvasInstance",
  );
  const mixedLayers = Boolean(doc) && canvasType !== "3d" && hasCanvasInstances;

  useEffect(() => {
    if (!engine?.setStagePaintingEnabled) return undefined;
    // Free pages paint through their visible workspace compositor. The detached
    // measurement canvas is drawn only when an explicit pixel readback needs it.
    engine.setStagePaintingEnabled(!free || mixedLayers);
    return () => engine.setStagePaintingEnabled(true);
  }, [engine, free, mixedLayers]);

  useEffect(() => {
    if (!engine) return undefined;
    engine.setMixedLayerMode(mixedLayers);
    return () => engine.setMixedLayerMode(false);
  }, [engine, mixedLayers]);

  // Mixed pages need the same Canvas2D passes as the engine's document frame.
  const skiaEnabled =
    !mixedLayers &&
    skiaRendererEnabled() &&
    !requiresCanvas2dMediaFallback(doc);

  // Asset ids handed to the engine but not yet in its document. Decoding is
  // async, so without this a second store tick would see the same layer still
  // missing and add it a second time.
  const ingestingRef = useRef(new Set());

  /**
   * Folds pictures the store ingests *after* this page opened into the live
   * document.
   *
   * The document is built once per activation (see buildEditorSource), so an
   * agent generation landing in the document the user is working in — the
   * store writes it onto `data.editorDoc` — would otherwise be invisible until
   * a close-and-reopen, and an apply would flatten the document without it.
   * Additive: only layers this page does not already carry are added, so work
   * in progress is never discarded. Nothing is added while the page is still
   * opening: the document under construction is not the one to extend.
   */
  useEffect(() => {
    if (!ready || !engine) return undefined;
    const ingesting = ingestingRef.current;
    const settle = (layers) => {
      for (const layer of layers) ingesting.delete(layer.imageId);
    };
    return useDesignStore.subscribe((state) => {
      const node = state.nodes.find((candidate) => candidate.id === nodeId);
      const live = engine.getDocument();
      const knownLayers = (live?.nodes ?? [])
        .filter((layer) => layer.imageId)
        .map((layer) => ({ id: layer.id, imageId: layer.imageId }));
      const layers = collectExternalImageLayers(
        node?.data?.editorDoc,
        [...knownLayers, ...ingesting],
        state.images,
      );
      if (layers.length === 0) return;
      for (const layer of layers) ingesting.add(layer.imageId);
      engine.appendImageLayers(layers).then(
        (receipt) => {
          settle(layers);
          // A layer that could not be decoded is reported instead of vanishing:
          // the editor would otherwise show a document missing a picture the
          // node says it has.
          if (receipt.skipped.length > 0) {
            console.warn("Editor layer ingestion skipped", receipt.skipped);
          }
        },
        (error) => {
          settle(layers);
          console.error("Editor layer ingestion failed", error);
        },
      );
    });
  }, [ready, engine, nodeId]);

  // Only a page that finished opening can answer whether it has been changed:
  // until then the engine holds a blank placeholder document and no applied
  // snapshot to compare against, so it would call itself modified.
  readyRef.current = ready;
  const dirty = ready && (engine?.isDirty() ?? false);
  useEffect(() => {
    const handleDeleteRequest = (event) => {
      if (event.detail?.nodeId !== nodeId || !onDeleteCanvas) return;
      const canDelete = confirmCanvasDelete({
        isDirty: dirty,
        confirmFn:
          typeof window !== "undefined" && typeof window.confirm === "function"
            ? (message) => window.confirm(message)
            : null,
        message: t("editor.pages.confirmDeleteDirty"),
      });
      if (canDelete) onDeleteCanvas(nodeId);
    };
    window.addEventListener("editor:request-delete-canvas", handleDeleteRequest);
    return () =>
      window.removeEventListener("editor:request-delete-canvas", handleDeleteRequest);
  }, [dirty, nodeId, onDeleteCanvas, t]);

  useEffect(() => {
    const page = doc ? effectivePage(doc) : null;
    onEngine(nodeId, {
      engine,
      ready,
      dirty,
      width: ready ? (page?.width ?? 0) : 0,
      height: ready ? (page?.height ?? 0) : 0,
    });
  }, [nodeId, engine, ready, dirty, doc, onEngine]);

  // In a shared free canvas the page box is positioned by the parent camera,
  // so this engine only mirrors the shared zoom (pan stays 0). Guarded so a
  // re-render never rewrites an already-matching viewport — setViewport
  // notifies, which would otherwise loop.
  useEffect(() => {
    if (!free || !engine) return undefined;
    const vp = engine.getViewport();
    if (vp.zoom !== sharedZoom || vp.panX !== 0 || vp.panY !== 0) {
      engine.setViewport({ zoom: sharedZoom, panX: 0, panY: 0 });
    }
    return undefined;
  }, [free, engine, sharedZoom]);

  // A counter rather than the document itself: the engine mutates in place,
  // so identity would never change and the renderer would never be told.
  const revisionRef = useRef(0);
  revisionRef.current += 1;
  const { status: skiaStatus } = useSkiaPage({
    enabled: skiaEnabled && !free,
    engine,
    doc,
    canvasRef: skiaCanvasRef,
    stageRef,
    revision: revisionRef.current,
  });

  const skiaPainting = skiaEnabled && !free && skiaStatus === "ready";
  const viewport = free
    ? { zoom: sharedZoom ?? 1, panX: 0, panY: 0 }
    : (engine?.getViewport() ?? { zoom: 1, panX: 0, panY: 0 });
  return { engine, ready, error, retry, tool, doc, selected, selectedIds,
    editingTextId, editingRegionId, canvasType, mixedLayers, skiaEnabled,
    skiaStatus, skiaPainting, viewport };
}
