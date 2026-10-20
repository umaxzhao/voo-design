import { EDITOR_BETA_ENABLED } from "../editor-beta-features.js";
import { layoutCanvasSize } from "../layout_geometry.js";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EditorCanvasPresets from "./editor_canvas_presets.jsx";
import EditorCanvasTypeSelect, {
  CANVAS_TYPE_TONES,
} from "./editor_canvas_type_select.jsx";
import {
  EDITOR_PAGE_HEADER_INSET,
  EDITOR_PAGE_TOOLBAR_GAP,
} from "./editor_panel_layout.js";
import EditorRegionLabel from "./editor_region_label.jsx";
import EditorObject3dGizmo from "./editor_object3d_gizmo.jsx";
import { instanceSnapshotUrl } from "../editor/instance-snapshot.js";
import EditorPageTitle from "./editor_page_title.jsx";
import EditorResizeHandles from "./editor_resize_handles.jsx";
import EditorTextOverlay from "./editor_text_overlay.jsx";
import EditorOutpaintOverlay from "./editor_outpaint_overlay.jsx";
import EditorContextualTaskBar from "./editor_contextual_taskbar.jsx";
import StreamingLayoutPreview from "./streaming_layout_preview.jsx";
import LoadingModal from "./loading_modal.jsx";
import { readImageRgba } from "./bitmap_pixels.js";
import { IconAdd, IconExpand, IconFrame, IconTrash } from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { effectivePage } from "../editor/scene_model.js";
import { CANVAS_TYPE } from "../editor/scene_doc_factory.js";
import { getCanvasType } from "../editor/canvas-composition-model.js";
import { setInstanceCamera } from "../editor/instance-view.js";
import {
  changeEngineCanvasType,
  confirmCanvasDelete,
} from "../editor/doc_ops_canvas.js";
import { patchThreeSceneNode } from "../editor/three-scene-node-patch.js";
import { patchThreeScene } from "../editor/three-scene-patch.js";
import { readCurrentThreeSceneDocument } from "./editor-3d/three-scene-document.js";
import { docToScreenRect } from "../editor/scene_renderer.js";
import { collectImageInputs } from "../engine/graph.js";
import { useEditorEngine } from "../use_editor_engine.js";
import { collectExternalImageLayers } from "../editor_open_state.js";
import { useSkiaPage } from "../use_skia_page.js";
import { skiaRendererEnabled } from "../editor/renderer_flag.js";
import { requiresCanvas2dMediaFallback } from "../editor/skia_scene_adapter.js";
import { useI18n } from "../use_i18n.js";
import { useWorkflowStore } from "../store/workflow_store.js";
import {
  computeSaliencyMap,
  SALIENCY_ANALYSIS_MAX_EDGE,
} from "../editor/saliency_map.js";
import { suggestOutpaintPlan } from "../editor/outpaint_direction.js";
import {
  mediaAssetIdsInSource,
  withHydratedMediaSources,
} from "./editor_motion/editor_media_source.js";

const EditorMixedLayers = lazy(() => import("./editor_mixed_layers.jsx"));
const ThreeSceneViewport = lazy(
  () => import("./editor-3d/three-scene-viewport.jsx"),
);
const ThreeSceneFocusStage = lazy(
  () => import("./editor-3d/three-scene-focus-stage.jsx"),
);

/**
 * The saliency-driven default direction for the outpaint overlay, or null.
 *
 * The DOM read lives here, in the component zone; the pure planner in
 * `editor/outpaint_direction.js` only ever sees the decoded weights. Every
 * failure — no bitmap, a throw from the reader, an image with no usable signal
 * — collapses to null, which is what keeps the overlay's node-frame default
 * exactly as it was before saliency existed.
 */
function suggestOutpaintPlanForNode(engine, node) {
  const bitmap = engine?.getNodeBitmap?.(node) ?? null;
  if (!bitmap) return null;
  const width = node?.width;
  const height = node?.height;
  if (!(width > 0) || !(height > 0)) return null;
  try {
    const {
      rgba,
      width: analysisWidth,
      height: analysisHeight,
    } = readImageRgba(bitmap, { maxEdge: SALIENCY_ANALYSIS_MAX_EDGE });
    const saliency = computeSaliencyMap({
      rgba,
      width: analysisWidth,
      height: analysisHeight,
    });
    return suggestOutpaintPlan({ saliency, width, height });
  } catch {
    return null;
  }
}

/**
 * Real-time HUD preview of brush size & hardness in the center of the canvas viewport
 * whenever the user adjusts the brush or eraser slider/scrub field.
 */
function BrushPreviewOverlay({ engine, viewport }) {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);
  const brushWidth = engine?.getBrushWidth?.() ?? 24;
  const brushHardness = engine?.getBrushHardness?.() ?? 0.5;
  const prevRef = useRef({ width: brushWidth, hardness: brushHardness });

  useEffect(() => {
    if (
      prevRef.current.width !== brushWidth ||
      prevRef.current.hardness !== brushHardness
    ) {
      prevRef.current = { width: brushWidth, hardness: brushHardness };
      setVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
      }, 1200);
    }
  }, [brushWidth, brushHardness]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  if (!visible) return null;

  const zoom = viewport?.zoom ?? 1;
  const screenDiameter = Math.max(4, Math.round(brushWidth * zoom));
  const blurPx = Math.round((1 - brushHardness) * (screenDiameter / 4));

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative rounded-full border border-white/80 shadow-pop transition-all duration-75"
          style={{
            width: `${screenDiameter}px`,
            height: `${screenDiameter}px`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full bg-white/10"
            style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : "none" }}
          />
        </div>
        <div className="rounded-full bg-black/75 px-2.5 py-0.5 text-[10px] font-mono tabular-nums text-white shadow-pop backdrop-blur">
          {brushWidth}px · {Math.round(brushHardness * 100)}%
        </div>
      </div>
    </div>
  );
}

BrushPreviewOverlay.propTypes = {
  engine: PropTypes.object,
  viewport: PropTypes.object,
};

/**
 * Builds what the engine opens for one node: its own picture as the base layer
 * plus anything wired into its IMAGE input.
 *
 * Read imperatively rather than subscribed: the images map turns over with
 * every generated result, and re-opening the document mid-edit would discard
 * work in progress. A snapshot from a page that was evicted wins over the
 * node's saved document, so scrolling away and back resumes where the user
 * left off instead of reverting to the last applied state.
 */
function buildEditorSource(nodeId, snapshot) {
  const { nodes, edges, images } = useWorkflowStore.getState();
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const ownImageId = node?.data?.imageId ?? null;
  const connectedLayers = collectImageInputs(nodeId, nodes, edges)
    .filter((entry) => entry.imageId && entry.imageId !== ownImageId)
    .map((entry) => ({
      src: images[entry.imageId] ?? null,
      imageId: entry.imageId,
    }));
  const layoutWidth = node?.data?.layoutWidth;
  const layoutHeight = node?.data?.layoutHeight;
  const hasPinnedSize =
    Number.isFinite(layoutWidth) &&
    layoutWidth > 0 &&
    Number.isFinite(layoutHeight) &&
    layoutHeight > 0;
  const snapshotDoc =
    snapshot && typeof snapshot === "object" && "doc" in snapshot
      ? snapshot.doc
      : snapshot;
  const appliedDoc =
    snapshot && typeof snapshot === "object" && "appliedDoc" in snapshot
      ? snapshot.appliedDoc
      : null;
  return {
    src: ownImageId ? (images[ownImageId] ?? null) : null,
    imageId: ownImageId,
    savedDoc: snapshotDoc ?? node?.data?.editorDoc ?? null,
    appliedDoc: appliedDoc ?? null,
    previewDirty: Boolean(node?.data?.editorPreviewDirty),
    extraLayers: connectedLayers,
    // Apply media defaults only to empty pages. A non-null fallback pins the
    // engine canvas and would otherwise override decoded image dimensions.
    fallbackSize:
      hasPinnedSize || (!ownImageId && connectedLayers.length === 0)
        ? layoutCanvasSize(node?.data)
        : null,
  };
}

/**
 * One artboard of the editor.
 *
 * Two shapes:
 *  - `mode="full"` — a single picture: its own stage fills the editor, no page
 *    chrome, the long-standing behaviour.
 *  - `mode="free"` — an artboard on a shared free canvas. The parent owns one
 *    camera for every page; it hands this page the screen-space `rect` (already
 *    transformed by that camera) and the page's engine only mirrors the shared
 *    zoom in its own viewport (pan stays 0 — the box position is the camera's
 *    job). Only the focused artboard shows handles and text overlays.
 */
/**
 * Colours for the frame header icon circle matching the frame's canvas type.
 * Unifies with CANVAS_TYPE_TONES in editor_canvas_type_select.jsx.
 */
export const FRAME_TYPE_ICON_TONES = CANVAS_TYPE_TONES;

export default function EditorPage({
  readOnly = false,
  nodeId,
  title,
  focused,
  active,
  mode,
  rect = null,
  sharedZoom = 1,
  snapshot = null,
  onFocus,
  onEngine,
  onBeforeDispose,
  onChange,
  onGeneratedOutput,
  onVisibility,
  onRegionCutout = null,
  onAddPoint = null,
  onRepaint = null,
  onRepaintNode = null,
  onRepaintSelection = null,
  /** Outpaint submit: (node, grownRect) — the parent runs the model. */
  onOutpaintSubmit = null,
  onAddCanvas = null,
  onDeleteCanvas = null,
  isLast = true,
  cutoutBusy = false,
  repaintBusy = false,
  onAutoMask = null,
  autoMaskBusy = false,
  onAutoEnhance = null,
  onPortraitRetouch = null,
  portraitRetouchBusy = false,
  onSplitLayers = null,
  splitLayersBusy = false,
  onUpscale = null,
  upscaleBusy = false,
  onAddAdjustmentLayer = null,
  onApplyPreset = null,
  getBitmap = null,
  onEditSvg = null,
  onCreateComponent = null,
  onDetachInstance = null,
  /** How many instances use this page as their main component. */
  componentUses = 0,
  /** (nodeId, name) => void: renames this frame; omit to make it fixed. */
  onRenamePage = null,
  /** Pointer handlers for the title label drag-to-pan handle, or null. */
  titlePanHandlers = null,
  pageTitleActions = null,
  resolveCanvas = null,
  selectedInstanceChild = null,
  onSelectInstanceChild = null,
  onOpenCanvasSource = null,
  adjustingInstanceId = null,
  onAdjustView = null,
  onFinishAdjustView = null,
  onCancelAdjustView = null,
  onCanvasTypeChanged = null,
  streamingLayout = null,
  /** Gizmo mode for a 3D page, controlled by the editor's 3D toolbar. */
  threeToolMode = null,
  onThreeToolMode = null,
  /** (stageWidth) => { left, right }: stage the fit keeps clear. */
  getFitInsets = null,
}) {
  const { t } = useI18n();
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  // The page header; the contextual taskbar keeps clear of it.
  const titleRef = useRef(null);
  // Skia paints onto its own canvas so the engine keeps the 2D one it
  // measures text against and sizes from the stage.
  const skiaCanvasRef = useRef(null);

  const free = mode === "free";

  const setEditorArtboardLayout = useWorkflowStore(
    (state) => state.setEditorArtboardLayout,
  );
  const moveEditorArtboard = useWorkflowStore(
    (state) => state.moveEditorArtboard,
  );
  // Holds the pending doc-space position to persist when the resize commits.
  const resizePositionRef = useRef(null);

  // In free mode (cameraMode=shared) the engine's viewport pan compensation is
  // skipped, so the artboard box position on screen is determined entirely by
  // the parent layout rect. When the user drags the top or left edge we must
  // also shift the artboard's rendered position so the opposite edge stays
  // fixed — exactly what Figma does. Strategy:
  //   1. At drag-start: capture doc-space position and immediately pin it via
  //      setEditorArtboardLayout so freeLayouts auto-centring doesn't fire.
  //   2. Per-move: update rootRef DOM directly (skips React re-render) and
  //      accumulate the position delta for top/left edges.
  //   3. On commit: persist via moveEditorArtboard to make it permanent.
  const handleResizeDragStart = useCallback(
    (_edges) => {
      if (!free || !rect || !sharedZoom) return undefined;
      const z = sharedZoom;
      let pinnedX = rect.x / z;
      let pinnedY = rect.y / z;
      let pinnedW = rect.width / z;
      let pinnedH = rect.height / z;
      // Pin immediately to prevent auto-centering during the drag.
      setEditorArtboardLayout(nodeId, {
        x: Math.round(pinnedX),
        y: Math.round(pinnedY),
        width: Math.round(pinnedW),
        height: Math.round(pinnedH),
      });
      resizePositionRef.current = { x: pinnedX, y: pinnedY };

      // grownW / grownH: how much the page grew in document units. Growing
      // from the top or left moves the page's origin by that amount; growing
      // from the centre (Alt) moves it by half.
      return (movedEdges, grownW, grownH, fromCentre) => {
        if (fromCentre) {
          pinnedX -= grownW / 2;
          pinnedY -= grownH / 2;
        } else {
          if (movedEdges.top) pinnedY -= grownH;
          if (movedEdges.left) pinnedX -= grownW;
        }
        resizePositionRef.current = { x: pinnedX, y: pinnedY };
        // Update DOM directly to avoid React re-render latency.
        const el = rootRef.current;
        if (el) {
          el.style.left = `${pinnedX * z}px`;
          el.style.top = `${pinnedY * z}px`;
        }
      };
    },
    [free, rect, sharedZoom, nodeId, rootRef, setEditorArtboardLayout],
  );

  // The layer being outpainted, while its grow-frame gesture is active.
  const [renaming, setRenaming] = useState(false);
  const [stageFocus, setStageFocus] = useState(false);
  // Double-clicking the header renames the frame, except on its own controls.
  const startRename = (event) => {
    if (!onRenamePage || event.target.closest("button, input, [role=menu]"))
      return;
    event.stopPropagation();
    setRenaming(true);
  };
  const [outpaintNode, setOutpaintNode] = useState(null);
  // The saliency suggestion that seeds that gesture's default rect, if any.
  const [outpaintPlan, setOutpaintPlan] = useState(null);

  // Which pages are worth keeping an engine for is decided by the parent, and
  // it decides from what the reader can actually see.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => onVisibility(nodeId, entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nodeId, onVisibility]);

  // Fine-grained selective notification subscription in multi-artboard free mode.
  // Updates root div position directly for direct artboard mutations without re-rendering.
  useEffect(() => {
    if (!free) return undefined;
    const store = useWorkflowStore.getState();
    const unsubscribe = store.subscribeArtboardNotification?.(
      nodeId,
      ({ rect: updatedRect, localRect, isDirectTarget }) => {
        if (!isDirectTarget) return;
        const el = rootRef.current;
        const targetRect = localRect || updatedRect;
        if (!el || !targetRect) return;
        el.style.left = `${targetRect.x}px`;
        el.style.top = `${targetRect.y}px`;
        if (targetRect.width !== undefined)
          el.style.width = `${targetRect.width}px`;
        if (targetRect.height !== undefined)
          el.style.height = `${targetRect.height}px`;
      },
    );
    return unsubscribe;
  }, [free, nodeId]);

  const source = useMemo(
    () => buildEditorSource(nodeId, snapshot),
    // Built once per activation; see buildEditorSource on why this must not
    // track the images map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeId, active, mode],
  );
  const mediaAssetIds = useMemo(() => mediaAssetIdsInSource(source), [source]);
  const [, setMediaHydrationVersion] = useState(0);
  const [mediaRetryToken, setMediaRetryToken] = useState(0);
  const [mediaHydrationError, setMediaHydrationError] = useState(null);
  const mediaAssetsReady = mediaAssetIds.every((id) =>
    Boolean(useWorkflowStore.getState().images[id]),
  );

  useEffect(() => {
    if (!active || mediaAssetsReady) return undefined;
    let cancelled = false;
    setMediaHydrationError(null);
    void useWorkflowStore
      .getState()
      .hydrateImages(mediaAssetIds)
      .then(() => {
        if (cancelled) return;
        const images = useWorkflowStore.getState().images;
        if (mediaAssetIds.some((id) => !images[id])) {
          setMediaHydrationError({ code: "missingMediaAsset" });
          return;
        }
        setMediaHydrationVersion((version) => version + 1);
      })
      .catch((cause) => {
        if (!cancelled) setMediaHydrationError(cause);
      });
    return () => {
      cancelled = true;
    };
  }, [active, mediaAssetsReady, mediaAssetIds, mediaRetryToken]);

  const hydratedSource = useMemo(
    () =>
      mediaAssetIds.length && mediaAssetsReady
        ? withHydratedMediaSources(source, useWorkflowStore.getState().images)
        : source,
    [source, mediaAssetIds, mediaAssetsReady],
  );

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
    source: hydratedSource,
    active: active && mediaAssetsReady,
    onChange,
    onBeforeDispose: beforeDispose,
    onGeneratedOutput,
    sourceWorkflowNodeId: nodeId,
    cameraMode: free ? "shared" : "page",
    getFitInsets,
  });
  const handleResizeCommit = useCallback(() => {
    engine?.commit("editor.history.entry.resize");
    if (free && resizePositionRef.current) {
      moveEditorArtboard(nodeId, resizePositionRef.current);
      resizePositionRef.current = null;
    }
  }, [engine, free, nodeId, moveEditorArtboard]);
  const pageError = mediaHydrationError || error;
  const retryPage = () => {
    setMediaHydrationError(null);
    setMediaRetryToken((token) => token + 1);
    retry();
  };
  const canvasType = doc
    ? getCanvasType(doc)
    : snapshot?.canvasType ||
      (snapshot?.doc ? getCanvasType(snapshot.doc) : "design");
  const iconTone =
    FRAME_TYPE_ICON_TONES[canvasType] ||
    FRAME_TYPE_ICON_TONES[CANVAS_TYPE.DESIGN];
  const hasThreeNodes = doc?.nodes.some(
    (node) => node.kind === "mesh3d" || node.kind === "model3d",
  );
  const hasCanvasInstances = doc?.nodes.some(
    (node) => node.kind === "canvasInstance",
  );
  const mixedLayers =
    Boolean(doc) &&
    canvasType !== "3d" &&
    (hasThreeNodes || hasCanvasInstances);

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

  // The image AI group of the taskbar's More menu. Expand opens the grow-frame
  // overlay on the selected layer; the parent runs every model.
  const aiMenuProps = {
    onOutpaint:
      onOutpaintSubmit && selected?.kind === "image"
        ? () => {
            const node = selected;
            setOutpaintNode(node);
            setOutpaintPlan(suggestOutpaintPlanForNode(engine, node));
          }
        : null,
    onUpscale,
    upscaleBusy,
    onAutoEnhance,
    onPortraitRetouch,
    portraitRetouchBusy,
    onSplitLayers,
    splitLayersBusy,
  };

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
    return useWorkflowStore.subscribe((state) => {
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
    enabled: skiaEnabled,
    engine,
    doc,
    canvasRef: skiaCanvasRef,
    stageRef,
    revision: revisionRef.current,
  });
  const skiaPainting = skiaEnabled && skiaStatus === "ready";
  const evaluatedThreeDoc =
    doc && canvasType === "3d"
      ? (engine?.getEvaluatedDocument?.() ?? doc)
      : doc;
  const viewport = engine?.getViewport() ?? { zoom: 1, panX: 0, panY: 0 };
  const pageRect = doc ? docToScreenRect(effectivePage(doc), viewport) : null;
  // Full-stage scene editing must reserve the same panel bands as page Fit.
  // Free artboards already sit inside the parent's fitted clear area.
  const sceneEditingInsets =
    mode === "free" ? null : getFitInsets?.(stageRef.current?.clientWidth ?? 0);
  const changeCanvasType = (nextType) => {
    changeEngineCanvasType(engine, nodeId, nextType, onCanvasTypeChanged);
  };
  const openInstanceAtPoint = (event) => {
    if (!mixedLayers || !engine) return;
    const point = engine.toDocPoint(event.clientX, event.clientY);
    const hit = engine.nodeAtPoint(point);
    if (hit?.kind !== "canvasInstance") return;
    event.preventDefault();
    event.stopPropagation();
    if (getCanvasType(resolveCanvas?.(hit.sourceCanvasId)) === "3d") {
      engine.selectExactly([hit.id]);
      if (hit.instance?.overrides?.viewLocked !== true) onAdjustView?.(hit.id);
      return;
    }
    if (!onOpenCanvasSource) return;
    onOpenCanvasSource(hit.sourceCanvasId, hit.id);
  };
  const handleAdjustmentKey = (event) => {
    if (!adjustingInstanceId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancelAdjustView?.();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onFinishAdjustView?.();
    }
  };
  const finishAdjustmentOutside = (event) => {
    if (
      adjustingInstanceId &&
      !event.target.closest?.(`[data-instance-id="${adjustingInstanceId}"]`)
    )
      onFinishAdjustView?.();
    releaseNestedPointerFocus(event);
  };
  const releaseNestedPointerFocus = (event) => {
    if (
      selectedInstanceChild &&
      !event.target.closest?.('[data-testid="editor-three-instance-input"]')
    ) {
      onSelectInstanceChild?.(null);
    }
  };

  // One definition for both layouts: the single-page branch and the
  // multi-page one each render a stage, and a canvas added to only one of
  // them is the kind of difference nothing catches until it is on screen.
  const canvases = (
    <>
      <canvas
        ref={canvasRef}
        data-testid="editor-2d-canvas"
        data-renderer-active={!skiaPainting ? "true" : "false"}
        className={`absolute left-0 top-0 ${mixedLayers ? "z-20" : ""} ${skiaPainting ? "invisible" : ""}`}
      />
      {skiaEnabled ? (
        <canvas
          ref={skiaCanvasRef}
          data-testid="skia-canvas"
          data-status={skiaStatus}
          data-renderer-active={skiaPainting ? "true" : "false"}
          className={`absolute left-0 top-0 ${skiaPainting ? "" : "invisible"}`}
        />
      ) : null}
      {doc && canvasType === "3d" && pageRect ? (
        <div
          data-testid="editor-3d-canvas"
          className="absolute z-10 overflow-hidden"
          style={
            focused &&
            !stageFocus &&
            !readOnly &&
            doc.scene3d?.frame?.cameraPreview !== true
              ? {
                  left: sceneEditingInsets?.left ?? 0,
                  top: sceneEditingInsets?.top ?? 0,
                  right: sceneEditingInsets?.right ?? 0,
                  bottom: sceneEditingInsets?.bottom ?? 0,
                }
              : {
                  left: pageRect.x,
                  top: pageRect.y,
                  width: pageRect.width,
                  height: pageRect.height,
                }
          }
        >
          <Suspense fallback={null}>
            <ThreeSceneViewport
              doc={evaluatedThreeDoc}
              getDocument={() =>
                readCurrentThreeSceneDocument(engine, evaluatedThreeDoc)
              }
              selectedId={selected?.id ?? null}
              selectedIds={selectedIds}
              readOnly={readOnly || !EDITOR_BETA_ENABLED}
              interactive={EDITOR_BETA_ENABLED && !stageFocus}
              toolMode={threeToolMode}
              onToolMode={onThreeToolMode}
              showToolGroup={EDITOR_BETA_ENABLED && threeToolMode == null}
              viewControls={EDITOR_BETA_ENABLED && focused && !stageFocus}
              resolveAsset={(node) =>
                node.kind === "canvasInstance"
                  ? instanceSnapshotUrl(
                      resolveCanvas?.(node.sourceCanvasId),
                      node.instance,
                      resolveCanvas,
                    )
                  : node.src
              }
              onSelect={(id, meta = {}) => {
                if (!id) {
                  if (!meta.shiftKey && !meta.metaKey && !meta.ctrlKey) {
                    engine?.selectExactly([]);
                  }
                } else if (meta.shiftKey || meta.metaKey || meta.ctrlKey) {
                  engine?.toggleExactly(id);
                } else {
                  engine?.selectExactly([id]);
                }
              }}
              onPatchNode={(id, patch) =>
                patchThreeSceneNode(engine, id, patch)
              }
              onPatchScene={(patch) => patchThreeScene(engine, patch)}
              onCommit={() => engine?.commit("editor.history.entry.layer")}
            />
          </Suspense>
        </div>
      ) : null}
      {doc && mixedLayers ? (
        <Suspense fallback={null}>
          <EditorMixedLayers
            doc={doc}
            engine={engine}
            resolveCanvas={resolveCanvas}
            selectedId={selected?.id ?? null}
            selectedInstanceChild={selectedInstanceChild}
            adjustingInstanceId={adjustingInstanceId}
            onInstanceCameraChange={(camera) => {
              const current = engine
                ?.getDocument()
                ?.nodes.find((node) => node.id === adjustingInstanceId);
              if (!current) return;
              const baseCamera =
                current.instance?.overrides?.camera ??
                resolveCanvas?.(current.sourceCanvasId)?.scene3d?.camera;
              if (!baseCamera)
                throw new Error("Instance camera source is unavailable");
              const instance = setInstanceCamera(current.instance, {
                ...baseCamera,
                ...camera,
              });
              engine.updateNode(current.id, { instance }, { commit: false });
            }}
            active={focused}
            onSelectInstanceChild={onSelectInstanceChild}
          />
        </Suspense>
      ) : null}
    </>
  );

  const streamingContent = streamingLayout ? (
    <StreamingLayoutPreview
      previewHtml={streamingLayout.html}
      width={streamingLayout.width}
      height={streamingLayout.height}
      t={t}
    />
  ) : null;
  const editingTextNode = editingTextId
    ? doc?.nodes.find((candidate) => candidate.id === editingTextId)
    : null;
  const editingRegionNode = editingRegionId
    ? doc?.nodes.find((candidate) => candidate.id === editingRegionId)
    : null;

  // Objects the rotation rings can turn: a mesh in this frame, or an instance
  // of a 3D frame (which turns its own view). A model turns by dragging it.
  const ringTarget =
    (selected?.kind === "mesh3d" && !mixedLayers) ||
    (selected?.kind === "canvasInstance" &&
      adjustingInstanceId === selected.id &&
      getCanvasType(resolveCanvas?.(selected.sourceCanvasId)) === "3d" &&
      selected.instance?.overrides?.viewLocked !== true)
      ? selected
      : null;
  const gizmoPortalTarget =
    stageRef.current?.closest('[data-testid="editor-pages"]') ??
    stageRef.current;
  const gizmoPortalBounds = gizmoPortalTarget?.getBoundingClientRect();

  const overlays =
    focused && ready && canvasType !== "3d" ? (
      <>
        {EDITOR_BETA_ENABLED &&
        tool === TOOL.SELECT &&
        !readOnly &&
        !selected?.locked &&
        ringTarget ? (
          <EditorObject3dGizmo
            key={ringTarget.id}
            engine={engine}
            node={ringTarget}
            viewport={viewport}
            portalTarget={gizmoPortalTarget}
            containerSize={{
              width: gizmoPortalTarget?.clientWidth ?? 0,
              height: gizmoPortalTarget?.clientHeight ?? 0,
            }}
            portalOffset={{
              x: gizmoPortalBounds?.left ?? 0,
              y: gizmoPortalBounds?.top ?? 0,
            }}
            interactive
          />
        ) : null}
        <EditorResizeHandles
          engine={engine}
          docRect={doc ? docToScreenRect(effectivePage(doc), viewport) : null}
          onCommit={
            free
              ? handleResizeCommit
              : () => engine?.commit("editor.history.entry.resize")
          }
          onDragStart={free ? handleResizeDragStart : null}
          hidden={
            tool !== TOOL.SELECT ||
            Boolean(doc?.crop) ||
            Boolean(engine?.getSelectionTransform?.()) ||
            Boolean(outpaintNode)
          }
        />

        {editingTextNode ? (
          <EditorTextOverlay
            key={editingTextNode.id}
            node={editingTextNode}
            viewport={viewport}
            onUpdate={(text) => engine?.updateTextEdit(text)}
            onCommit={(text) => engine?.endTextEdit(text)}
          />
        ) : null}

        {/* The outpaint grow-frame survives past the page edges, so it renders
            fixed-positioned outside the clipping stage. Only while its layer
            is still the selected one under the Select tool. */}
        {outpaintNode &&
        onOutpaintSubmit &&
        tool === TOOL.SELECT &&
        selected?.id === outpaintNode.id ? (
          <EditorOutpaintOverlay
            node={outpaintNode}
            plan={outpaintPlan}
            viewport={viewport}
            stageRef={stageRef}
            busy={repaintBusy}
            onSubmit={(grownRect) => {
              onOutpaintSubmit(outpaintNode, grownRect);
              setOutpaintNode(null);
              setOutpaintPlan(null);
            }}
            onCancel={() => {
              setOutpaintNode(null);
              setOutpaintPlan(null);
            }}
          />
        ) : null}

        {/* Brush / Eraser / Healing Size & Hardness HUD preview */}
        {focused &&
        ready &&
        (tool === TOOL.BRUSH ||
          tool === TOOL.ERASER ||
          tool === TOOL.HEALING) ? (
          <BrushPreviewOverlay engine={engine} viewport={viewport} />
        ) : null}

        {editingRegionNode ? (
          <EditorRegionLabel
            key={editingRegionNode.id}
            node={editingRegionNode}
            viewport={viewport}
            onCommit={(label) => engine?.endRegionLabelEdit(label)}
            onIntent={(intent) => engine?.setRegionIntent(intent)}
            onCutout={onRegionCutout}
            onAddPoint={onAddPoint}
            onRepaint={onRepaint}
            cutoutBusy={cutoutBusy}
            repaintBusy={repaintBusy}
          />
        ) : null}
      </>
    ) : null;

  if (free) {
    // An artboard on the shared free canvas. The outer div carries the camera
    // transform and the (thin, focused-only) frame; the inner stage owns the
    // canvas and the engine's pointer surface. The name label floats above the
    // board, outside the clipping stage.
    return (
      <div
        ref={rootRef}
        data-editor-artboard
        data-testid="editor-page"
        data-node-id={nodeId}
        onPointerDownCapture={() => onFocus(nodeId)}
        // isolate: the frame's own z-index ladder (header, tool row, add
        // button) stays inside the frame, so floating panels (z-30) always
        // cover it. The focused frame sits above its neighbours so its menus
        // are not hidden by the next frame.
        className={`group/artboard isolate absolute pointer-events-auto ${focused ? "z-10" : "z-0"}`}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      >
        <div
          ref={stageRef}
          onPointerDownCapture={releaseNestedPointerFocus}
          onClickCapture={finishAdjustmentOutside}
          onKeyDownCapture={handleAdjustmentKey}
          onDoubleClickCapture={openInstanceAtPoint}
          className={`absolute inset-0 touch-none overflow-hidden transition-colors ${
            focused ? "ring-1 ring-[#b2ffd6]/60" : "ring-1 ring-white/10"
          }`}
        >
          {canvases}
          {streamingContent ? (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              {streamingContent}
            </div>
          ) : null}
          {focused ? (
            <div aria-hidden className="pointer-events-none absolute inset-0" />
          ) : null}
          {overlays}
          {EDITOR_BETA_ENABLED && stageFocus && doc && canvasType === "3d" ? (
            <Suspense fallback={null}>
              {(() => {
                const focusStage = (
                  <ThreeSceneFocusStage
                    nodeId={nodeId}
                    title={title}
                    doc={evaluatedThreeDoc}
                    getDocument={() =>
                      readCurrentThreeSceneDocument(engine, evaluatedThreeDoc)
                    }
                    selectedId={selected?.id ?? null}
                    selectedIds={selectedIds}
                    readOnly={readOnly}
                    toolMode={threeToolMode}
                    onToolMode={onThreeToolMode}
                    onPatchNode={(id, patch) =>
                      patchThreeSceneNode(engine, id, patch)
                    }
                    onPatchScene={(patch) => patchThreeScene(engine, patch)}
                    onCommit={() =>
                      engine?.commit("editor.history.entry.layer")
                    }
                    onSelect={(id, meta = {}) => {
                      if (!id) {
                        if (!meta.shiftKey && !meta.metaKey && !meta.ctrlKey) {
                          engine?.selectExactly([]);
                        }
                      } else if (
                        meta.shiftKey ||
                        meta.metaKey ||
                        meta.ctrlKey
                      ) {
                        engine?.toggleExactly(id);
                      } else {
                        engine?.selectExactly([id]);
                      }
                    }}
                    resolveAsset={(node) =>
                      node.kind === "canvasInstance"
                        ? instanceSnapshotUrl(
                            resolveCanvas?.(node.sourceCanvasId),
                            node.instance,
                            resolveCanvas,
                          )
                        : node.src
                    }
                    onExit={() => setStageFocus(false)}
                    t={t}
                  />
                );
                const portalTarget =
                  stageRef.current?.closest('[data-testid="editor-pages"]') ??
                  (typeof document !== "undefined"
                    ? document.querySelector?.('[data-testid="editor-pages"]')
                    : null);
                return portalTarget
                  ? createPortal(focusStage, portalTarget)
                  : focusStage;
              })()}
            </Suspense>
          ) : null}
          {!active ? (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-neutral-500">
              …
            </div>
          ) : null}
        </div>
        <div
          ref={titleRef}
          data-testid="editor-page-title"
          data-editor-artboard-title
          style={{ top: -EDITOR_PAGE_HEADER_INSET }}
          // A full-width bar over the frame: name at the left, the canvas-type
          // switch at the right. The focused frame's bar is tinted with its
          // type colour; the others show just the name.
          className={`absolute left-0 ${pageTitleActions ? "z-40" : ""} flex max-w-full items-center gap-1.5 text-[11px] font-mono leading-none transition-colors ${
            focused ? "text-[#a7ffd4]" : "text-neutral-400 hover:text-neutral-200"
          } ${titlePanHandlers ? "cursor-grab touch-none" : "cursor-pointer"}`}
          {...titlePanHandlers}
          onDoubleClick={startRename}
        >
          <span
            data-testid="editor-frame-header-icon"
            aria-label={t(iconTone.label)}
            className={`flex shrink-0 items-center transition-colors ${
              focused ? "text-[#a7ffd4]" : iconTone.text
            }`}
          >
            <IconFrame size={12} strokeWidth={1.5} />
          </span>
          <EditorPageTitle
            editing={renaming}
            onEditingChange={setRenaming}
            title={title}
            onRename={
              onRenamePage ? (name) => onRenamePage(nodeId, name) : null
            }
          />
          {componentUses > 0 ? (
            <span
              data-testid="editor-component-uses"
              className={`shrink-0 ${focused ? "text-[#a7ffd4]/70" : "text-neutral-500"}`}
            >
              {t("editor.component.uses", { count: componentUses })}
            </span>
          ) : null}
          {EDITOR_BETA_ENABLED && canvasType === "3d" && !readOnly ? (
            <button
              type="button"
              data-testid="editor-enter-3d-focus-btn"
              title={t("editor.three.enterFocus")}
              aria-label={t("editor.three.enterFocus")}
              onClick={(e) => {
                e.stopPropagation();
                if (!focused) onFocus?.(nodeId);
                setStageFocus(true);
              }}
              className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-mono transition-colors ${
                focused
                  ? "bg-black/10 text-black hover:bg-black/20"
                  : "text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
              }`}
            >
              <IconExpand size={12} strokeWidth={1.5} />
              <span>{t("editor.three.enterFocus")}</span>
            </button>
          ) : null}
          {doc && !readOnly ? (
            <EditorCanvasTypeSelect
              value={canvasType}
              onChange={changeCanvasType}
            />
          ) : null}
          {pageTitleActions}
        </div>
        {/* Page tool row: the contextual task bar and the canvas delete sit
            one row above the header, centred on the frame, so neither covers
            the page itself. */}
        <div
          data-testid="editor-page-toolbar"
          className="absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1"
          style={{
            bottom: `calc(100% + ${EDITOR_PAGE_HEADER_INSET + EDITOR_PAGE_TOOLBAR_GAP}px)`,
          }}
        >
          {doc && focused ? (
            <EditorContextualTaskBar
              engine={engine}
              tool={tool}
              selected={selected}
              hasSelection={Boolean(
                engine?.getPixelSelection?.()?.contours?.length,
              )}
              removeBackground={onAutoMask}
              maskBusy={autoMaskBusy}
              onRepaint={
                engine?.getPixelSelection?.()?.contours?.length
                  ? onRepaintSelection
                  : selected?.kind === "image"
                    ? (prompt) => onRepaintNode?.(selected, prompt)
                    : null
              }
              repaintBusy={repaintBusy}
              {...aiMenuProps}
              onAddAdjustmentLayer={onAddAdjustmentLayer}
              onApplyPreset={onApplyPreset}
              getBitmap={getBitmap}
              doc={doc}
              onEditSvg={onEditSvg}
              onCreateComponent={onCreateComponent}
              onDetachInstance={onDetachInstance}
            />
          ) : null}
          {onDeleteCanvas ? (
            <div
              className={`flex items-center rounded-xl border border-white/10 bg-neutral-900/95 p-1 shadow-pop backdrop-blur-md transition-opacity ${
                focused
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover/artboard:pointer-events-auto group-hover/artboard:opacity-100"
              }`}
            >
              <button
                type="button"
                data-testid="editor-delete-canvas-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const canDelete = confirmCanvasDelete({
                    isDirty: dirty,
                    confirmFn:
                      typeof window !== "undefined" &&
                      typeof window.confirm === "function"
                        ? (msg) => window.confirm(msg)
                        : null,
                    message: t("editor.pages.confirmDeleteDirty"),
                  });
                  if (!canDelete) return;
                  onDeleteCanvas(nodeId);
                }}
                title={t("editor.pages.deleteCanvas")}
                aria-label={t("editor.pages.deleteCanvas")}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <IconTrash size={14} strokeWidth={1.5} />
              </button>
            </div>
          ) : null}
        </div>

        {/* Add Canvas Button in Free Mode - only on the right of the last canvas */}
        {onAddCanvas && isLast ? (
          <button
            type="button"
            data-testid="editor-add-canvas-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAddCanvas(nodeId);
            }}
            title={t("editor.addCanvas")}
            className="group/add-canvas absolute -right-12 top-1/2 z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#1e1e1e]/90 text-white/80 shadow-pop backdrop-blur-md transition-colors hover:bg-white hover:text-black border border-white/15"
          >
            <IconAdd size={18} />
          </button>
        ) : null}
      </div>
    );
  }

  const docRect = doc ? docToScreenRect(effectivePage(doc), viewport) : null;

  // A single picture keeps the stage it always had, with no page chrome
  // to explain.
  return (
    <section
      ref={rootRef}
      data-testid="editor-page"
      data-node-id={nodeId}
      onPointerDownCapture={() => onFocus(nodeId)}
      // isolate: keep this page's chrome z-indexes below the floating panels.
      className="relative isolate flex h-full w-full flex-col overflow-hidden"
    >
      <div
        ref={stageRef}
        onPointerDownCapture={releaseNestedPointerFocus}
        onClickCapture={finishAdjustmentOutside}
        onKeyDownCapture={handleAdjustmentKey}
        onDoubleClickCapture={openInstanceAtPoint}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
      >
        {canvases}
        {streamingContent && docRect ? (
          <div
            className="pointer-events-none absolute z-10 overflow-hidden"
            style={{
              left: docRect.x,
              top: docRect.y,
              width: docRect.width,
              height: docRect.height,
            }}
          >
            {streamingContent}
          </div>
        ) : null}

        {/* Big-image open state: a spinner while the engine decodes, and an
            error bar with Retry when the picture failed to land (the engine
            resolves with a blank document instead of rejecting). */}
        {!ready && !pageError ? (
          <div
            data-testid="editor-page-loading"
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          >
            <LoadingModal label={t("editor.open.loading")} />
          </div>
        ) : null}

        {pageError ? (
          <div
            data-testid="editor-page-error"
            className="absolute inset-x-0 top-0 z-40 flex items-center justify-center gap-3 bg-rose-500/10 px-4 py-2 text-[11px] text-rose-400"
          >
            <span>{t("editor.open.failed")}</span>
            <button
              type="button"
              onClick={retryPage}
              className="rounded-lg bg-rose-500/10 px-2 py-0.5 text-rose-400 hover:bg-rose-500/20"
            >
              {t("editor.open.retry")}
            </button>
          </div>
        ) : null}

        {docRect && !readOnly ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute ring-1 ring-white/15"
              style={{
                left: docRect.x,
                top: docRect.y,
                width: docRect.width,
                height: docRect.height,
              }}
            />
            {/* Page header: frame icon + title + canvas-type switch, pinned to the
                artboard's top-left so the mode is read and changed in one
                place instead of from a footer under the canvas. */}
            <div
              ref={titleRef}
              data-testid="editor-page-title"
              data-editor-artboard-title
              // Same full-width bar as a frame on the free canvas.
              className={`absolute z-20 flex max-w-[70%] items-center gap-1.5 text-[11px] font-mono leading-none transition-colors ${
                focused ? "text-[#a7ffd4]" : "text-neutral-400 hover:text-neutral-200"
              }`}
              onDoubleClick={startRename}
              style={{
                left: docRect.x,
                top: docRect.y - EDITOR_PAGE_HEADER_INSET,
              }}
            >
              <span
                data-testid="editor-frame-header-icon"
                aria-label={t(iconTone.label)}
                className={`flex shrink-0 items-center transition-colors ${
                  focused ? "text-[#a7ffd4]" : iconTone.text
                }`}
              >
                <IconFrame size={12} strokeWidth={1.5} />
              </span>
              <EditorPageTitle
                editing={renaming}
                onEditingChange={setRenaming}
                title={title}
                onRename={
                  onRenamePage ? (name) => onRenamePage(nodeId, name) : null
                }
              />
              {componentUses > 0 ? (
                <span
                  data-testid="editor-component-uses"
                  className={`shrink-0 ${focused ? "text-[#a7ffd4]/70" : "text-neutral-500"}`}
                >
                  {t("editor.component.uses", { count: componentUses })}
                </span>
              ) : null}
              {EDITOR_BETA_ENABLED && canvasType === "3d" && !readOnly ? (
                <button
                  type="button"
                  data-testid="editor-enter-3d-focus-btn"
                  title={t("editor.three.enterFocus")}
                  aria-label={t("editor.three.enterFocus")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!focused) onFocus?.(nodeId);
                    setStageFocus(true);
                  }}
                  className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-mono transition-colors ${
                    focused
                      ? "bg-black/10 text-black hover:bg-black/20"
                      : "text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
                  }`}
                >
                  <IconExpand size={12} strokeWidth={1.5} />
                  <span>{t("editor.three.enterFocus")}</span>
                </button>
              ) : null}
              {doc ? (
                <EditorCanvasTypeSelect
                  value={canvasType}
                  onChange={changeCanvasType}
                />
              ) : null}
            </div>
            <div
              className="absolute z-20 flex -translate-x-1/2 items-center gap-1 text-[10px] font-mono pt-2"
              style={{
                left: docRect.x + docRect.width / 2,
                top: docRect.y + docRect.height,
              }}
            >
              <EditorCanvasPresets engine={engine} doc={doc} />
            </div>

            {focused ? (
              <EditorContextualTaskBar
                engine={engine}
                tool={tool}
                selected={selected}
                hasSelection={Boolean(
                  engine?.getPixelSelection?.()?.contours?.length,
                )}
                removeBackground={onAutoMask}
                maskBusy={autoMaskBusy}
                onRepaint={
                  engine?.getPixelSelection?.()?.contours?.length
                    ? onRepaintSelection
                    : selected?.kind === "image"
                      ? (prompt) => onRepaintNode?.(selected, prompt)
                      : null
                }
                repaintBusy={repaintBusy}
                {...aiMenuProps}
                onAddAdjustmentLayer={onAddAdjustmentLayer}
                onApplyPreset={onApplyPreset}
                getBitmap={getBitmap}
                doc={doc}
                docRect={docRect}
                stageRef={stageRef}
                onEditSvg={onEditSvg}
                onCreateComponent={onCreateComponent}
                onDetachInstance={onDetachInstance}
              />
            ) : null}

            {/* The single 3D frame adds canvases from the unobstructed zoom toolbar. */}
            {onAddCanvas && isLast && canvasType !== "3d" ? (
              <button
                type="button"
                data-testid="editor-add-canvas-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddCanvas(nodeId);
                }}
                title={t("editor.addCanvas")}
                className="group/add-canvas absolute z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#1e1e1e]/90 text-white/80 shadow-pop backdrop-blur-md transition-colors hover:bg-white hover:text-black border border-white/15"
                style={{
                  left: docRect.x + docRect.width + 24,
                  top: docRect.y + docRect.height / 2,
                }}
              >
                <IconAdd size={18} />
              </button>
            ) : null}
          </>
        ) : null}

        {EDITOR_BETA_ENABLED && stageFocus && doc && canvasType === "3d" ? (
          <Suspense fallback={null}>
            <ThreeSceneFocusStage
              nodeId={nodeId}
              title={title}
              doc={evaluatedThreeDoc}
              getDocument={() =>
                readCurrentThreeSceneDocument(engine, evaluatedThreeDoc)
              }
              selectedId={selected?.id ?? null}
              selectedIds={selectedIds}
              readOnly={readOnly}
              toolMode={threeToolMode}
              onToolMode={onThreeToolMode}
              onPatchNode={(id, patch) =>
                patchThreeSceneNode(engine, id, patch)
              }
              onPatchScene={(patch) => patchThreeScene(engine, patch)}
              onCommit={() => engine?.commit("editor.history.entry.layer")}
              onSelect={(id, meta = {}) => {
                if (!id) {
                  if (!meta.shiftKey && !meta.metaKey && !meta.ctrlKey) {
                    engine?.selectExactly([]);
                  }
                } else if (meta.shiftKey || meta.metaKey || meta.ctrlKey) {
                  engine?.toggleExactly(id);
                } else {
                  engine?.selectExactly([id]);
                }
              }}
              resolveAsset={(node) =>
                node.kind === "canvasInstance"
                  ? instanceSnapshotUrl(
                      resolveCanvas?.(node.sourceCanvasId),
                      node.instance,
                      resolveCanvas,
                    )
                  : node.src
              }
              onExit={() => setStageFocus(false)}
              t={t}
            />
          </Suspense>
        ) : null}

        {overlays}
      </div>
    </section>
  );
}

EditorPage.propTypes = {
  readOnly: PropTypes.bool,
  getFitInsets: PropTypes.func,
  nodeId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  index: PropTypes.number,
  focused: PropTypes.bool.isRequired,
  active: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(["full", "free"]).isRequired,
  onAddCanvas: PropTypes.func,
  onDeleteCanvas: PropTypes.func,
  isLast: PropTypes.bool,
  rect: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  sharedZoom: PropTypes.number,
  snapshot: PropTypes.object,
  onFocus: PropTypes.func.isRequired,
  onEngine: PropTypes.func.isRequired,
  onBeforeDispose: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  onGeneratedOutput: PropTypes.func.isRequired,
  onVisibility: PropTypes.func.isRequired,
  onRegionCutout: PropTypes.func,
  onAddPoint: PropTypes.func,
  onRepaint: PropTypes.func,
  onRepaintNode: PropTypes.func,
  onRepaintSelection: PropTypes.func,
  /** Outpaint submit: (node, grownRect, prompt). */
  onOutpaintSubmit: PropTypes.func,
  cutoutBusy: PropTypes.bool,
  repaintBusy: PropTypes.bool,
  /** Runs the matting cutout on the selected layer. */
  onAutoMask: PropTypes.func,
  onAutoEnhance: PropTypes.func,
  onPortraitRetouch: PropTypes.func,
  portraitRetouchBusy: PropTypes.bool,
  onSplitLayers: PropTypes.func,
  splitLayersBusy: PropTypes.bool,
  onUpscale: PropTypes.func,
  upscaleBusy: PropTypes.bool,
  autoMaskBusy: PropTypes.bool,
  onAddAdjustmentLayer: PropTypes.func,
  onApplyPreset: PropTypes.func,
  getBitmap: PropTypes.func,
  onEditSvg: PropTypes.func,
  onCreateComponent: PropTypes.func,
  onDetachInstance: PropTypes.func,
  componentUses: PropTypes.number,
  onRenamePage: PropTypes.func,
  /** Pointer handlers for the title label drag-to-pan handle, or null. */
  titlePanHandlers: PropTypes.object,
  pageTitleActions: PropTypes.node,
  resolveCanvas: PropTypes.func,
  selectedInstanceChild: PropTypes.shape({
    instanceId: PropTypes.string.isRequired,
    sourceCanvasId: PropTypes.string.isRequired,
    nodeId: PropTypes.string.isRequired,
  }),
  onSelectInstanceChild: PropTypes.func,
  onOpenCanvasSource: PropTypes.func,
  adjustingInstanceId: PropTypes.string,
  onAdjustView: PropTypes.func,
  onFinishAdjustView: PropTypes.func,
  onCancelAdjustView: PropTypes.func,
  onCanvasTypeChanged: PropTypes.func,
  threeToolMode: PropTypes.oneOf(["translate", "rotate", "scale"]),
  onThreeToolMode: PropTypes.func,
  streamingLayout: PropTypes.shape({
    html: PropTypes.string.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
  }),
};
