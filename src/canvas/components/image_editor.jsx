import { WORKSPACE_BACKGROUND } from "../editor/render_canvas_base.js";
import { frameEditorFills } from "../editor/frame-fills.js";
import { exportTargetName } from "../editor/export_filename.js";
import { patchForMultiResize } from "../editor/multi_selection_patch.js";
import { EDITOR_BETA_ENABLED } from "../editor-beta-features.js";
import {
  consumeImagePublication,
  settleImagePublication,
} from "../store/image-publication.js";
import PropTypes from "prop-types";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import EditorLayers from "./editor_layers.jsx";
import AiRepairDownloadDialog from "./ai_repair_download_dialog.jsx";
import { getSelectedCanvasPageIds } from "./editor_canvas_selection.js";
import {
  calculateFitInsets,
  editorPanelLayout,
  editorPageFitInsets,
  editorPanelVisibility,
} from "./editor_panel_layout.js";
import PropertiesPanelShell from "./editor_properties/properties_panel_shell.jsx";
import { getWorkbench } from "./editor_workbench.js";
import {
  countInstances,
  detachInstance,
  extractComponent,
} from "../editor/component_extract.js";
import { effectivePage } from "../editor/scene_model_geometry.js";
import { setDocumentSize as resizePageDocument } from "../editor/doc_ops_canvas.js";
import { selectionBounds } from "../editor/editor_export_bounds.js";
import { alignNodes, distributeNodes } from "../editor/align_ops.js";
import EditorPage from "./editor_page.jsx";
import LoadingModal from "./loading_modal.jsx";
import EditorProperties from "./deferred_editor_properties.jsx";
import { usePresentationHistory } from "./presentation/use_presentation_history.js";
import { usePresentationEditor } from "./presentation/use_presentation_editor.js";
import PresentationPageMenu from "./presentation/presentation_page_menu.jsx";
const PresentationViewer = lazy(() => import("./presentation/presentation_viewer.jsx"));
const PresentationExportDialog = lazy(() => import("./presentation/presentation_export_dialog.jsx"));
import PresentationSlide from "./presentation/presentation_slide.jsx";
import EditorToolbar, { EditorZoom } from "./editor_toolbar.jsx";
import EditorRulers, { EditorCanvasAids } from "./editor_rulers.jsx";
import EditorComments from "./editor_comments.jsx";
import { readDocumentGuides } from "../editor/rulers_geometry.js";
import { normalizeComments } from "../comments/comment_model.js";
import EditorPieMenu from "./editor_pie_menu.jsx";
import EditorContextMenu from "./editor_context_menu.jsx";
const EditorCommandPalette = lazy(() => import("./editor_command_palette.jsx"));
const EditorFindReplace = lazy(() => import("./editor_find_replace.jsx"));
const ShortcutReferenceModal = lazy(() => import("./shortcut_reference_modal.jsx"));
const SvgEditModal = lazy(() => import("./SvgEditModal.jsx"));
import { DESIGN_SHORTCUT_GROUPS } from "../../shared/editor-shortcut-catalog.js";
import useIsNarrow from "../use_is_narrow.js";
import "./editor_mobile_layout.css";
import { getSetting, setSetting } from "../../shared/settings.js";
import { loadEditorPanelLayout, saveEditorPanelLayout } from "./editor_panel_preferences.js";
import {
  TOOL,
  clampZoom,
} from "../editor/editor_constants.js";
import { marqueeItemForMode } from "../editor/tool_families.js";
import { executeEditorCommand } from "../editor/command_table.js";
import { PendingCanvasSelectionManager } from "./editor_pending_canvas_selection.js";
import { useEditorShortcuts } from "../use_editor_shortcuts.js";
import { EDITOR_MEDIA_ACCEPT } from "./editor_import_files.js";
import { useEditorDnd } from "./use_editor_dnd.js";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";
import { useWorkspaceSkia } from "../use_skia_page.js";
import { useWorkspaceChrome } from "../use_workspace_chrome.js";
import { SpatialIndex } from "../editor/spatial_index.js";
import { requestCollabOriginal, sendCollabCursor } from "../collab/use_collab.js";
import RemoteCursors from "./remote_cursors.jsx";
import OfflineSessionNotice from "./offline_session_notice.jsx";
import RoomProjectNotice from "./room_project_notice.jsx";
import SharedDocumentLoading from "./shared_document_loading.jsx";
import { regionHost } from "../editor/doc_ops.js";
import {
  getCanvasType,
} from "../editor/canvas-composition-model.js";
import {
  clearInstanceCamera,
  getInstanceCamera,
  setInstanceCamera,
  setInstanceViewLocked,
} from "../editor/instance-view.js";
import { applySmartCrop } from "../editor/auto_crop_page.js";
import {
  addColorVariable,
  bindColorVariable,
  updateColorVariable,
} from "../editor/scene_color_variables.js";
import { createVariablesPanelActions } from "../editor/scene_variables.js";
import { createStylePanelActions } from "../editor/scene_styles.js";
import { useEditorMobilePanels } from "./editor_hooks/use_editor_mobile_panels.js";
import { useEditorMediaImport } from "./editor_hooks/use_editor_media_import.js";
import { useEditorFeedback } from "./editor_hooks/use_editor_feedback.js";
import { useEditorImageActions } from "./editor_hooks/use_editor_image_actions.js";
import { useEditorApply } from "./editor_hooks/use_editor_apply.js";
import { useEditorDocumentAids } from "./editor_hooks/use_editor_document_aids.js";
import { useEditorPaletteActions } from "./editor_hooks/use_editor_palette_actions.js";
import { useEditorCanvasGestures } from "./editor_hooks/use_editor_canvas_gestures.js";
import { useEditorSharedCamera } from "./editor_hooks/use_editor_shared_camera.js";
import { useEditorArtboardLayouts } from "./editor_hooks/use_editor_artboard_layouts.js";
import { useDraftAutosave } from "./editor_hooks/use_draft_autosave.js";
import { readImageRgba } from "./bitmap_pixels.js";
import { useEditorRaster } from "./editor_hooks/use_editor_raster.js";
import { useEditorLayerSplit } from "./editor_hooks/use_editor_layer_split.js";
import {
  starterAdjustment,
  starterEffect,
  adjustmentLabelKey,
} from "../editor/adjustment_catalog.js";
import { layoutCanvasSize } from "../layout_geometry.js";
import { isLocalMattingSupported } from "../editor/ai_capabilities.js";
import {
  FREE_PADDING,
  workspaceRenderDocument,
} from "./image_editor_helpers.js";

const EditorCanvasInstanceProperties = lazy(
  () => import("./editor_canvas_instance_properties.jsx"),
);
const EditorExportDialog = lazy(() => import("./editor_export_dialog.jsx"));
const EditorHistoryPanel = lazy(() => import("./editor_history_panel.jsx"));

/**
 * How many pages keep a live engine at once.
 *
 * The adjustment renderer is shared, so this is no longer about WebGL contexts
 * running out — it is about memory. Each live page owns a canvas backing store
 * the size of its stage times the device pixel ratio, plus its decoded
 * bitmaps, which on a large display runs to tens of megabytes apiece. Pages
 * past the cap are rebuilt from their snapshot when they scroll back in.
 */
const MAX_LIVE_PAGES = 12;

/**
 * Persisted view-aid keys. The pointer/snapping modules read the same keys
 * synchronously, so a toggle here changes the very next drag.
 */
const SNAP_TO_GRID_SETTING = "voo.editor.snapToGrid";

/**
 * Full-screen editor for one or more image assets.
 *
 * Figma-style navigation: each page fills its own stage and carries its own
 * zoom (pinch/⌘-wheel) and pan (scroll, Space drag), with the white page
 * floating on the dark stage. Document state lives in the per-page engines —
 * this component is layout, the shared panels, and the bridge back to the
 * workflow store. The panels act on whichever page is focused, so a single
 * picture behaves exactly as it always did.
 */

export default function ImageEditor({ agentVisible = false, visible = true }) {
  const { t } = useI18n();
  const isNarrow = useIsNarrow();
  const welcomeOpen = useDesignStore((state) => state.welcomeOpen);

  const nodeIds = useDesignStore((state) => state.editingNodeIds);
  const focusedId = useDesignStore((state) => state.editingNodeId);
  const pendingArtboardFitId = useDesignStore((state) => state.pendingArtboardFitId);
  const nodes = useDesignStore((state) => state.nodes);
  const presentationId = useDesignStore(
    (state) => state.editingPresentationId,
  );
  const presentationOwner = nodes.find((node) => node.id === presentationId);
  const rawFocusEditorPage = useDesignStore((state) => state.focusEditorPage);
  const addEditorPage = useDesignStore((state) => state.addEditorPage);
  const createComponentPage = useDesignStore(
    (state) => state.createComponentPage,
  );
  const openExistingEditorPage = useDesignStore(
    (state) => state.openExistingEditorPage,
  );
  const deleteEditorPage = useDesignStore((state) => state.deleteEditorPage);
  const duplicateEditorPage = useDesignStore(
    (state) => state.duplicateEditorPage,
  );
  const renameEditorPage = useDesignStore((state) => state.renameEditorPage);
  /** Group whose free-canvas view is remembered; null for hand multi-selects. */
  const editingGroupId = useDesignStore((state) => state.editingGroupId);
  const editorRememberCamera = useDesignStore(
    (state) => state.editorRememberCamera,
  );
  const getGroupCamera = useDesignStore((state) => state.getGroupCamera);
  const saveGroupCamera = useDesignStore((state) => state.saveGroupCamera);
  /** Accumulated HTML of a streaming layout generation, shown live. */
  const agentGenerating = useDesignStore((state) => state.agentGenerating);
  const streamingPreview = useDesignStore((state) => state.streamingPreview);
  const streamingPreviewNodeId = useDesignStore(
    (state) => state.streamingPreviewNodeId,
  );
  const closeImageEditor = useDesignStore((state) => state.closeImageEditor);
  const applyImageEdits = useDesignStore((state) => state.applyImageEdits);
  const materializeEditorGeneratedOutput = useDesignStore(
    (state) => state.materializeEditorGeneratedOutput,
  );
  const cameraZoom = useDesignStore((state) => state.editorCamera?.zoom ?? 1, (a, b) => a === b);
  const editorArtboardLayouts = useDesignStore(
    (state) => state.editorArtboardLayouts,
  );
  const setEditorCamera = useDesignStore((state) => state.setEditorCamera);
  const setEditorArtboardLayout = useDesignStore(
    (state) => state.setEditorArtboardLayout,
  );

  // Every frame lives on the shared free canvas, including the first one.
  // Adding or removing a frame must never switch camera or renderer modes.
  const multi = nodeIds.length > 0 || Boolean(presentationId);

  // Request originals only when the actual image IDs change, not on every
  // document update. The effect reads the same stable input it depends on.
  const originalImageIdsJson = JSON.stringify(nodeIds.map((id) =>
    nodes.find((node) => node.id === id)?.data?.imageId).filter(Boolean));
  useEffect(() => {
    const imageIds = JSON.parse(originalImageIdsJson);
    if (imageIds.length) requestCollabOriginal(imageIds);
  }, [originalImageIdsJson]);

  /** nodeId -> live engine, and nodeId -> what an evicted page left behind. */
  const enginesRef = useRef(new Map());
  const snapshotsRef = useRef(new Map());
  useEffect(() => {
    const reader = (id) => {
      const live = enginesRef.current.get(id);
      return live?.ready ? live.engine.serialise() : snapshotsRef.current.get(id)?.doc;
    };
    useDesignStore.setState({ editorPageDocumentReader: reader });
    return () => {
      if (useDesignStore.getState().editorPageDocumentReader === reader) useDesignStore.setState({ editorPageDocumentReader: null });
    };
  }, []);
  const pendingCanvasSelectionRef = useRef(new PendingCanvasSelectionManager());
  const presentation = usePresentationEditor({
    ownerId: presentationId,
    focusedId,
    enginesRef,
    snapshotsRef,
  });
  const focusEditorPage = useCallback(
    (targetId) => {
      if (focusedId && targetId !== focusedId) {
        const prevEngine = enginesRef.current.get(focusedId)?.engine;
        prevEngine?.pause?.();
      }
      rawFocusEditorPage?.(targetId);
    },
    [focusedId, rawFocusEditorPage],
  );
  const [visibleIds, setVisibleIds] = useState(() => new Set());
  // Any engine reporting a change re-renders the shared panels, which read
  // straight from the focused engine rather than mirroring its state.
  // Every engine report bumps this; the workspace documents read the live engines, so they follow it.
  const [engineVersion, bump] = useReducer((count) => count + 1, 0);

  const freeStageRef = useRef(null);
  const workspaceCanvasRef = useRef(null);
  const workspaceChromeRef = useRef(null);
  const artboardLayerRef = useRef(null);
  const freeGridRef = useRef(null);
  const panGestureRef = useRef(null);
  const spaceRef = useRef(false);
  const [busy, setBusy] = useState(false);
  /** Whether this browser can run the matting model in-page. */
  const [localMattingSupported] = useState(() => isLocalMattingSupported());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedInstanceChild, setSelectedInstanceChild] = useState(null);
  // Grid presentation is shared across the workspace; annotations belong to the focused page.
  const [snapToGrid, setSnapToGrid] = useState(() => getSetting(SNAP_TO_GRID_SETTING) === true);
  const lastGridSizeRef = useRef(32);
  const [adjustingInstance, setAdjustingInstance] = useState(null);
  const [returnCanvasId, setReturnCanvasId] = useState(null);
  const [navigationError, setNavigationError] = useState(false);
  const returnCanvasStackRef = useRef([]);
  const pendingNavigationRef = useRef(null);
  const [swapPanels, setSwapPanels] = useState(
    () => loadEditorPanelLayout().swapped,
  );
  // The panels' layout follows the editor's width (see editor_panel_layout).
  // A callback ref: the editor renders nothing until a node is open, so a
  // mount-time effect would find no element to measure.
  const [editorWidth, setEditorWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(null);
  const editorRootObserverRef = useRef(null);
  const editorRootRef = useCallback((root) => {
    editorRootObserverRef.current?.disconnect();
    editorRootObserverRef.current = null;
    if (!root) return;
    const measure = () => {
      setEditorWidth(root.clientWidth);
      const parentWidth = root.parentElement?.clientWidth ?? 0;
      if (parentWidth > 0) {
        setContainerWidth(parentWidth);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (root.parentElement) observer.observe(root.parentElement);
    editorRootObserverRef.current = observer;
  }, []);
  const [exitPrompt, setExitPrompt] = useState(false);
  /** Right-click menu position, or null when closed. */
  const [contextMenu, setContextMenu] = useState(null);
  /** Press-and-hold "compare with original" preview state. */
  const [comparing, setComparing] = useState(false);
  /** Export popover state: open flag, chosen format and quality. */
  const [exportOpen, setExportOpen] = useState(false);
  const renderInstanceAbortRef = useRef(null);
  const [exportFormat, setExportFormat] = useState("png");
  const [exportQuality, setExportQuality] = useState(0.92);
  const [exportScale, setExportScale] = useState(1);
  const [exportRange, setExportRange] = useState("frame");
  /** Cheatsheet sheet state. */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** SVG Code Edit modal state. */
  const [svgEditModal, setSvgEditModal] = useState({
    isOpen: false,
    node: null,
    svgString: "",
  });
  /** Pie Menu state: active family and screen coordinates { family, position: { x, y } } */
  const [pieMenu, setPieMenu] = useState(null);

  /**
   * Open guard (plan-design-editor-fixes A6): for a short window after the
   * editor mounts — and again the moment the first engine reports ready —
   * the floating panels yield pointer events to the stage, so the first
   * click/double-click after the editor opens reaches the canvas instead of
   * being eaten by a panel that mounted with it.
   */
  const OPEN_GUARD_MS = 800;
  const [openGuard, setOpenGuard] = useState(true);
  /** Only the first engine-ready report re-arms the guard (see handleEngine). */
  const readySeenRef = useRef(false);
  useEffect(() => {
    if (!openGuard) return undefined;
    const timer = setTimeout(() => setOpenGuard(false), OPEN_GUARD_MS);
    return () => clearTimeout(timer);
  }, [openGuard]);

  /**
   * Each page reports its own engine, whether it finished opening, whether it
   * has unsaved work and how big its document is. Asking the engines directly
   * would mean reading them mid-open, when they still hold a blank placeholder
   * and no applied snapshot — and would call every page modified.
   */
  const handleEngine = useCallback((nodeId, state) => {
    if (state.engine) {
      enginesRef.current.set(nodeId, state);
      const store = useDesignStore.getState();
      if (store.nodes.some(node => node.id === nodeId) && state.ready) {
        const dirty = store.nodes.some(node => enginesRef.current.get(node.id)?.dirty || snapshotsRef.current.get(node.id)?.dirty);
        if (dirty) store.setIsDirty(true);
      }
      // Its work is live again; the snapshot it was rebuilt from is spent.
      if (state.ready) {
        snapshotsRef.current.delete(nodeId);
        // The stage becomes interactive the moment the first engine is up;
        // re-arm the guard so the first pointer gesture is never eaten.
        if (!readySeenRef.current) {
          readySeenRef.current = true;
          setOpenGuard(true);
        }
        pendingCanvasSelectionRef.current.consume(nodeId, state.engine);
      }
    } else {
      enginesRef.current.delete(nodeId);
    }
    bump();
  }, []);

  /**
   * An evicted page must keep everything an apply would need, because the
   * engine that could produce it is about to be gone. The flattened picture is
   * only worth carrying when there is an unsaved change to carry, and a page
   * torn down before it opened has nothing worth keeping at all.
   */
  const handleBeforeDispose = useCallback(async (nodeId, engine, ready) => {
    if (!ready) return;

    const writeSnapshot = (png) => {
      const dirty = engine.isDirty();
      snapshotsRef.current.set(nodeId, {
        doc: engine.serialise(),
        appliedDoc: engine.getAppliedDoc?.() ?? null,
        regions: engine.getRegions(),
        promptLayers: engine.getPromptLayers?.() ?? [],
        annotatedLayers: engine.exportAnnotatedLayers?.() ?? [],
        dirty,
        png: dirty ? png : null,
      });
    };

    // Publish a synchronous fallback first so a failed async flush never
    // discards the user's latest in-memory edit.
    writeSnapshot(engine.exportPng());
    try {
      if (engine.getSelectionTransform?.()) {
        await engine.applySelectionTransform?.();
      }
      await engine.flushTransforms?.();
      await engine.flushPaints?.();
      await engine.flushMasks?.();
      const dirty = engine.isDirty();
      const png = dirty
        ? ((await engine.exportFullResPng?.()) ?? engine.exportPng())
        : null;
      writeSnapshot(png);
    } catch (err) {
      console.error("Failed to flush editor snapshot before eviction", err);
    }
  }, []);

  const handleVisibility = useCallback((nodeId, visible) => {
    setVisibleIds((current) => {
      if (current.has(nodeId) === visible) return current;
      const next = new Set(current);
      if (visible) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  }, []);

  /**
   * Which pages get an engine: what the reader can see, then whatever sits
   * nearest to the focused page, up to the cap. Distance rather than a
   * least-recently-used list, so the set only depends on where the reader is
   * now and scrolling back and forth cannot thrash it.
   */
  const activeIds = useMemo(() => {
    const focusedIndex = Math.max(0, nodeIds.indexOf(focusedId));
    const ranked = nodeIds
      .map((id, index) => ({ id, index, visible: visibleIds.has(id) }))
      .sort((left, right) => {
        if (left.id === focusedId) return -1;
        if (right.id === focusedId) return 1;
        if (left.visible !== right.visible) return left.visible ? -1 : 1;
        return (
          Math.abs(left.index - focusedIndex) -
          Math.abs(right.index - focusedIndex)
        );
      });
    const active = new Set(
      ranked.slice(0, MAX_LIVE_PAGES).map((entry) => entry.id),
    );
    // Keep the component master editable while its child is selected in a host.
    const sourceId = selectedInstanceChild?.sourceCanvasId;
    const sourcePageId = nodes.find(
      (node) =>
        node.id === sourceId || node.data?.editorDoc?.canvasId === sourceId,
    )?.id;
    if (sourcePageId && nodeIds.includes(sourcePageId)) {
      active.add(sourcePageId);
    }
    return active;
  }, [nodeIds, focusedId, visibleIds, selectedInstanceChild, nodes]);

  // A collaborator's brush stroke, replayed into whichever open page holds
  // that layer. Nothing is queued: a stroke only means something against the
  // picture it was painted on, so one for a page that is not open is dropped
  // rather than applied later to a document it was never about.
  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    void import("../collab/stroke_bus.js").then(({ onRemoteStroke }) => {
      if (cancelled) return;
      detach = onRemoteStroke((stroke) => {
        for (const entry of enginesRef.current.values()) {
          const held = entry?.engine
            ?.getDocument()
            ?.nodes.some((node) => node.id === stroke.nodeId);
          if (held) {
            entry.engine.replayMaskStroke(stroke);
            return;
          }
        }
      });
    });
    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  const engine = enginesRef.current.get(focusedId)?.engine ?? null;

  /** The focused page's engine — the only document guides live in. */
  const focusedPageEngine = useCallback(
    () => enginesRef.current.get(focusedId)?.engine ?? null,
    [focusedId],
  );

  const {
    showRulers, toggleRulers, showGuides, toggleGuides,
    selectedGuideId, setSelectedGuideId,
    handleCreateGuide, handleMoveGuide, handleRemoveGuide, handleClearGuides,
    commentsOpen, setCommentsOpen, commentMode, closeComments,
    toggleCommentsPanel, toggleCommentMode,
    handleCreateComment, handleReplyComment, handleResolveComment, handleDeleteComment,
    findReplaceOpen, openFindReplace, closeFindReplace, focusFindMatch, applyFindReplaceDoc,
  } = useEditorDocumentAids({ focusedPageEngine, bump });

  const beginInstanceCameraAdjustment = (instanceId) => {
    if (!EDITOR_BETA_ENABLED) return;
    const node = engine
      ?.getDocument()
      ?.nodes.find((item) => item.id === instanceId);
    if (!node || node.instance?.overrides?.viewLocked === true) return;
    setAdjustingInstance({
      instanceId,
      canvasId: focusedId,
      baseline: getInstanceCamera(node.instance),
    });
  };
  const finishInstanceCameraAdjustment = useCallback(
    (cancel = false) => {
      if (!adjustingInstance) return;
      const targetEngine = enginesRef.current.get(
        adjustingInstance.canvasId,
      )?.engine;
      const node = targetEngine
        ?.getDocument()
        ?.nodes.find((item) => item.id === adjustingInstance.instanceId);
      if (cancel && node) {
        let instance = clearInstanceCamera(node.instance);
        if (adjustingInstance.baseline)
          instance = setInstanceCamera(instance, adjustingInstance.baseline);
        targetEngine.updateNode(node.id, { instance }, { commit: false });
      } else if (!cancel) {
        targetEngine?.commit("editor.history.entry.layer");
      }
      setAdjustingInstance(null);
    },
    [adjustingInstance],
  );
  useEffect(() => {
    if (!adjustingInstance || adjustingInstance.canvasId === focusedId) return;
    enginesRef.current
      .get(adjustingInstance.canvasId)
      ?.engine?.commit("editor.history.entry.layer");
    setAdjustingInstance(null);
  }, [adjustingInstance, focusedId]);
  useEffect(() => {
    if (!adjustingInstance) return undefined;
    const finishOutside = (event) => {
      if (event.button !== 0) return;
      const selector = `[data-instance-id="${adjustingInstance.instanceId}"]`;
      if (event.target.closest?.(selector)) return;
      const instanceBox = document
        .querySelector(
          `[data-testid="editor-canvas-instance"][data-instance-id="${adjustingInstance.instanceId}"]`,
        )
        ?.getBoundingClientRect();
      if (
        instanceBox &&
        event.clientX >= instanceBox.left &&
        event.clientX <= instanceBox.right &&
        event.clientY >= instanceBox.top &&
        event.clientY <= instanceBox.bottom
      )
        return;
      event.stopPropagation();
      finishInstanceCameraAdjustment(false);
    };
    const finishFromKey = (event) => {
      if (event.key !== "Escape" && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      finishInstanceCameraAdjustment(event.key === "Escape");
    };
    document.addEventListener("click", finishOutside, true);
    document.addEventListener("keydown", finishFromKey, true);
    return () => {
      document.removeEventListener("click", finishOutside, true);
      document.removeEventListener("keydown", finishFromKey, true);
    };
  }, [adjustingInstance, finishInstanceCameraAdjustment]);
  const aiRepairDownload = engine?.getAiRepairDownload?.() ?? null;
  const doc = engine?.getDocument() ?? null;
  const canvasType = doc ? getCanvasType(doc) : "design";
  const workbench = getWorkbench(EDITOR_BETA_ENABLED ? canvasType : "design");
  const hasDoc = Boolean(doc);
  const tool = engine?.getTool() ?? TOOL.SELECT;
  const color = engine?.getColor() ?? null;
  const zoom = engine?.getZoom() ?? 1;
  const grid = engine?.getGrid?.() ?? null;
  const snappingEnabled = engine?.getSnappingEnabled?.() !== false;
  const toggleSnapping = useCallback(() => {
    if (multi) {
      for (const entry of enginesRef.current.values()) {
        entry.engine?.toggleSnapping?.();
      }
    } else {
      engine?.toggleSnapping?.();
    }
    bump();
  }, [engine, multi]);
  /**
   * Turning snapping on also surfaces the grid overlay: snapping to an
   * invisible grid reads as a bug, and the overlay is the only thing that
   * tells the user which lines the drag is obeying. Turning it off leaves the
   * overlay alone.
   */
  const toggleSnapToGrid = useCallback(() => {
    setSnapToGrid((previous) => {
      const next = !previous;
      void setSetting(SNAP_TO_GRID_SETTING, next);
      if (next) {
        const nextGrid = grid
          ? { ...grid, enabled: true }
          : { enabled: true, size: 32 };
        if (multi) {
          for (const entry of enginesRef.current.values()) {
            entry.engine?.setGrid?.(nextGrid);
          }
        } else {
          engine?.setGrid?.(nextGrid);
        }
        bump();
      }
      return next;
    });
  }, [bump, engine, grid, multi]);
  const selected = engine?.getSelected() ?? null;
  const mediaErrors = engine?.getMediaErrors?.() ?? null;
  const rawMediaError = selected
    ? (engine?.getMediaError?.(selected.id) ??
      (mediaErrors instanceof Map
        ? mediaErrors.get(selected.id)
        : mediaErrors?.[selected.id]))
    : null;
  const mediaError = rawMediaError ? t("editor.media.loadFailed") : null;
  const otherMediaError = !mediaError
    ? Object.values(mediaErrors ?? {}).find(Boolean)
    : null;
  const otherMediaErrorText = otherMediaError
    ? t("editor.media.loadFailed")
    : null;
  const selectedGroup = engine?.getSelectedGroup?.() ?? null;
  /**
   * Auto Mask is supported in all modes.
   */
  const autoMaskSupported = true;
  const selectedIds = engine?.getSelectedIds() ?? [];
  const canCombineSelection = engine?.canCombineSelection() ?? false;
  const backgroundSelected = engine?.isBackgroundSelected() ?? false;
  const isolationGroupId = engine?.getIsolationGroupId() ?? null;
  const maskEdit = engine?.getMaskEdit() ?? null;
  const lasso = engine?.getLasso() ?? null;
  /** A finished Object Selection / Remove scribble the model has yet to see. */
  const pendingObjectStroke = engine?.getPendingObjectStroke?.() ?? null;
  const presentationHistory = usePresentationHistory(
    presentationId,
    engine,
    nodeIds,
  );
  const { canUndo, canRedo } = presentationHistory;
  const {
    mobileLayersExpanded, mobilePropertiesExpanded, setMobileLayersExpanded,
    setMobilePropertiesExpanded, mobileCanvasGestures,
    onMobilePanelPointerDownCapture, onMobilePanelPointerMoveCapture,
    onMobilePanelPointerUpCapture, onMobilePanelPointerCancelCapture,
    onMobilePanelClickCapture,
  } = useEditorMobilePanels({
    isNarrow, engine, multi, setEditorCamera, freeStageRef, editorRootRef,
    panGestureRef, spaceRef, undo: presentationHistory.undo, redo: presentationHistory.redo,
  });
  /** The selected (blue) Puppet Warp pin, read straight from the engine. */
  const puppetPinId = engine?.getSelectedPuppetPin?.() ?? null;
  const puppetRotation = puppetPinId
    ? (engine?.getPuppetPinRotation?.(puppetPinId) ?? 0)
    : 0;

  // The workspace ground is project state; frame paint belongs to each document.
  const canvasBackgroundColor =
    useDesignStore((state) => state.canvasBackgroundColor) ?? WORKSPACE_BACKGROUND;
  const layers = doc ? doc.nodes : [];
  const setCanvasBackgroundColor = useDesignStore(
    (state) => state.setCanvasBackgroundColor,
  );
  const [canvasBackgroundSelected, setCanvasBackgroundSelected] = useState(false);

  useEffect(() => {
    if (selected || selectedIds.length > 0 || selectedGroup) {
      setCanvasBackgroundSelected(false);
    }
  }, [selected, selectedIds.length, selectedGroup]);

  const isFrameSelected = Boolean(
    !doc?.isCanvasRoot &&
    focusedId &&
    !selected &&
    !selectedGroup &&
    !canvasBackgroundSelected,
  );

  const { freeLayouts, layoutById, readySignature, positionSignature } = useEditorArtboardLayouts({
    multi, nodeIds, nodes, enginesRef, editorArtboardLayouts, presentationId,
    presentationWidth: presentationOwner?.data.presentation.width,
    presentationHeight: presentationOwner?.data.presentation.height,
  });

  const frameLayout = layoutById.get(focusedId) ?? {
    x: FREE_PADDING,
    y: FREE_PADDING,
    width: doc?.width ?? 1024,
    height: doc?.height ?? 1024,
  };

  const frameObject = useMemo(() => {
    if (!doc || !isFrameSelected) return null;
    return {
      id: focusedId,
      name: doc.title || "Frame",
      kind: "rect",
      isFrame: true,
      x: frameLayout.x ?? 0,
      y: frameLayout.y ?? 0,
      width: doc.width ?? 1024,
      height: doc.height ?? 1024,
      lockRatio: doc.lockRatio ?? false,
      rotation: doc.rotation ?? 0,
      flipX: doc.flipX ?? false,
      flipY: doc.flipY ?? false,
      opacity: doc.opacity ?? 1,
      blendMode: doc.blendMode ?? "normal",
      fill: doc.backgroundColor || "#ffffff",
      fills: frameEditorFills(doc),
      fillOpacity: doc.fillOpacity ?? 1,
      fillHidden: doc.fillHidden ?? false,
      stroke: doc.stroke ?? null,
      strokes:
        doc.strokes ??
        (doc.stroke
          ? [
              {
                color: doc.stroke,
                opacity: doc.strokeOpacity ?? 1,
                width: doc.strokeWidth ?? 1,
              },
            ]
          : []),
      strokeWidth: doc.strokeWidth ?? 1,
      strokeAlign: doc.strokeAlign ?? "inside",
      cornerRadius: doc.cornerRadius ?? 0,
      cornerRadii: doc.cornerRadii ?? null,
      effects: doc.effects ?? [],
      clipContent: doc.clipContent ?? true,
      autoLayout: doc.autoLayout ?? null,
      layoutGrid: doc.layoutGrid ?? null,
      visible: true,
      locked: false,
    };
  }, [doc, focusedId, isFrameSelected, frameLayout.x, frameLayout.y]);

  /**
   * Page/frame resize through the engine's document path.
   *
   * The document operation resolves page and child geometry together; one
   * update preserves preview options and creates one undo entry on commit.
   */
  const applyPageResize = useCallback(
    (nextW, nextH, options = {}) => {
      const current = engine?.getDocument?.();
      if (!current) return;
      // Document operations resolve constraints for every resize entry point.
      // Do not reflow here again: that would apply the same delta twice.
      const next = resizePageDocument(current, nextW, nextH);
      // Same doc path as setDocumentSize: text measurement, auto-layout
      // reflow, render, history and persistence all stay in sync.
      engine.updateDocument(
        { width: next.width, height: next.height, nodes: next.nodes },
        options,
      );
      if (!multi) engine?.zoomToFit?.();
    },
    [engine, multi],
  );

  const handleMutateFrame = useCallback(
    (patch, options = {}) => {
      if (!focusedId || !doc) return;

      if (patch.x !== undefined || patch.y !== undefined) {
        const layout = layoutById.get(focusedId);
        if (layout) {
          setEditorArtboardLayout(focusedId, {
            ...layout,
            ...(patch.x !== undefined ? { x: patch.x } : {}),
            ...(patch.y !== undefined ? { y: patch.y } : {}),
          });
        }
      }

      if (patch.width !== undefined || patch.height !== undefined) {
        const nextW = patch.width ?? doc.width;
        const nextH = patch.height ?? doc.height;
        applyPageResize(nextW, nextH, options);
        const resized = engine?.getDocument?.();
        const layout = layoutById.get(focusedId);
        if (layout) {
          setEditorArtboardLayout(focusedId, {
            ...layout,
            // Preserve the chosen anchor when size and position change together.
            ...(patch.x !== undefined ? { x: patch.x } : {}),
            ...(patch.y !== undefined ? { y: patch.y } : {}),
            width: resized?.width ?? nextW,
            height: resized?.height ?? nextH,
          });
        }
      }

      const docPatch = {};
      for (const [key, val] of Object.entries(patch)) {
        if (key === "x" || key === "y" || key === "width" || key === "height") continue;
        if (key === "fill") {
          docPatch.backgroundColor = val;
        } else {
          docPatch[key] = val;
        }
      }

      if (patch.fills !== undefined && patch.fill === undefined) {
        docPatch.backgroundColor = patch.fills?.[0]?.fill ?? patch.fills?.[0]?.color ?? "transparent";
      }
      if (Object.keys(docPatch).length > 0) {
        if (typeof engine?.updateDocument === "function") {
          engine.updateDocument(docPatch, options);
        } else if (typeof engine?.setDoc === "function") {
          engine.setDoc({ ...engine.getDocument(), ...docPatch });
        }
      }
    },
    [
      focusedId,
      doc,
      layoutById,
      engine,
      setEditorArtboardLayout,
      applyPageResize,
    ],
  );

  const propertyObject =
    selectedGroup ?? selected ?? (isFrameSelected ? frameObject : null);
  const parentNode = propertyObject?.parentId
    ? layers.find((node) => node.id === propertyObject.parentId) ?? null
    : null;
  const parentLayout = parentNode?.autoLayout ?? null;
  const parentIsFrame = Boolean(
    parentNode?.isFrame || parentNode?.kind === "frame",
  );
  const colorVariableActions = propertyObject
    ? {
        documentId: doc?.canvasId,
        variables: doc?.colorVariables ?? [],
        // Variables v2 wiring: collections, modes and typed variables are
        // document-scoped, so every action commits the focused page once.
        variablesV2: doc?.variablesV2 ?? null,
        variableActions: createVariablesPanelActions({
          getDocument: () => engine.getDocument(),
          commit: (next, options) => engine.setDoc(next, options),
          getNodeId: () => propertyObject.id,
          historyName: "editor.history.entry.variables",
        }),
        create: () => {
          const current = engine.getDocument();
          const id = crypto.randomUUID();
          const name = t("editor.variables.defaultName", {
            index: (current.colorVariables?.length ?? 0) + 1,
          });
          const next = addColorVariable(current, {
            id,
            name,
            value: propertyObject.fill,
          });
          engine.setDoc(bindColorVariable(next, propertyObject.id, id));
        },
        bind: (id) =>
          engine.setDoc(
            bindColorVariable(engine.getDocument(), propertyObject.id, id),
          ),
        update: (id, patch) =>
          engine.setDoc(updateColorVariable(engine.getDocument(), id, patch)),
      }
    : null;
  // Named styles: document-scoped paint/text/effect library. Actions commit the
  // focused page once (one undo entry), mirroring the variables wiring above.
  const styleActions = propertyObject
    ? {
        styles: doc?.styles ?? null,
        actions: createStylePanelActions({
          getDocument: () => engine.getDocument(),
          commit: (next, options) => engine.setDoc(next, options),
          getNodeId: () => propertyObject.id,
          historyName: "editor.history.entry.styles",
        }),
      }
    : null;
  const activeIndex = selected
    ? layers.findIndex((layer) => layer.id === selected.id)
    : -1;

  const pageTitle = useCallback(
    (nodeId = focusedId, index = 0) => {
      const targetId = nodeId || focusedId;
      const node = nodes.find((candidate) => candidate.id === targetId);
      return (
        node?.data?.label ||
        node?.data?.title ||
        `${t("editor.pages.page")} ${index + 1}`
      );
    },
    [nodes, focusedId, t],
  );
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
  }, []);
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
  }, [focusedId]);
  useEffect(() => {
    if (selected?.id) setSelectedInstanceChild(null);
  }, [selected?.id]);
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
  const selectedCanvasIds = getSelectedCanvasPageIds(
    nodeIds,
    enginesRef.current,
    { focusedCanvasId: focusedId, selectedInstanceChild },
  );
  const panelLayout = editorPanelLayout({
    stageWidth: editorWidth,
    swapped: swapPanels,
  });
  const propertiesOpen = Boolean(
    !historyOpen &&
    (workbench.inspectorAlwaysOpen ||
      selected ||
      nestedNode ||
      selectedGroup ||
      backgroundSelected ||
      canvasBackgroundSelected ||
      selectedCanvasIds.length > 0 ||
      (tool &&
        tool !== TOOL.SELECT &&
        tool !== "perspective" &&
        tool !== "distort")),
  );
  // Use the same rendered-panel rule for Fit and for the panel render sites.
  const { singlePanelColumn, layersPanelShown } = editorPanelVisibility({
    multi,
    wide: panelLayout.wide,
    wideLayersRail: workbench.wideLayersRail,
    sceneInspector: workbench.sceneInspector,
    editorWidth,
    propertiesOpen,
    historyOpen,
  });
  /** What a page's fit keeps clear, read by the engine at fit time. */
  const getFitInsets = useCallback(
    (stageWidth) =>
      editorPageFitInsets({
        stageWidth,
        swapped: swapPanels,
        panelWide: panelLayout.wide,
        layersPanelShown,
        propertiesOpen,
        historyOpen,
      }),
    [
      swapPanels,
      panelLayout.wide,
      layersPanelShown,
      propertiesOpen,
      historyOpen,
    ],
  );
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
    [focusedId, focusEditorPage, engine],
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
    [focusedId, focusEditorPage, engine],
  );

  useEffect(() => {
    if (!focusedId) return;
    pendingCanvasSelectionRef.current.clearIfCanvasChanges(focusedId);
    const targetEntry = enginesRef.current.get(focusedId);
    if (targetEntry?.ready && targetEntry.engine) {
      pendingCanvasSelectionRef.current.consume(focusedId, targetEntry.engine);
    }
  }, [focusedId, engine]);
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
    [focusedId, nodeIds, multi, focusEditorPage, openExistingEditorPage],
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
  }, [focusedId, nodeIds, focusEditorPage, openExistingEditorPage]);
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
    ],
  );
  useEffect(() => {
    // A pie opened in Design must not survive into the 3D surface, where its
    // overlay is not mounted to catch the keyup that would close it.
    if (!workbench.pieMenu) setPieMenu(null);
  }, [workbench]);
  /** Bitmap access for thumbnails and preset swatches; stable across renders. */
  const getNodeBitmap = useCallback(
    (node) => engine?.getNodeBitmap(node) ?? null,
    [engine],
  );
  /** Mask bitmap access for layer mask preview; stable across renders. */
  const getNodeMask = useCallback(
    (node) => engine?.getNodeMask(node) ?? null,
    [engine],
  );

  const handleOpenSvgEdit = useCallback(
    (targetNode = null) => {
      const node = targetNode || selected || engine?.getSelected?.();
      if (!node) return;
      const svg =
        engine?.getNodeSvg?.(node.id) || engine?.getSelectedSvg?.() || "";
      setSvgEditModal({
        isOpen: true,
        node,
        svgString: svg,
      });
    },
    [engine, selected],
  );

  const handleApplySvgEdit = useCallback(
    async (newSvg) => {
      const targetNode = svgEditModal.node;
      if (!targetNode || !engine?.updateNodeFromSvg) return;
      try {
        await engine.updateNodeFromSvg(targetNode.id, newSvg);
      } catch (err) {
        console.error("Failed to apply SVG edit:", err);
      }
    },
    [engine, svgEditModal.node],
  );

  const workspaceDocs = useMemo(() => {
    if (!multi || nodeIds.length === 0) return [];
    return nodeIds
      .map((id) => {
        const liveEngine = enginesRef.current.get(id)?.engine;
        const liveDoc = liveEngine?.getDocument?.();
        if (liveDoc) return workspaceRenderDocument(liveDoc, id);
        const canvasDoc = nodes.find((n) => n.id === id)?.data?.editorDoc ??
          nodes.find((n) => n.id === id)?.data?.canvasDoc;
        if (canvasDoc) return workspaceRenderDocument(canvasDoc, id);
        const rawNode = nodes.find((n) => n.id === id);
        if (rawNode) {
          return {
            id,
            title: rawNode.data?.label || rawNode.name || "Artboard",
            width: rawNode.width || 1024,
            height: rawNode.height || 1024,
            nodes: rawNode.data?.nodes || [],
            backgroundColor: rawNode.data?.backgroundColor || "#ffffff",
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [multi, nodeIds, nodes, engineVersion]);

  const workspaceSpatialIndex = useMemo(() => {
    if (!workspaceDocs.length) return null;
    const index = new SpatialIndex();
    for (const doc of workspaceDocs) {
      const docId = doc.id || doc.canvasId;
      const layout = (docId ? layoutById.get(docId) : null) ?? {
        x: FREE_PADDING,
        y: FREE_PADDING,
      };
      const offsetX = layout.x ?? 0;
      const offsetY = layout.y ?? 0;
      if (!doc.isCanvasRoot) index.insert({
        id: `frame-${docId}`,
        minX: offsetX,
        minY: offsetY,
        maxX: offsetX + (doc.width || 1024),
        maxY: offsetY + (doc.height || 1024),
        isFrame: true,
        docId: docId,
      });
      for (const node of doc.nodes || []) {
        if (!node) continue;
        const nx = (node.x ?? 0) + offsetX;
        const ny = (node.y ?? 0) + offsetY;
        const nw = node.width ?? 0;
        const nh = node.height ?? 0;
        index.insert({
          id: node.id,
          minX: nx,
          minY: ny,
          maxX: nx + nw,
          maxY: ny + nh,
          node,
          docId: docId,
        });
      }
    }
    return index;
  }, [workspaceDocs, layoutById]);

  useWorkspaceChrome({
    enabled: multi,
    canvasRef: workspaceChromeRef,
    stageRef: freeStageRef,
    engine,
    layout: frameLayout,
  });

  const { status: workspaceRendererStatus } = useWorkspaceSkia({
    enabled: multi,
    canvasRef: workspaceCanvasRef,
    stageRef: freeStageRef,
    docs: workspaceDocs,
    liveEngine: engine,
    livePageId: focusedId,
    backgroundColor: canvasBackgroundColor,
    layouts: layoutById,
    subscribeCamera: true,
    revision: `${positionSignature}|${engineVersion}`,
    spatialIndex: workspaceSpatialIndex,
    resolveImageUrl: useCallback((node) => {
      if (!node) return null;
      for (const entry of enginesRef.current.values()) {
        const bmp = entry?.engine?.getNodeBitmap?.(node);
        if (bmp?.src) return bmp.src;
        const png = entry?.engine?.exportNodePng?.(node.id);
        if (png) return png;
      }
      return node?.dataUrl || node?.url || node?.src || node?.fill || null;
    }, []),
  });

  /** Generated images open as separate candidate pages, preserving the source. */
  const handleGroupGeneratedOutput = useCallback(
    async (result) => {
      const output = await materializeEditorGeneratedOutput({ result });
      if (output?.candidateNodeId) {
        openExistingEditorPage(output.candidateNodeId);
      }
      return output;
    },
    [materializeEditorGeneratedOutput, openExistingEditorPage],
  );

  // AI raster actions (background removal, lasso, object select/remove, region
  // cutout, AI repaint) and their busy/error/progress flags live in their own
  // hook (plan-design-editor-fixes A5-2). It must run before useEditorApply,
  // which reads maskBusy to refuse an apply mid-matting.
  const {
    removeBackground,
    upscaleImage,
    upscaleBusy,
    upscaleProgress,
    retouchImage,
    retouchBusy,
    retouchError,
    retouchErrorSeq,
    runLasso,
    runLassoCutout,
    runRegionCutout,
    runRepaint,
    runOutpaint,
    runSelectionRepaint,
    selectSubject,
    maskBusy,
    maskError,
    maskProgress,
    lassoBusy,
    repaintBusy,
    repaintStatus,
    selectionRepaintBusy,
    mattingDownload,
    downloadMattingModel,
    cancelMattingModelDownload,
    cancelAiGeneration,
  } = useEditorRaster({
    engine,
    selected,
    lasso,
    pendingObjectStroke,
    sourceWorkflowNodeId: focusedId,
    onMaterializeGeneratedOutput: handleGroupGeneratedOutput,
  });

  const {
    splitLayers,
    splitLayersBusy,
    splitLayersError,
    clearSplitLayersError,
  } = useEditorLayerSplit({
    engine,
    selected,
  });

  const {
    applyError, setApplyError, regionHint, regionHintFading, regionHintTone,
    persistQuota, setPersistQuota, savedNotice, setSavedNotice,
    imageActionError, setImageActionError, aiErrorText, setAiErrorText,
    exportNotice, setExportNotice,
  } = useEditorFeedback({
    engine, t, splitLayersError, clearSplitLayersError, maskError, retouchError, retouchErrorSeq,
  });

  // Save/export/exit actions (apply, .voo save, export, close) live in their
  // own hook (plan-design-editor-fixes A5); dirtyIds is shared with the exit
  // dialog below.
  const {
    apply,
    saveVooDocument,
    openVooDocument,
    newVooDocument,
    handleSaveAndExit,
    exportImage,
    cancelExport,
    dirtyIds,
  } = useEditorApply({
      enginesRef,
      snapshotsRef,
      nodeIds,
      applyImageEdits,
      closeImageEditor,
      streamingPreview,
      engine,
      pageTitle,
      busy,
      maskBusy,
      exitPrompt,
      exportFormat,
      exportQuality,
      exportScale,
      exportRange,
      selectedIds,
      setBusy,
      setApplyError,
      setSavedNotice,
      setExitPrompt,
      setExportOpen,
      setHistoryOpen,
      resolveCanvas,
      onExportWarnings: (warnings) => setExportNotice(warnings || true),
    });

  // Unsaved documents keep a local draft copy so Recents can reopen them.
  useDraftAutosave({ enginesRef, snapshotsRef, revision: `${engineVersion}|${canvasBackgroundColor}` });

  /**
   * Tool selection. Shape tools stay armed across draws — a row of
   * rectangles draws without re-picking the tool; text drops back to Select
   * once its box is placed, since the box opens for typing straight away.
   * Everything else arms a mode the user can escape with V.
   */
  const runTool = useCallback(
    (next) => {
      if (!engine) return;
      if (next === TOOL.SELECT_REGION && engine.getPixelSelection?.()?.bounds) {
        if (engine.beginSelectionTransform?.()) {
          return;
        }
      }
      engine.setTool(next);
    },
    [engine],
  );

  /**
   * Escape dismisses the leave-confirmation dialog.
   *
   * Bound here rather than left to the shortcut hook because Escape no longer
   * reaches `requestExit`: the tools own that key now. A modal still has to
   * answer to it — dismissing this dialog means *staying* in the editor, which
   * is the opposite of the exit the tools were being thrown out by — and the
   * capture phase keeps the press from also clearing the selection on the
   * canvas behind the scrim.
   */
  useEffect(() => {
    if (!visible || !exitPrompt) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setExitPrompt(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [exitPrompt, visible]);

  const insertImageFile = useCallback(
    async (file, point) => {
      await engine?.insertImage(file, point);
    },
    [engine],
  );

  const { fileDragOver, dropHandlers } = useEditorDnd({
    nodeId: focusedId,
    engine,
    insertImageFile,
    onOpenVoo: openVooDocument,
    onInsertError: () => setApplyError("editor.saveFailed"),
  });

  // A frame's own name; an empty name returns it to the default.
  const renamePage = useCallback(
    (id, name) => {
      if (renameEditorPage) {
        renameEditorPage(id, name);
      } else {
        useDesignStore.getState().updateNodeData(id, { label: name });
      }
    },
    [renameEditorPage],
  );

  const handleDuplicateCanvas = useCallback(
    (targetNodeId) => {
      const target = targetNodeId || focusedId;
      if (target && duplicateEditorPage) {
        duplicateEditorPage(target, {
          copySuffix: t("editor.canvas.copySuffix"),
          defaultLabel: t("editor.canvas.defaultLabel"),
        });
      }
    },
    [duplicateEditorPage, focusedId, t],
  );

  const handleAddCanvas = useCallback(
    (refNodeId) => {
      const refId =
        refNodeId ||
        focusedId ||
        (nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null);
      const engineState = refId ? enginesRef.current.get(refId) : null;
      const liveDoc = engineState?.engine?.getDocument?.();
      const customSize =
        liveDoc && liveDoc.width > 0 && liveDoc.height > 0
          ? {
              width: Math.round(liveDoc.width),
              height: Math.round(liveDoc.height),
            }
          : engineState?.width > 0 && engineState?.height > 0
            ? {
                width: Math.round(engineState.width),
                height: Math.round(engineState.height),
              }
            : null;
      return addEditorPage({ ...customSize });
    },
    [focusedId, nodeIds, addEditorPage],
  );

  /**
   * Put a component's frame beside this one and swap the host's document for
   * the version that holds its instance. Focus stays on this frame.
   */
  /**
   * Put a component's frame beside this one and swap the host's document for
   * the version that holds its instance. Focus stays on this frame.
   */
  const commitComponent = useCallback(
    ({ doc, master, instanceId, label }) => {
      if (!engine || !focusedId) return null;
      const hostId = focusedId;
      const previousDoc = engine.getDocument();
      const masterId = presentationId
        ? handleAddCanvas(hostId)
        : createComponentPage(hostId, {
            previousDoc,
            doc,
            master,
            label,
          });
      if (!masterId) return null;
      engine.setDoc(doc, { name: label });
      engine.selectExactly([instanceId]);
      if (presentationId) {
        useDesignStore
          .getState()
          .updateNodeData(masterId, { editorDoc: master, label });
        focusEditorPage(hostId);
      }
      return instanceId;
    },
    [
      engine,
      focusedId,
      presentationId,
      handleAddCanvas,
      createComponentPage,
      focusEditorPage,
    ],
  );

  const handleCreateComponent = useCallback(() => {
    if (!engine) return;
    const host = engine.getDocument();
    const ids = engine.getSelectedIds();
    if (ids.length === 0 || getCanvasType(host) === "3d") return;
    const label = `${t("editor.component.name")} ${nodeIds.length}`;
    let result;
    try {
      result = extractComponent(host, ids, { name: label });
    } catch (error) {
      console.error("[Design Editor] Create component failed", error);
      setApplyError(true);
      return;
    }
    commitComponent({
      doc: result.doc,
      master: result.master,
      instanceId: result.instance.id,
      label,
    });
  }, [engine, nodeIds.length, commitComponent, t]);

  /** Figma's "Detach instance": the component's layers replace the instance. */
  const handleDetachInstance = useCallback(
    (instanceId) => {
      if (!engine) return;
      const host = engine.getDocument();
      const node = host.nodes.find((entry) => entry.id === instanceId);
      const source = node ? resolveCanvas(node.sourceCanvasId) : null;
      if (node?.kind !== "canvasInstance" || !source) return;
      const { doc, ids } = detachInstance(host, instanceId, source);
      engine.setDoc(doc, { name: t("editor.component.detach") });
      engine.selectExactly(ids);
    },
    [engine, resolveCanvas, t],
  );

  const { mediaImportBusy, mediaImportError, mediaInputRef, importMediaFiles, openMediaPicker, handleMediaDrop } = useEditorMediaImport({
    engine, enginesRef, focusedId, focusEditorPage, openVooDocument, t,
  });

  const handleCanvasTypeChanged = useCallback(
    (_id, type) => {
      if (_id === focusedId) {
        void type;
      }
    },
    [focusedId],
  );

  const handleDeleteCanvas = useCallback(
    (targetNodeId) => {
      const target = targetNodeId || focusedId;
      if (target && nodeIds.length > 1) {
        if (deleteEditorPage(target) === false) {
          setApplyError("editor.component.deleteReferenced");
        }
      }
    },
    [deleteEditorPage, focusedId, nodeIds.length],
  );

  // --------------------------------------------------------------------------
  // Shared free-canvas camera for every frame count.

  const { fitAll, zoomSharedStep, zoomSharedHundred } = useEditorSharedCamera({
    multi, visible, freeStageRef, artboardLayerRef, freeGridRef,
    freeLayouts, layoutById, nodeIds, focusedId, presentationId, swapPanels,
    layersPanelShown, propertiesOpen, historyOpen, enginesRef, readySignature,
    editorRememberCamera, editingGroupId, getGroupCamera, saveGroupCamera,
    pendingArtboardFitId, pendingNavigationRef, setEditorCamera,
  });

  const toggleGrid = useCallback(() => {
    const next = engine?.getGrid?.() ? null : { enabled: true, size: 32 };
    if (multi) {
      for (const entry of enginesRef.current.values()) entry.engine?.setGrid?.(next);
    } else engine?.setGrid?.(next);
    bump();
  }, [engine, multi]);

  const {
    commandPaletteOpen, toggleCommandPalette, closeCommandPalette, paletteActions, runPaletteCommand,
  } = useEditorPaletteActions({
    engine, runTool, handleCreateComponent, toggleGrid, presentationHistory, multi,
    zoomSharedStep, zoomSharedHundred, fitAll, toggleRulers, toggleGuides,
    handleClearGuides, toggleSnapToGrid, toggleCommentsPanel, toggleCommentMode,
    openFindReplace, setExportOpen, setShortcutsOpen,
  });

  const { onFreePointerDown, onFreePointerMove, onFreePointerUp,
    onTitlePointerDown, onTitlePointerMove, onTitlePointerUp, onArtboardBodyPointerDown,
  } = useEditorCanvasGestures({
    multi, visible, freeStageRef, spaceRef, panGestureRef, enginesRef,
    layoutById, cameraZoom, tool, focusedId, focusEditorPage,
    handleFocusCanvas, setCanvasBackgroundSelected,
  });
  // Ref populated by ToolPropertiesSection so the X shortcut can swap colours.
  const swapColorsRef = useRef(null);

  // Keyboard zoom steps the shared camera when several pages are open, and the
  // focused page's own viewport otherwise.
  // Components are made from Design and Motion frames, not from 3D scenes.
  const canCreateComponent = getCanvasType(doc) !== "3d";

  useEditorShortcuts({
    engine,
    enabled: visible && !welcomeOpen,
    // Any open overlay must pause the capture-phase shortcut hook, otherwise Esc
    // "leaves" the canvas (unwinding the tool/selection) while merely dismissing
    // a popup, and single-key tool shortcuts fire behind open modals. Design.md
    // §10: Esc exits the current operation one layer at a time, then stops.
    modalOpen:
      Boolean(presentation.preview) ||
      exportOpen ||
      Boolean(contextMenu) ||
      shortcutsOpen ||
      svgEditModal.isOpen ||
      commandPaletteOpen ||
      Boolean(pieMenu),
    targetNodeId: focusedId,
    tool,
    onTool: runTool,
    onApply: () => saveVooDocument({ saveAs: false }),
    onSave: () => saveVooDocument({ saveAs: false }),
    onSaveAs: () => saveVooDocument({ saveAs: true }),
    onOpen: () => openVooDocument(),
    onNew: newVooDocument,
    onUndo: presentationHistory.undo,
    onRedo: presentationHistory.redo,
    onSaveAndExit: handleSaveAndExit,
    onZoomStep: multi ? zoomSharedStep : undefined,
    onZoomToFit: multi ? fitAll : undefined,
    onZoomToHundred: multi ? zoomSharedHundred : undefined,
    onToggleShortcuts: () => setShortcutsOpen((open) => !open),
    onToggleRulers: toggleRulers,
    onToggleGuides: toggleGuides,
    onClearGuides: handleClearGuides,
    onToggleSnapToGrid: toggleSnapToGrid,
    onToggleComments: toggleCommentsPanel,
    onToggleCommentMode: toggleCommentMode,
    onToggleCommandPalette: toggleCommandPalette,
    onOpenFindReplace: openFindReplace,
    selectedGuideId,
    onDeleteGuide: handleRemoveGuide,
    onSwapColors: () => swapColorsRef.current?.(),
    onDeleteCanvas: multi ? () => handleDeleteCanvas(focusedId) : undefined,
    onDuplicateCanvas: multi
      ? () => handleDuplicateCanvas(focusedId)
      : undefined,
    onDeselectCanvas: multi
      ? () => {
          enginesRef.current.get(focusedId)?.engine?.select?.(null);
          focusEditorPage(null);
        }
      : undefined,
    onCreateComponent: canCreateComponent ? handleCreateComponent : undefined,
    onDetachInstance: handleDetachInstance,
    onOpenPieMenu: (family, position, triggerCode) => {
      // The radial belongs to the Design surface. In 3D the viewport owns the
      // W/E/R keys, and a pie whose component never mounts could not be closed
      // by its own keyup listener.
      if (!workbench.pieMenu) return;
      setPieMenu((prev) => (prev ? prev : { family, position, triggerCode }));
    },
    onClosePieMenu: () => setPieMenu(null),
  });

  const { runAutoEnhance, runPortraitRetouch } = useEditorImageActions({
    engine, enginesRef, snapshotsRef, retouchImage, setImageActionError,
  });

  if (nodeIds.length === 0) return null;
  const exportDocument = exportOpen ? engine?.getDocument?.() : null;
  const exportPage = exportDocument ? effectivePage(exportDocument) : null;
  const exportSelectedNodes =
    exportDocument && selectedIds.length
      ? exportDocument.nodes.filter((node) => selectedIds.includes(node.id))
      : [];
  const exportSelectionBounds =
    exportSelectedNodes.length > 0
      ? selectionBounds(exportSelectedNodes)
      : null;

  /** 0..100 when the local model reports a definite download/encode share. */
  const aiProgressPct = (progress) => {
    if (!progress) return null;
    if (progress.phase === "downloading" && progress.total > 0) {
      return Math.min(
        100,
        Math.round((progress.loaded / progress.total) * 100),
      );
    }
    if (progress.phase === "cached") return 100;
    return null;
  };

  /** Human label for the running AI phase (local cutout, matting, repaint). */
  const aiProgressLabel = (progress) => {
    if (!progress) return t("editor.aiProgress.working");
    switch (progress.phase) {
      case "runtime":
        return t("editor.aiProgress.loadingRuntime");
      case "downloading":
        return progress.total > 0
          ? t("editor.aiProgress.downloading", {
              pct: Math.min(
                100,
                Math.round((progress.loaded / progress.total) * 100),
              ),
            })
          : t("editor.aiProgress.downloading", { pct: "…" });
      case "compiling":
        return t("editor.aiProgress.compiling");
      case "starting":
        // An installed-but-stopped managed backend is booting inside the
        // submit call: the wait is real and the overlay has to name it, or a
        // cold start reads as a dead canvas (contract §6.6).
        return t("stage.starting");
      case "running":
        return t("editor.aiProgress.running");
      case "encoding":
        return t("editor.aiProgress.encoding");
      case "tiling":
        // Large-image upscales run tile by tile; the count is the only
        // progress they can report, and a bare "Working..." for minutes is
        // worse than a number.
        return t("editor.aiProgress.tiling", {
          tile: progress.tile ?? 0,
          tiles: progress.tiles ?? 0,
        });
      case "cached":
        return t("editor.aiProgress.ready");
      case "fallback":
        return t("editor.aiProgress.fallback", {
          provider: progress.providerName || progress.providerId || "",
        });
      default:
        return t("editor.aiProgress.working");
    }
  };

  // A narrow single-page editor places Properties or History in the Layers
  // column; side-by-side pages can show both panels and reserve both sides.
  const streamingPageId = streamingPreviewNodeId || focusedId;
  const streamingPageDoc = enginesRef.current
    .get(streamingPageId)
    ?.engine?.getDocument?.();
  const streamingPageSize =
    Number.isFinite(streamingPageDoc?.width) &&
    streamingPageDoc.width > 0 &&
    Number.isFinite(streamingPageDoc?.height) &&
    streamingPageDoc.height > 0
      ? { width: streamingPageDoc.width, height: streamingPageDoc.height }
      : layoutCanvasSize(
          nodes.find((candidate) => candidate.id === streamingPageId)?.data,
        );
  const streamingLayout = (streamingPreview !== null || (agentGenerating && !streamingPageDoc?.nodes?.length))
    ? {
        nodeId: streamingPageId,
        html: streamingPreview ?? "",
        ...streamingPageSize,
      }
    : null;
  const sidePanelSwap = singlePanelColumn ? !swapPanels : swapPanels;
  // When the layers rail is shown beside the inspector they take opposite
  // sides, so the inspector must not follow the single-column flip.
  // How many instances use each page as their main component. (Computed in instanceCounts above)
  const inspectorSwap =
    workbench.wideLayersRail && layersPanelShown ? swapPanels : sidePanelSwap;
  // Swapping sides moves the clear band the fit uses; refit into it.
  const toggleSwapPanels = () => {
    setSwapPanels((swapped) => {
      const next = !swapped;
      void saveEditorPanelLayout({ swapped: next });
      return next;
    });
    requestAnimationFrame(() => engine?.zoomToFit?.());
  };

  // When the container is wide enough (>= 696px), reserving the 376px agent dock
  // leaves at least 320px for the design editor stage. On narrower viewports (< 696px,
  // e.g. 375px mobile), the editor stops reserving the 376px dock (using right-0).
  // The design editor stays at z-50 to remain above flow-stage overlays (z-40).
  const hasDockSpace =
    containerWidth === null
      ? typeof window !== "undefined"
        ? window.innerWidth >= 900
        : true
      : containerWidth >= 696;
  const dockAgent = agentVisible && hasDockSpace;

  // The ruler reads the focused page's document coordinates: the shared camera
  // places that page at `layout * zoom + camera.pan` inside the stage, so that
  // offset is the page origin on screen. No second camera is introduced.
  const focusedLayout = layoutById.get(focusedId) ?? null;
  const documentGuides = doc ? readDocumentGuides(doc) : [];
  const documentComments = doc ? normalizeComments(doc.comments) : [];
  // Presentation playback and 3D canvases have no 2D document space to measure.
  // Rulers measure the focused document, so they are independent of the
  // free-canvas (multi-artboard) mode.
  const rulersVisible =
    Boolean(focusedId) &&
    canvasType !== "3d" &&
    !presentation.preview;
  // Comment pins share the focused document's 2D space with the rulers.
  const commentsVisible =
    Boolean(focusedId) &&
    canvasType !== "3d" &&
    !presentation.preview;

  return (
    <div
      ref={editorRootRef}
      data-testid="design-editor"
      data-agent-open={agentVisible ? "true" : "false"}
      data-properties-open={propertiesOpen ? "true" : "false"}
      data-mobile-layers-expanded={mobileLayersExpanded ? "true" : "false"}
      data-mobile-properties-expanded={mobilePropertiesExpanded ? "true" : "false"}
      aria-hidden={!visible}
      style={{ backgroundColor: canvasBackgroundColor }}
      className={`absolute bottom-0 left-0 top-0 z-50 flex flex-col overflow-hidden rounded-b-2xl ${isNarrow ? "editor-narrow" : ""} ${
        dockAgent ? "right-[376px]" : "right-0"
      } ${visible ? "" : "invisible pointer-events-none"}`}
      {...dropHandlers}
      onPointerDownCapture={(event) => {
        mobileCanvasGestures.onPointerDownCapture(event);
        onMobilePanelPointerDownCapture(event);
      }}
      onPointerMoveCapture={(event) => {
        mobileCanvasGestures.onPointerMoveCapture(event);
        onMobilePanelPointerMoveCapture(event);
      }}
      onPointerUpCapture={(event) => {
        mobileCanvasGestures.onPointerUpCapture(event);
        onMobilePanelPointerUpCapture(event);
      }}
      onPointerCancelCapture={(event) => {
        mobileCanvasGestures.onPointerCancelCapture(event);
        onMobilePanelPointerCancelCapture(event);
      }}
      onClickCapture={onMobilePanelClickCapture}
      onDropCapture={handleMediaDrop}
      onContextMenu={(event) => {
        event.preventDefault();
        const point = engine?.toDocPoint(event.clientX, event.clientY);
        if (point) {
          const hit = engine.nodeAtPoint(point);
          if (hit && !engine.getSelectedIds().includes(hit.id)) {
            engine.select(hit.id);
          }
        }
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div
        data-open-guard={openGuard ? "on" : "off"}
        className={`relative min-h-0 flex-1 overflow-hidden ${
          openGuard ? "editor-open-guard" : ""
        }`}
      >
        {multi ? (
          // Native focus scrolling must not compete with the camera transform or
          // dismiss page menus. Unlike hidden, clip disables programmatic scroll.
          <div
            ref={freeStageRef}
            data-testid="editor-pages"
            className="absolute inset-0 overflow-clip"
            onPointerDownCapture={onFreePointerDown}
            onPointerMove={onFreePointerMove}
            onPointerUp={onFreePointerUp}
            onPointerCancel={onFreePointerUp}
            onPointerLeave={() => sendCollabCursor(null)}
            onAuxClick={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
          >
            <div
              aria-hidden
              ref={freeGridRef}
              data-testid="editor-free-grid"
              className="pointer-events-none absolute inset-0 transition-opacity duration-200"
              style={{
                opacity: cameraZoom >= 1 && cameraZoom <= 1.5 ? 1 : 0,
                backgroundImage:
                  "radial-gradient(rgba(255, 255, 255, 0.14) 1.2px, transparent 1.2px)",
                backgroundSize: `${20 * cameraZoom}px ${20 * cameraZoom}px`,
                backgroundPosition: `${useDesignStore.getState().editorCamera?.panX || 0}px ${useDesignStore.getState().editorCamera?.panY || 0}px`,
              }}
            />
            <canvas
              ref={workspaceCanvasRef}
              data-testid="workspace-skia-canvas"
              data-renderer-status={workspaceRendererStatus}
              hidden={workspaceRendererStatus !== "ready"}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            <RemoteCursors />
            <canvas
              ref={workspaceChromeRef}
              data-testid="workspace-chrome-canvas"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            />
            <div
              ref={artboardLayerRef}
              data-testid="editor-artboards-layer"
              className="pointer-events-none absolute inset-0 will-change-transform"
              style={{
                transform: `translate3d(${
                  useDesignStore.getState().editorCamera?.panX || 0
                }px, ${useDesignStore.getState().editorCamera?.panY || 0}px, 0)`,
              }}
            >
              {nodeIds.map((nodeId, index) => {
                const layout = layoutById.get(nodeId) ?? {
                  x: FREE_PADDING,
                  y: FREE_PADDING,
                  width: 1024,
                  height: 1024,
                };
                const rect = {
                  x: layout.x * cameraZoom,
                  y: layout.y * cameraZoom,
                  width: layout.width * cameraZoom,
                  height: layout.height * cameraZoom,
                };
                return (
                  <EditorPage
                    key={nodeId}
                    nodeId={nodeId}
                    title={pageTitle(nodeId, index)}
                    componentUses={usesOfPage(nodeId)}
                    onRenamePage={renamePage}
                    pageTitleActions={
                      presentationId ? (
                        <PresentationPageMenu
                          pageId={nodeId}
                          index={index}
                          count={nodeIds.length}
                          title={pageTitle(nodeId, index)}
                          notes={
                            nodes.find((node) => node.id === nodeId)?.data
                              ?.presentationNotes ?? ""
                          }
                          onAction={presentation.pageAction}
                        />
                      ) : null
                    }
                    index={index}
                    focused={nodeId === focusedId}
                    active={activeIds.has(nodeId)}
                    mode="free"
                    rect={rect}
                    sharedZoom={cameraZoom}
                    workspaceRendererReady={workspaceRendererStatus === "ready"}
                    snapshot={snapshotsRef.current.get(nodeId) ?? null}
                    onFocus={focusEditorPage}
                    resolveCanvas={resolveCanvas}
                    selectedInstanceChild={
                      nodeId === focusedId ? selectedInstanceChild : null
                    }
                    onSelectInstanceChild={selectInstanceChild}
                    onOpenCanvasSource={openCanvasSource}
                    adjustingInstanceId={
                      nodeId === focusedId
                        ? adjustingInstance?.instanceId
                        : null
                    }
                    onAdjustView={beginInstanceCameraAdjustment}
                    onFinishAdjustView={() =>
                      finishInstanceCameraAdjustment(false)
                    }
                    onCancelAdjustView={() =>
                      finishInstanceCameraAdjustment(true)
                    }
                    onCanvasTypeChanged={handleCanvasTypeChanged}
                    onEngine={handleEngine}
                    onBeforeDispose={handleBeforeDispose}
                    onChange={bump}
                    streamingLayout={
                      streamingLayout?.nodeId === nodeId
                        ? streamingLayout
                        : null
                    }
                    onGeneratedOutput={handleGroupGeneratedOutput}
                    onVisibility={handleVisibility}
                    onRegionCutout={
                      localMattingSupported ? runRegionCutout : null
                    }
                    onAutoMask={removeBackground}
                    autoMaskBusy={maskBusy}
                    autoMaskDisabled={!autoMaskSupported}
                    onAutoEnhance={() => runAutoEnhance(nodeId)}
                    onPortraitRetouch={(strengths) =>
                      runPortraitRetouch(nodeId, strengths)
                    }
                    portraitRetouchBusy={retouchBusy}
                    onSplitLayers={splitLayers}
                    splitLayersBusy={splitLayersBusy}
                    onBodyPointerDown={(event) =>
                      onArtboardBodyPointerDown(nodeId, event)
                    }
                    titlePanHandlers={{
                      onPointerDown: (event) =>
                        onTitlePointerDown(nodeId, event),
                      onPointerMove: onTitlePointerMove,
                      onPointerUp: onTitlePointerUp,
                      onPointerCancel: onTitlePointerUp,
                    }}
                    onAddPoint={(region) => {
                      if (engine && region) {
                        const host = regionHost(engine.getDocument(), region);
                        if (host) {
                          const midX =
                            (region.x ?? 0) + (region.width ?? 0) / 2;
                          const midY =
                            (region.y ?? 0) + (region.height ?? 0) / 2;
                          const pts =
                            Array.isArray(region.points) &&
                            region.points.length > 0
                              ? [...region.points, { x: midX, y: midY }]
                              : [
                                  { x: region.x, y: region.y },
                                  { x: midX, y: midY },
                                ];
                          engine.updateNode(region.id, { points: pts });
                        }
                      }
                    }}
                    onRepaint={(region, prompt) => {
                      const host = regionHost(engine?.getDocument(), region);
                      if (host) runRepaint(host, prompt);
                    }}
                    onRepaintNode={(node, prompt, options) => {
                      if (node) void runRepaint(node, prompt, options);
                    }}
                    onRepaintSelection={(prompt) =>
                      void runSelectionRepaint(prompt)
                    }
                    onOutpaintSubmit={(node, grownRect) => {
                      if (node) void runOutpaint(node, grownRect);
                    }}
                    onAddCanvas={handleAddCanvas}
                    onDeleteCanvas={handleDeleteCanvas}
                    onDuplicateCanvas={handleDuplicateCanvas}
                    isLast={index === nodeIds.length - 1}
                    cutoutBusy={lassoBusy}
                    repaintBusy={repaintBusy || selectionRepaintBusy}
                    onUpscale={(scale) => {
                      const pageEngine =
                        enginesRef.current.get(nodeId)?.engine || engine;
                      if (pageEngine === engine) void upscaleImage(scale);
                    }}
                    upscaleBusy={upscaleBusy}
                    selectSubject={() => selectSubject(engine?.getSelected?.())}
                    onAddAdjustmentLayer={(kind, isEffect) => {
                      const pageEngine =
                        enginesRef.current.get(nodeId)?.engine || engine;
                      const pageDoc =
                        pageEngine?.getDocument?.() ||
                        snapshotsRef.current.get(nodeId)?.doc;
                      const target =
                        pageEngine?.getSelected?.() ||
                        pageDoc?.nodes?.find((n) => n.kind === "image");
                      if (isEffect && target) {
                        const starter = starterEffect(kind);
                        pageEngine?.updateNode(target.id, {
                          effects: {
                            ...(target.effects ?? {}),
                            [kind]: starter,
                          },
                        });
                        pageEngine?.commit?.();
                      } else if (target && target.kind === "image") {
                        const starter = starterAdjustment(kind);
                        pageEngine?.updateNode(target.id, {
                          adjustments: {
                            ...(target.adjustments ?? {}),
                            [kind]: starter,
                          },
                        });
                        pageEngine?.commit?.();
                      } else {
                        const starter = starterAdjustment(kind);
                        const name = t(adjustmentLabelKey(kind));
                        pageEngine?.addAdjustmentLayer(
                          kind,
                          { [kind]: starter },
                          name,
                        );
                      }
                    }}
                    onApplyPreset={(preset) => {
                      const pageEngine =
                        enginesRef.current.get(nodeId)?.engine || engine;
                      const pageDoc =
                        pageEngine?.getDocument?.() ||
                        snapshotsRef.current.get(nodeId)?.doc;
                      const target =
                        pageEngine?.getSelected?.() ||
                        pageDoc?.nodes?.find((n) => n.kind === "image");
                      if (target && pageEngine) {
                        const presetAdjustments = preset?.adjustments
                          ? structuredClone(preset.adjustments)
                          : structuredClone(preset);
                        pageEngine.updateNode(target.id, {
                          adjustments: {
                            ...(target.adjustments ?? {}),
                            ...presetAdjustments,
                          },
                        });
                        pageEngine.commit?.();
                      }
                    }}
                    getBitmap={getNodeBitmap}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div
            data-testid="editor-pages"
            className="relative h-full w-full overflow-hidden"
            onPointerLeave={() => sendCollabCursor(null)}
          >
            <RemoteCursors />
            {nodeIds.map((nodeId, index) => (
              <EditorPage
                key={nodeId}
                nodeId={nodeId}
                title={pageTitle(nodeId, index)}
                componentUses={usesOfPage(nodeId)}
                onRenamePage={renamePage}
                index={index}
                focused={nodeId === focusedId}
                active={activeIds.has(nodeId)}
                mode="full"
                getFitInsets={getFitInsets}
                snapshot={snapshotsRef.current.get(nodeId) ?? null}
                onFocus={focusEditorPage}
                resolveCanvas={resolveCanvas}
                selectedInstanceChild={
                  nodeId === focusedId ? selectedInstanceChild : null
                }
                onSelectInstanceChild={selectInstanceChild}
                onOpenCanvasSource={openCanvasSource}
                adjustingInstanceId={
                  nodeId === focusedId ? adjustingInstance?.instanceId : null
                }
                onAdjustView={beginInstanceCameraAdjustment}
                onFinishAdjustView={() => finishInstanceCameraAdjustment(false)}
                onCancelAdjustView={() => finishInstanceCameraAdjustment(true)}
                onCanvasTypeChanged={handleCanvasTypeChanged}
                onEngine={handleEngine}
                onBeforeDispose={handleBeforeDispose}
                onChange={bump}
                streamingLayout={
                  streamingLayout?.nodeId === nodeId ? streamingLayout : null
                }
                onGeneratedOutput={handleGroupGeneratedOutput}
                onVisibility={handleVisibility}
                onRegionCutout={localMattingSupported ? runRegionCutout : null}
                onAutoMask={removeBackground}
                autoMaskBusy={maskBusy}
                autoMaskDisabled={!autoMaskSupported}
                onAutoEnhance={() => runAutoEnhance(nodeId)}
                onPortraitRetouch={(strengths) =>
                  runPortraitRetouch(nodeId, strengths)
                }
                portraitRetouchBusy={retouchBusy}
                onSplitLayers={splitLayers}
                splitLayersBusy={splitLayersBusy}
                onAddPoint={(region) => {
                  if (engine && region) {
                    const host = regionHost(engine.getDocument(), region);
                    if (host) {
                      const midX = (region.x ?? 0) + (region.width ?? 0) / 2;
                      const midY = (region.y ?? 0) + (region.height ?? 0) / 2;
                      const pts =
                        Array.isArray(region.points) && region.points.length > 0
                          ? [...region.points, { x: midX, y: midY }]
                          : [
                              { x: region.x, y: region.y },
                              { x: midX, y: midY },
                            ];
                      engine.updateNode(region.id, { points: pts });
                    }
                  }
                }}
                onRepaint={(region, prompt) => {
                  const host = regionHost(engine?.getDocument(), region);
                  if (host) runRepaint(host, prompt);
                }}
                onRepaintNode={(node, prompt, options) => {
                  if (node) void runRepaint(node, prompt, options);
                }}
                onRepaintSelection={(prompt) =>
                  void runSelectionRepaint(prompt)
                }
                onOutpaintSubmit={(node, grownRect) => {
                  if (node) void runOutpaint(node, grownRect);
                }}
                onAddCanvas={handleAddCanvas}
                onDeleteCanvas={handleDeleteCanvas}
                onDuplicateCanvas={handleDuplicateCanvas}
                isLast={index === nodeIds.length - 1}
                cutoutBusy={lassoBusy}
                repaintBusy={repaintBusy || selectionRepaintBusy}
                onUpscale={(scale) => {
                  const pageEngine =
                    enginesRef.current.get(nodeId)?.engine || engine;
                  if (pageEngine === engine) {
                    void upscaleImage(scale);
                  }
                }}
                upscaleBusy={upscaleBusy}
                selectSubject={() => selectSubject(engine?.getSelected?.())}
                onAddAdjustmentLayer={(kind, isEffect) => {
                  const pageEngine =
                    enginesRef.current.get(nodeId)?.engine || engine;
                  const pageDoc =
                    pageEngine?.getDocument?.() ||
                    snapshotsRef.current.get(nodeId)?.doc;
                  const target =
                    pageEngine?.getSelected?.() ||
                    pageDoc?.nodes?.find((n) => n.kind === "image");
                  if (isEffect && target) {
                    const starter = starterEffect(kind);
                    pageEngine?.updateNode(target.id, {
                      effects: { ...(target.effects ?? {}), [kind]: starter },
                    });
                    pageEngine?.commit?.();
                  } else if (target && target.kind === "image") {
                    const starter = starterAdjustment(kind);
                    pageEngine?.updateNode(target.id, {
                      adjustments: {
                        ...(target.adjustments ?? {}),
                        [kind]: starter,
                      },
                    });
                    pageEngine?.commit?.();
                  } else {
                    const starter = starterAdjustment(kind);
                    const name = t(adjustmentLabelKey(kind));
                    pageEngine?.addAdjustmentLayer(
                      kind,
                      { [kind]: starter },
                      name,
                    );
                  }
                }}
                onApplyPreset={(preset) => {
                  const pageEngine =
                    enginesRef.current.get(nodeId)?.engine || engine;
                  const pageDoc =
                    pageEngine?.getDocument?.() ||
                    snapshotsRef.current.get(nodeId)?.doc;
                  const target =
                    pageEngine?.getSelected?.() ||
                    pageDoc?.nodes?.find((n) => n.kind === "image");
                  if (target && pageEngine) {
                    const presetAdjustments = preset?.adjustments
                      ? structuredClone(preset.adjustments)
                      : structuredClone(preset);
                    pageEngine.updateNode(target.id, {
                      adjustments: {
                        ...(target.adjustments ?? {}),
                        ...presetAdjustments,
                      },
                    });
                    pageEngine.commit?.();
                  }
                }}
                getBitmap={getNodeBitmap}
              />
            ))}
          </div>
        )}

        {/* Rulers + guides overlay. Sits above the canvas but below panels and
            toasts (z-20); only its 20px strips and guide hit bands take pointer
            events, so drawing/selecting on the canvas is unchanged. */}
        {rulersVisible ? (
          <CameraPositionedOverlay
            component={EditorRulers}
            layout={focusedLayout}
            showRulers={showRulers}
            showGuides={showGuides}
            guides={documentGuides}
            selectedGuideId={selectedGuideId}
            zoom={cameraZoom}
            onSelectGuide={setSelectedGuideId}
            onCreateGuide={handleCreateGuide}
            onMoveGuide={handleMoveGuide}
            onRemoveGuide={handleRemoveGuide}
            t={t}
          />
        ) : null}

        {/* Comment pins, thread popovers and the thread list share the focused
            page's document space. The root is pointer-events-none; only pins,
            popovers, the panel and the placement layer take the pointer. */}
        {commentsVisible ? (
          <CameraPositionedOverlay
            component={EditorComments}
            layout={focusedLayout}
            open={commentsOpen}
            addMode={commentMode}
            comments={documentComments}
            zoom={cameraZoom}
            onOpen={() => setCommentsOpen(true)}
            onClose={closeComments}
            onToggleAddMode={toggleCommentMode}
            onCreate={handleCreateComment}
            onReply={handleReplyComment}
            onResolve={handleResolveComment}
            onDelete={handleDeleteComment}
            t={t}
          />
        ) : null}

        {/* Centre-of-canvas AI progress: a model run (auto mask, object
            selection, lasso cutout, repaint, upscale) is seconds-long and silent
            otherwise, so it gets a spinner, a phase label and a progress
            bar instead of a dead-looking canvas. A running repaint owns the
            label when it has one: its phases (booting the local backend,
            degrading to the next candidate) are the only news there. */}
        {maskBusy ||
        lassoBusy ||
        repaintBusy ||
        selectionRepaintBusy ||
        upscaleBusy ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <LoadingModal
              label={aiProgressLabel(
                repaintStatus || maskProgress || upscaleProgress,
              )}
              progress={aiProgressPct(
                repaintStatus || maskProgress || upscaleProgress,
              )}
              onCancel={cancelAiGeneration}
            />
          </div>
        ) : null}

        {returnCanvasId && returnCanvasId !== focusedId ? (
          <button
            type="button"
            data-testid="editor-return-to-instance"
            onClick={returnToCanvasInstance}
            className={`absolute z-40 rounded-lg bg-neutral-800 px-3 py-2 text-[10px] font-mono text-neutral-200 shadow-pop transition-all hover:bg-neutral-700 ${
              layersPanelShown && !swapPanels
                ? "left-64 top-4"
                : "left-4 top-16"
            }`}
          >
            {t("editor.instance.back")}
          </button>
        ) : null}
        {navigationError ? (
          <div
            role="alert"
            data-testid="editor-instance-navigation-error"
            className={`absolute z-40 rounded-lg bg-neutral-800 px-3 py-2 text-[10px] text-rose-400 shadow-pop transition-all ${
              layersPanelShown && !swapPanels
                ? "left-64 top-16"
                : "left-4 top-28"
            }`}
          >
            {t("editor.instance.missingSource")}
          </div>
        ) : null}
        {exitPrompt ? (
          <>
            {/* A dimmed scrim makes the dialog the only thing asking for the
                pointer; clicking it is the same as Keep editing. */}
            <div
              aria-hidden
              onClick={() => setExitPrompt(false)}
              className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            />
            <div
              role="dialog"
              aria-label={t("editor.exit.confirmTitle")}
              className="absolute left-1/2 top-1/2 z-50 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-black/95 p-4 shadow-panel backdrop-blur-md font-mono"
            >
              <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                {dirtyIds.length > 1
                  ? `${dirtyIds.length} ${t("editor.exit.confirmPages")}`
                  : t("editor.exit.confirmTitle")}
              </h2>
              <p className="mb-3 text-[11px] leading-relaxed text-neutral-300">
                {t("editor.exit.confirmBody")}
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setExitPrompt(false);
                    void handleSaveAndExit();
                  }}
                  className="rounded-full bg-white px-3 py-1.5 text-[11px] font-mono font-medium text-black transition-all hover:bg-neutral-200 disabled:opacity-50"
                >
                  {t("editor.exit.saveAndExit")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExitPrompt(false);
                    closeImageEditor();
                  }}
                  className="rounded-full bg-neutral-800 px-3 py-1.5 text-[11px] font-mono text-white transition-all hover:bg-neutral-700"
                >
                  {t("editor.exit.discard")}
                </button>
                <button
                  type="button"
                  onClick={() => setExitPrompt(false)}
                  className="rounded-full px-3 py-1.5 text-[11px] font-mono text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  {t("editor.exit.keepEditing")}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {fileDragOver ? (
          <div
            data-testid="editor-drop-overlay"
            className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border border-emerald-500/50 bg-emerald-500/10 shadow-panel backdrop-blur"
          >
            <span className="rounded-full border border-line-strong bg-surface-raised px-4 py-2 text-[12px] font-mono text-neutral-100 shadow-pop">
              {t("editor.dropHint")}
            </span>
          </div>
        ) : null}

        {exportOpen && presentationId ? (
          <Suspense fallback={null}>
            <PresentationExportDialog
            busy={presentation.busy}
            warnings={presentation.warnings}
            error={presentation.error}
            onExport={presentation.exportDeck}
            onClose={() => {
              presentation.cancelExport();
              cancelExport();
            }}
          />
          </Suspense>
        ) : exportOpen ? (
          <Suspense fallback={null}>
            <EditorExportDialog
              doc={exportDocument}
              exportName={exportTargetName(pageTitle(), exportRange, exportDocument?.nodes, selectedIds)}
              format={exportFormat}
              quality={exportQuality}
              scale={exportScale}
              documentWidth={exportPage?.width ?? exportDocument?.width}
              documentHeight={exportPage?.height ?? exportDocument?.height}
              selectedCount={selectedIds.length}
              slicesCount={
                exportDocument?.nodes?.filter(
                  (n) => n.kind === "region" && n.visible !== false,
                ).length ?? 0
              }
              selectionBounds={exportSelectionBounds}
              exportRange={exportRange}
              onExportRange={setExportRange}
              busy={busy}
              onFormat={setExportFormat}
              onQuality={setExportQuality}
              onScale={setExportScale}
              onExport={(options) => void exportImage(options)}
              onClose={cancelExport}
            />
          </Suspense>
        ) : null}

        {presentation.preview ? (
          <Suspense fallback={null}>
            <PresentationViewer
            pages={presentation.preview.pages}
            title={presentation.preview.title}
            initialPageId={presentation.preview.initialPageId}
            onClose={presentation.closePreview}
            renderSlide={(page, index) => (
              <PresentationSlide key={page.id} page={page} index={index} />
            )}
          />
          </Suspense>
        ) : null}
        {presentation.error && !exportOpen ? (
          <p
            role="alert"
            className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] text-rose-400"
          >
            {presentation.error}
          </p>
        ) : null}

        {propertiesOpen && nestedNode && nestedEngine ? (
          nestedNode.kind === "canvasInstance" ? (
            <PropertiesPanelShell
              testId="editor-properties-panel"
              swapSide={inspectorSwap}
              onToggleSide={toggleSwapPanels}
              mobileExpanded={mobilePropertiesExpanded}
              onMobileToggleExpanded={() => setMobilePropertiesExpanded((value) => !value)}
            >
              <Suspense fallback={null}>
                <EditorCanvasInstanceProperties
                  node={nestedNode}
                  engine={nestedEngine}
                  sourceDoc={resolveCanvas(nestedNode.sourceCanvasId)}
                  onPatch={(patch) =>
                    nestedEngine.updateNode(nestedNode.id, patch)
                  }
                  onPreview={(patch) =>
                    nestedEngine.updateNode(nestedNode.id, patch, {
                      commit: false,
                    })
                  }
                  onCommit={() =>
                    nestedEngine.commit("editor.history.entry.layer")
                  }
                  onOpenSource={() =>
                    openCanvasSource(nestedNode.sourceCanvasId, nestedNode.id)
                  }
                  onResetInstanceCamera={() => {
                    const current = nestedEngine
                      .getDocument()
                      ?.nodes.find((item) => item.id === nestedNode.id);
                    if (current)
                      nestedEngine.updateNode(current.id, {
                        instance: clearInstanceCamera(current.instance),
                      });
                  }}
                  onToggleInstanceViewLock={() => {
                    const current = nestedEngine
                      .getDocument()
                      ?.nodes.find((item) => item.id === nestedNode.id);
                    if (current)
                      nestedEngine.updateNode(current.id, {
                        instance: setInstanceViewLocked(
                          current.instance,
                          current.instance?.overrides?.viewLocked !== true,
                        ),
                      });
                  }}
                />
              </Suspense>
            </PropertiesPanelShell>
          ) : (
            <EditorProperties
              engine={nestedEngine}
              object={nestedNode}
              docSize={nestedDoc}
              tool={TOOL.SELECT}
              mobileExpanded={mobilePropertiesExpanded}
              onMobileToggleExpanded={() => setMobilePropertiesExpanded((value) => !value)}
              onMutate={(patch) =>
                nestedEngine.updateNode(nestedNode.id, patch, { commit: false })
              }
              onCommit={() => nestedEngine.commit("editor.history.entry.layer")}
            />
          )
        ) : propertiesOpen && propertyObject?.kind === "canvasInstance" ? (
          <PropertiesPanelShell
            testId="editor-properties-panel"
            swapSide={inspectorSwap}
            onToggleSide={toggleSwapPanels}
            mobileExpanded={mobilePropertiesExpanded}
            onMobileToggleExpanded={() => setMobilePropertiesExpanded((value) => !value)}
          >
            <Suspense fallback={null}>
              <EditorCanvasInstanceProperties
                node={propertyObject}
                engine={engine}
                sourceDoc={resolveCanvas(propertyObject.sourceCanvasId)}
                onPatch={(patch) =>
                  engine?.updateNode(propertyObject.id, patch)
                }
                onPreview={(patch) =>
                  engine?.updateNode(propertyObject.id, patch, {
                    commit: false,
                  })
                }
                onCommit={() => engine?.commit("editor.history.entry.layer")}
                onOpenSource={() =>
                  openCanvasSource(
                    propertyObject.sourceCanvasId,
                    propertyObject.id,
                  )
                }
                onDetach={() => handleDetachInstance(propertyObject.id)}
                onAdjustView={
                  getCanvasType(
                    resolveCanvas(propertyObject.sourceCanvasId),
                  ) === "3d" &&
                  propertyObject.instance?.overrides?.viewLocked !== true
                    ? () => beginInstanceCameraAdjustment(propertyObject.id)
                    : null
                }
                onResetInstanceCamera={() => {
                  const current = engine
                    ?.getDocument()
                    ?.nodes.find((item) => item.id === propertyObject.id);
                  if (!current) return;
                  engine.updateNode(current.id, {
                    instance: clearInstanceCamera(current.instance),
                  });
                }}
                onToggleInstanceViewLock={() => {
                  const current = engine
                    ?.getDocument()
                    ?.nodes.find((item) => item.id === propertyObject.id);
                  if (!current) return;
                  engine.updateNode(current.id, {
                    instance: setInstanceViewLocked(
                      current.instance,
                      current.instance?.overrides?.viewLocked !== true,
                    ),
                  });
                }}
              />
            </Suspense>
          </PropertiesPanelShell>
        ) : propertiesOpen ? (
          <EditorProperties
            isMainComponent={(instanceCounts.get(doc?.canvasId) ?? 0) > 0}
            engine={engine}
            object={propertyObject}
            onDeleteCanvas={
              nodeIds.length > 1 && !doc?.isCanvasRoot
                ? () => {
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("editor:request-delete-canvas", {
                          detail: { nodeId: focusedId },
                        }),
                      );
                    }
                  }
                : null
            }
            onCreateComponent={
              canCreateComponent ? handleCreateComponent : null
            }
            onDetachInstance={handleDetachInstance}
            onRemoveBackground={() => void removeBackground()}
            removeBackgroundBusy={maskBusy}
            imageAiActions={{
              onOutpaint: () => {
                if (typeof window !== "undefined" && propertyObject?.id) {
                  window.dispatchEvent(
                    new CustomEvent("editor:request-outpaint", {
                      detail: { nodeId: propertyObject.id },
                    }),
                  );
                }
              },
              onUpscale: (scale) => void upscaleImage(scale),
              upscaleBusy,
              onAutoEnhance: () => runAutoEnhance(focusedId),
              onPortraitRetouch: (strengths) =>
                runPortraitRetouch(focusedId, strengths),
              portraitRetouchBusy: retouchBusy,
              onSplitLayers: splitLayers,
              splitLayersBusy,
            }}
            parentLayout={parentLayout}
            parentIsFrame={parentIsFrame}
            parentNode={parentNode}
            colorVariableActions={colorVariableActions}
            styleActions={styleActions}
            index={activeIndex}
            selectionCount={
              isFrameSelected ? 1 : selectedGroup ? 1 : selectedIds.length
            }
            selectedNodes={
              isFrameSelected && frameObject
                ? [frameObject]
                : !selectedGroup && selectedIds.length > 1
                  ? layers.filter((node) => selectedIds.includes(node.id))
                  : []
            }
            tool={tool}
            onTransformMode={(mode) => engine?.setTool(mode)}
            puppetPinId={puppetPinId}
            puppetPins={selected?.puppetPins ?? []}
            puppetRotation={puppetRotation}
            onRotatePuppetPin={(deg) =>
              engine?.setPuppetPinRotation?.(puppetPinId, deg)
            }
            onMovePuppetPinDepth={(dir) =>
              engine?.movePuppetPinDepth?.(puppetPinId, dir)
            }
            onTogglePuppetPinFixed={() =>
              engine?.togglePuppetPinFixed?.(puppetPinId)
            }
            toolProps={{
              color,
              onColor: (next) => {
                if (tool === TOOL.GRADIENT && engine?.getGradientToolState?.()) {
                  engine.setGradientToolStopColor(next);
                }
                engine?.setColor(next);
              },
              onPickColor: () => engine?.setTool(TOOL.DROPPER),
              backgroundColor: engine?.getToolBackgroundColor?.() ?? "#000000",
              onBackgroundColor: (next) => engine?.setToolBackgroundColor?.(next),
              swapColorsRef,
              brushWidth:
                tool === TOOL.REGION && engine?.getRegionMode?.() === "remove"
                  ? (engine?.getRemoveBrushSize?.() ?? 48)
                  : engine?.getBrushWidth(),
              onBrushWidth: (next) => {
                // Region Remove paints with its own brush — size that one,
                // never the annotation brush.
                if (
                  tool === TOOL.REGION &&
                  engine?.getRegionMode?.() === "remove"
                ) {
                  engine?.setRemoveBrushSize?.(next);
                  return;
                }
                engine?.setBrushWidth(next);
              },
              brushHardness: engine?.getBrushHardness(),
              onBrushHardness: (next) => engine?.setBrushHardness(next),
              brushOpacity: engine?.getBrushOpacity?.() ?? 1,
              onBrushOpacity: (next) => engine?.setBrushOpacity?.(next),
              brushMode: engine?.getBrushMode?.() ?? "normal",
              onTool: runTool,
              onBrushMode: (next) => engine?.setBrushMode?.(next),
              brushFlow: engine?.getBrushFlow?.() ?? 1,
              onBrushFlow: (next) => engine?.setBrushFlow?.(next),
              brushSmoothing: engine?.getBrushSmoothing?.() ?? 0,
              onBrushSmoothing: (next) => engine?.setBrushSmoothing?.(next),
              brushStrength: engine?.getBrushStrength?.() ?? 0.5,
              onBrushStrength: (next) => engine?.setBrushStrength?.(next),
              brushExposure: engine?.getBrushExposure?.() ?? 0.5,
              onBrushExposure: (next) => engine?.setBrushExposure?.(next),
              brushTonalRange: engine?.getBrushTonalRange?.() ?? "midtones",
              onBrushTonalRange: (range) => engine?.setBrushTonalRange?.(range),
              brushProtectLuminosity:
                engine?.getBrushProtectLuminosity?.() ?? false,
              onBrushProtectLuminosity: (next) =>
                engine?.setBrushProtectLuminosity?.(next),
              brushSaturating: engine?.getBrushSaturating?.() ?? true,
              onBrushSaturating: (next) => engine?.setBrushSaturating?.(next),
              brushPreset: engine?.getBrushPreset?.() ?? "medium_round",
              onBrushPreset: (next) => engine?.setBrushPreset?.(next),
              pressureSize: engine?.getPressureSize?.() ?? false,
              onPressureSize: (next) => engine?.setPressureSize?.(next),
              pressureOpacity: engine?.getPressureOpacity?.() ?? false,
              onPressureOpacity: (next) => engine?.setPressureOpacity?.(next),
              brushRoundness: engine?.getBrushRoundness?.() ?? 1,
              onBrushRoundness: (next) => engine?.setBrushRoundness?.(next),
              brushAngle: engine?.getBrushAngle?.() ?? 0,
              onBrushAngle: (next) => engine?.setBrushAngle?.(next),
              healingMode: engine?.getHealingMode?.() ?? "aiRepair",
              onHealingMode: (mode) => engine?.setHealingMode?.(mode),
              cloneAligned: engine?.getCloneAligned?.() ?? false,
              onCloneAligned: (next) => engine?.setCloneAligned?.(next),
              cloneSource: engine?.getCloneSource?.() ?? null,
              brushBlendMode: engine?.getBrushBlendMode?.() ?? "normal",
              onBrushBlendMode: (mode) => engine?.setBrushBlendMode?.(mode),
              penAnchorType: engine?.getPenAnchorType?.() ?? "corner",
              onPenAnchorType: (mode) => {
                engine?.setPenAnchorType?.(mode);
                if (engine?.penEdit) engine?.convertActiveAnchor?.(mode);
              },
              penMode: engine?.getPenMode?.() ?? "shape",
              onPenMode: (mode) => engine?.setPenMode?.(mode),
              penStrokeWidth: engine?.getPenStrokeWidth?.() ?? 1,
              onPenStrokeWidth: (next) => engine?.setPenStrokeWidth?.(next),
              penCurveTension: engine?.getPenCurveTension?.() ?? 1,
              onPenCurveTension: (next) => engine?.setPenCurveTension?.(next),
              wandTolerance: engine?.getWandTolerance?.() ?? 32,
              onWandTolerance: (next) => engine?.setWandTolerance?.(next),
              wandContiguous: engine?.getWandContiguous?.() ?? true,
              onWandContiguous: (next) => engine?.setWandContiguous?.(next),
              wandAntiAlias: engine?.getWandAntiAlias?.() ?? true,
              onWandAntiAlias: (next) => engine?.setWandAntiAlias?.(next),
              wandSampleAll: engine?.getWandSampleAll?.() ?? false,
              onWandSampleAll: (next) => engine?.setWandSampleAll?.(next),
              wandSampleSize: engine?.getWandSampleSize?.() ?? 0,
              onWandSampleSize: (next) => engine?.setWandSampleSize?.(next),
              dropperSampleSize: engine?.getDropperSampleSize?.() ?? 0,
              onDropperSampleSize: (next) =>
                engine?.setDropperSampleSize?.(next),
              dropperSource: engine?.getDropperSource?.() ?? "current",
              onDropperSource: (next) => engine?.setDropperSource?.(next),
              showSampleRing: engine?.getShowSampleRing?.() ?? true,
              onShowSampleRing: (next) => engine?.setShowSampleRing?.(next),
              selectionMode: engine?.getSelectionMode?.() ?? "replace",
              onSelectionMode: (mode) => engine?.setSelectionMode?.(mode),
              regionTarget: engine?.getRegionTarget?.() ?? "all",
              onRegionTarget: (mode) => engine?.setRegionTarget?.(mode),
              regionMode: engine?.getRegionMode?.() ?? "object",
              hasSelection: Boolean(
                engine?.getPixelSelection?.()?.contours?.length,
              ),
              selectionFeather:
                engine?.getSelectionFeather?.() ??
                engine?.getPixelSelection?.()?.feather ??
                0,
              onFeatherSelection: (radius) => {
                engine?.setSelectionFeather?.(radius);
              },
              onModifySelection: (amount, operation) => {
                if (!(amount > 0)) return;
                if (operation === "expand")
                  void engine?.modifyPixelSelection?.(amount, { expand: true });
                else if (operation === "contract")
                  void engine?.modifyPixelSelection?.(amount, {
                    expand: false,
                  });
                else if (operation === "border")
                  void engine?.borderPixelSelection?.(amount);
                else if (operation === "smooth")
                  void engine?.smoothPixelSelection?.(amount);
              },
              onRefineEdge: () => {
                if (localMattingSupported) void runLassoCutout();
              },
              onSelectSubject: () => {
                void selectSubject();
              },
              onInvertSelection: () => {
                if (selected?.id) void engine?.invertMask?.(selected.id);
              },
              onClearSelection: () => {
                engine?.clearPixelSelection?.();
              },
              onTransformSelection: () => {
                engine?.beginSelectionTransform?.();
              },
              onFillSelection: () => {
                // Stage-1 UI path: the same table-driven command the agent
                // tools send through editor_command_bridge.
                void executeEditorCommand("fill_selection", engine, {
                  targetNodeId: focusedId,
                }).catch((err) => {
                  if (err?.code !== "NO_SELECTION") {
                    console.error("fill selection failed", err);
                  }
                });
              },
              onAiRepaintSelection: (prompt) => {
                void runSelectionRepaint(prompt);
              },
              aiRepainting: selectionRepaintBusy,
              selectionTransforming: Boolean(engine?.getSelectionTransform?.()),
              onApplyTransformSelection: () => {
                void engine?.applySelectionTransform?.();
              },
              onCancelTransformSelection: () => {
                engine?.cancelSelectionTransform?.();
              },
              marqueeRatio: engine?.getMarqueeRatio?.() ?? null,
              onMarqueeRatio: (ratio) => engine?.setMarqueeRatio?.(ratio),
              marqueeMode: engine?.getMarqueeMode?.() ?? "rect",
              onMarqueeMode: (mode) => engine?.setMarqueeMode?.(mode),
              magneticLassoSettings: engine?.getMagneticLassoSettings?.() ?? {
                width: 64,
                contrast: 50,
                frequency: 57,
              },
              onMagneticLassoSetting: (name, value) => {
                const setters = {
                  width: engine?.setMagneticLassoWidth,
                  contrast: engine?.setMagneticLassoContrast,
                  frequency: engine?.setMagneticLassoFrequency,
                };
                setters[name]?.(value);
              },
              onSelectMode: (mode) => {
                const item = marqueeItemForMode(mode);
                if (!item) return;
                if (item.toolId === TOOL.MARQUEE) {
                  engine?.setMarqueeMode?.(mode);
                }
                engine?.setTool?.(item.toolId);
              },
              cropRatio: engine?.getCropRatio?.() ?? null,
              onCropRatio: (ratio) => engine?.setCropRatio?.(ratio),
              onResetCrop: () => engine?.resetCrop?.(),
              cropMode: engine?.getCropMode?.() ?? "free",
              imageCropMode: Boolean(engine?.isImageCrop?.()),
              onCropMode: (mode) => engine?.setCropMode?.(mode),
              cropWidth: engine?.getCropSize?.()?.width ?? 0,
              cropHeight: engine?.getCropSize?.()?.height ?? 0,
              onCropSize: (width, height) =>
                engine?.setCropSize?.(width, height),
              cropAngle: engine?.getCropAngle?.() ?? 0,
              onCropAngle: (angle) => engine?.setCropAngle?.(angle),
              // Smart crop: the panel's ratio is the engine's own crop ratio,
              // so the solve reads it back off the engine rather than taking a
              // second copy of it through props (auto_crop_page.js). The pixel
              // reader is injected from here because the editor zone is
              // DOM-free; `readImageRgba` is the only DOM/bitmap access.
              onAutoCrop: () =>
                applySmartCrop(engine, { readRgba: readImageRgba }),
              onApplyCrop: () => {
                engine?.applyCrop?.();
                engine?.setTool?.(TOOL.SELECT);
              },
              onApplyDestructiveCrop: () => {
                engine?.applyDestructiveCrop?.();
                engine?.setTool?.(TOOL.SELECT);
              },
              onCancelCrop: () => {
                engine?.cancelCrop?.();
                engine?.setTool?.(TOOL.SELECT);
              },
              arrowSize: selected?.arrowSize ?? (engine?.getArrowSize?.() ?? 24),
              onArrowSize: (size) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { arrowSize: size });
                else engine?.setArrowSize?.(size);
              },
              arrowStart: selected?.arrowStart ?? (engine?.getArrowStart?.() ?? false),
              onArrowStart: (val) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { arrowStart: val });
                else engine?.setArrowStart?.(val);
              },
              arrowEnd: selected?.arrowEnd ?? engine?.getArrowEnd?.() ?? true,
              onArrowEnd: (val) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { arrowEnd: val });
                engine?.setArrowEnd?.(val);
              },
              strokeWidth: selected?.strokeWidth ?? (engine?.getStrokeWidth?.() ?? 1),
              onStrokeWidth: (val) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { strokeWidth: val });
                engine?.setStrokeWidth?.(val);
              },
              shapeStrokeColor: engine?.getShapeStrokeColor?.() ?? "#FFFFFF",
              onShapeStrokeColor: (val) => engine?.setShapeStrokeColor?.(val),
              shapeOpacity: engine?.getShapeOpacity?.() ?? 1,
              onShapeOpacity: (val) => engine?.setShapeOpacity?.(val),
              strokeStyle: selected
                ? (selected.strokeDash && selected.strokeDash !== "solid" ? "dashed" : "solid")
                : (engine?.getShapeStrokeDash?.() === "dashed" ? "dashed" : "solid"),
              onStrokeStyle: (style) => {
                if (selected?.id) {
                  (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, {
                    strokeDash: style === "dashed" ? [6, 4] : "solid",
                  });
                } else {
                  engine?.setShapeStrokeDash?.(style);
                }
              },
              cornerRadius: selected?.cornerRadius ?? selected?.radius ?? 0,
              onCornerRadius: (val) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { cornerRadius: val });
              },
              cornerType: selected?.cornerType || "round",
              onCornerType: (type) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { cornerType: type });
              },
              sides: selected?.spikes ?? selected?.sides ?? 5,
              onSides: (val) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { spikes: val, sides: val });
              },
              starRatio: selected?.ratio ?? 0.5,
              onStarRatio: (val) => {
                if (selected?.id) (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { ratio: val });
              },
              // Text Tool properties (Affinity Style). Without a selected text
              // layer these edit the pending style used by the next text node.
              fontFamily: selected?.fontFamily ?? engine?.getDefaultFontFamily?.() ?? "Inter",
              onFontFamily: (family) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { fontFamily: family });
                else engine?.setDefaultFontFamily?.(family);
              },
              fontWeight: selected?.fontWeight ?? engine?.getDefaultFontWeight?.() ?? "normal",
              onFontWeight: (weight) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { fontWeight: weight });
                else engine?.setDefaultFontWeight?.(weight);
              },
              fontSize: selected?.fontSize ?? engine?.getDefaultFontSize?.() ?? 32,
              onFontSize: (sz) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { fontSize: sz });
                else engine?.setDefaultFontSize?.(sz);
              },
              italic: selected?.italic ?? engine?.getDefaultItalic?.() ?? false,
              onItalic: (val) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { italic: val });
                else engine?.setDefaultItalic?.(val);
              },
              underline: selected?.underline ?? engine?.getDefaultUnderline?.() ?? false,
              onUnderline: (val) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { underline: val });
                else engine?.setDefaultUnderline?.(val);
              },
              align: selected?.align ?? engine?.getDefaultAlign?.() ?? "left",
              onAlign: (val) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { align: val });
                else engine?.setDefaultAlign?.(val);
              },
              lineHeight: selected?.lineHeight ?? engine?.getDefaultLineHeight?.() ?? 1.25,
              onLineHeight: (val) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { lineHeight: val });
                else engine?.setDefaultLineHeight?.(val);
              },
              letterSpacing: selected?.letterSpacing ?? engine?.getDefaultLetterSpacing?.() ?? 0,
              onLetterSpacing: (val) => {
                if (selected?.id && selected.kind === "text") (engine?.updateNodeCoalesced ?? engine?.updateNode)?.(selected.id, { letterSpacing: val });
                else engine?.setDefaultLetterSpacing?.(val);
              },
              // Gradient & Fill properties (Affinity Style)
              gradientType: engine?.getGradientToolState?.()?.type ?? "linear",
              onGradientType: (type) => engine?.setGradientToolType?.(type),
              gradientStops: engine?.getGradientToolState?.()?.stops ?? null,
              onGradientStops: (stops) => engine?.setGradientToolStops?.(stops),
              gradientAngle: engine?.getGradientToolState?.()?.angle ?? 135,
              onGradientAngle: (angle) => engine?.setGradientToolAngle?.(angle),
              gradientActiveStop: engine?.getGradientToolState?.()?.activeStopIndex ?? 0,
              onGradientActiveStop: (index) => engine?.setGradientToolActiveStop?.(index),
              onApplyGradientTool: () => engine?.applyGradientTool?.(),
              fillOpacity: engine?.getFillOpacity?.() ?? 1,
              onFillOpacity: (value) => engine?.setFillOpacity?.(value),
              gradientOpacity: engine?.getGradientOpacity?.() ?? 1,
              onGradientOpacity: (value) => engine?.setGradientOpacity?.(value),
              fillTolerance: engine?.getFillTolerance?.() ?? 32,
              onFillTolerance: (val) => engine?.setFillTolerance?.(val),
              fillContiguous: engine?.getFillContiguous?.() ?? true,
              onFillContiguous: (val) => engine?.setFillContiguous?.(val),
              fillSampleAll: engine?.getFillSampleAll?.() ?? false,
              onFillSampleAll: (val) => engine?.setFillSampleAll?.(val),
              onReverseGradient: () => engine?.reverseGradient?.(),
              lassoSaved: lasso?.pending,
              lassoBusy,
              localMattingSupported,
              onLassoCutout: () => {
                if (localMattingSupported) void runLassoCutout();
              },
              onLassoEraseInside: () => void runLasso("eraseInside"),
              onLassoKeepInside: () => void runLasso("keepInside"),
              onLassoCancel: () => engine?.cancelLasso(),
              grayscaleOnly: Boolean(maskEdit),
            }}
            penEditing={Boolean(engine?.penEdit)}
            onConvertAnchor={(mode) => engine?.convertActiveAnchor?.(mode)}
            onDeleteAnchor={() => engine?.deleteActiveAnchor?.()}
            swapSide={sidePanelSwap}
            onToggleSide={toggleSwapPanels}
            mobileExpanded={mobilePropertiesExpanded}
            onMobileToggleExpanded={() => setMobilePropertiesExpanded((value) => !value)}
            onLayout={
              engine?.layoutSelection && (selected || selectedIds.length >= 1)
                ? (layout, argument) =>
                    engine?.layoutSelection(layout, argument)
                : null
            }
            onCombine={
              canCombineSelection
                ? (operation) => engine?.combineSelected(operation)
                : null
            }
            docSize={canvasBackgroundSelected ? null : doc}
            isBackground={canvasBackgroundSelected}
            backgroundColor={canvasBackgroundColor}
            onSetDocumentSize={applyPageResize}
            framePosition={layoutById.get(focusedId) ?? null}
            onSetFramePosition={(x, y) => {
              const layout = layoutById.get(focusedId);
              if (layout) setEditorArtboardLayout(focusedId, { ...layout, x, y });
            }}
            onSetBackgroundColor={setCanvasBackgroundColor}
            maskActions={
              selected &&
              selected.kind !== "region" &&
              selected.kind !== "adjustment" &&
              selected.kind !== "group"
                ? {
                    busy: maskBusy,
                    error: maskError,
                    progress: maskProgress,
                    supported: autoMaskSupported,
                    hasMask: Boolean(selected.maskId),
                    editing: maskEdit?.nodeId === selected.id ? maskEdit : null,
                    onAddMask: () => engine?.addMaskToSelected(),
                    onRemove: removeBackground,
                    onClear: () => engine?.clearMask(selected.id),
                    onEditToggle: () => {
                      if (maskEdit?.nodeId === selected.id) {
                        engine?.endMaskEdit();
                      } else {
                        engine?.beginMaskEdit(selected.id);
                        engine?.setTool(TOOL.BRUSH);
                      }
                    },
                    onMode: (mode) => engine?.setMaskMode(mode),
                    onSize: (size) => engine?.setMaskBrushSize(size),
                    onFeather: (radius) =>
                      void engine?.featherMask(selected.id, radius),
                    onRefine: (op, amount) =>
                      void engine?.refineMask(selected.id, op, amount),
                    onQuickMask: () => void engine?.quickMaskFromSelection(),
                    hasSelection:
                      engine?.getPixelSelection?.()?.nodeId === selected.id,
                    onInvert: () => void engine?.invertMask(selected.id),
                  }
                : null
            }
            compareActions={
              selected?.kind === "image"
                ? {
                    pressed: comparing,
                    onPress: () => {
                      setComparing(true);
                      engine?.setBypassAdjustments(true);
                    },
                    onRelease: () => {
                      setComparing(false);
                      engine?.setBypassAdjustments(false);
                    },
                  }
                : null
            }
            transformActions={
              selected?.kind === "image"
                ? {
                    pending: engine?.isTransformPending(selected.id) ?? false,
                    onTransform: (kind) =>
                      engine?.transformNodeBitmap(selected.id, kind),
                  }
                : null
            }
            getBitmap={
              selected?.kind === "image" ||
              selected?.kind === "video" ||
              selected?.kind === "model3d"
                ? getNodeBitmap
                : null
            }
            onMutate={(patch) => {
              if (selectedGroup) {
                engine?.updateNode(selectedGroup.id, patch, { commit: false });
                return;
              }
              if (isFrameSelected) {
                handleMutateFrame(patch, { commit: false });
                return;
              }
              if (!selected) return;
              // The engine owns frame geometry and descendant constraints as one edit.
              if (selected.isFrame && selectedIds.length === 1 && engine?.updateFrameNode &&
                  ["x", "y", "width", "height"].some((key) => key in patch)) {
                engine.updateFrameNode(selected.id, patch, { commit: false });
                return;
              }
              // With several layers selected an edit reaches every selected
              // layer of the same kind (plan 1.9): a text-style patch must
              // not land on an image layer in a mixed selection.
              const ids =
                selectedIds.length > 1
                  ? layers
                      .filter(
                        (node) =>
                          selectedIds.includes(node.id) &&
                          node.kind === selected.kind,
                      )
                      .map((node) => node.id)
                  : [selected.id];
              // A resize patch from Transform includes the primary node's
              // absolute x/y. Broadcasting it verbatim stacks every selected
              // layer at one point, so other layers keep their own origin and
              // only receive the size change.
              for (const id of ids) {
                const nextPatch =
                  ids.length > 1
                    ? patchForMultiResize(patch, { primary: id === selected.id })
                    : patch;
                engine?.updateNode(id, nextPatch, { commit: false });
              }
            }}
            onCommit={() => {
              if (isFrameSelected) {
                engine?.commit?.("editor.frame.update");
                return;
              }
              engine?.commit("editor.history.entry.layer");
            }}
          />
        ) : null}

                {otherMediaErrorText ? (
          <p
            role="alert"
            className="absolute left-1/2 top-16 z-[65] max-w-[min(32rem,90vw)] -translate-x-1/2 rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] text-rose-400 shadow-pop"
          >
            {otherMediaErrorText}
          </p>
        ) : null}
        {mediaImportBusy || mediaImportError ? (
          <p
            role={mediaImportError ? "alert" : "status"}
            className={`absolute left-1/2 top-16 z-[66] max-w-[min(32rem,90vw)] -translate-x-1/2 rounded-xl px-3 py-2 text-[11px] shadow-pop ${mediaImportError ? "bg-rose-500/10 text-rose-400" : "bg-neutral-900 text-neutral-200"}`}
          >
            {mediaImportError || t("editor.media.importing")}
          </p>
        ) : null}

        {layersPanelShown ? (
          <EditorLayers
            canvasPages={canvasPages}
            selectedCanvasIds={selectedCanvasIds}
            activeCanvasId={focusedId}
            onFocusCanvas={handleFocusCanvas}
            onSelectCanvasLayer={handleSelectCanvasLayer}
            onOpenCanvasInstance={openCanvasSource}
            resolveCanvas={resolveCanvas}
            selectedInstanceChild={selectedInstanceChild}
            onSelectInstanceChild={selectInstanceChild}
            objects={layers}
            activeIndex={activeIndex}
            selectedIds={selectedIds}
            backgroundColor={canvasBackgroundColor}
            isBackgroundSelected={canvasBackgroundSelected}
            isolationGroupId={isolationGroupId}
            swapSide={swapPanels}
            onToggleSide={toggleSwapPanels}
            mobileExpanded={mobileLayersExpanded}
            onMobileToggleExpanded={() => setMobileLayersExpanded((value) => !value)}
            onSelect={(index) => {
              setCanvasBackgroundSelected(false);
              setSelectedInstanceChild(null);
              const layer = layers[index];
              if (!layer) return;
              engine?.selectExactly([layer.id]);
              if (
                isNarrow &&
                (layer.kind === "frame" || layer.isFrame || layer.frame)
              ) {
                engine?.zoomToSelection?.([layer]);
              }
            }}
            onToggleSelect={(index) => {
              setCanvasBackgroundSelected(false);
              setSelectedInstanceChild(null);
              engine?.toggleExactly(layers[index].id);
            }}
            onSelectExactly={(ids) => {
              setCanvasBackgroundSelected(false);
              setSelectedInstanceChild(null);
              engine?.selectExactly(ids);
            }}
            onSelectBackground={() => {
              setSelectedInstanceChild(null);
              setCanvasBackgroundSelected(true);
              engine?.selectExactly?.([]);
            }}
            onSelectGroup={(id) => {
              setCanvasBackgroundSelected(false);
              setSelectedInstanceChild(null);
              engine?.selectGroup(id);
            }}
            onToggle={(index) =>
              engine?.updateNode(layers[index].id, {
                visible: !layers[index].visible,
              })
            }
            onToggleLock={(index) => engine?.toggleLockNode(layers[index].id)}
            onToggleLockTransparency={(index) =>
              engine?.setLockTransparency(
                layers[index].id,
                !layers[index].lockTransparency,
              )
            }
            onToggleLockPosition={(index) =>
              engine?.setLockPosition(
                layers[index].id,
                !layers[index].lockPosition,
              )
            }
            onToggleLockImagePixels={(index) =>
              engine?.setLockImagePixels(
                layers[index].id,
                !layers[index].lockImagePixels,
              )
            }
            onReorder={(id, targetIndex) =>
              engine?.reorderNodeTo(id, targetIndex)
            }
            onReorderGroup={(id, targetIndex) =>
              engine?.reorderGroupTo(id, targetIndex)
            }
            onRemove={(index) => engine?.removeNode(layers[index].id)}
            onRemoveMask={(id) => engine?.clearMask(id)}
            onDeleteSelected={() => engine?.deleteSelected()}
            onRename={(index, name) =>
              engine?.updateNode(layers[index].id, { name: name ?? undefined })
            }
            onLayerToFront={(index) => engine?.moveToFront(layers[index].id)}
            onLayerToBack={(index) => engine?.moveToBack(layers[index].id)}
            onRasterize={(index) => engine?.rasterizeNode(layers[index].id)}
            onConvertToPath={(id) => engine?.convertSelectedToPath?.(id)}
            onDuplicateLayer={(index) => {
              if (!engine) return;
              engine.selectExactly([layers[index].id]);
              engine.duplicateSelected();
            }}
            onMutate={(id, patch) =>
              engine?.updateNode(id, patch, { commit: false })
            }
            onCommit={() => engine?.commit("editor.history.entry.layer")}
            onGroupSelected={() => engine?.groupSelection()}
            canGroupSelected={engine?.canGroupSelection() ?? false}
            onCombineSelected={(operation) =>
              engine?.combineSelected(operation)
            }
            canCombineSelected={engine?.canCombineSelection?.() ?? false}
            onClipInto={(sourceId, targetId) =>
              engine?.clipNodeInto(sourceId, targetId)
            }
            onMoveIntoGroup={(id, groupId) =>
              engine?.moveIntoGroup(id, groupId)
            }
            onMoveNodeToRoot={(id, rootIndex) =>
              engine?.moveNodeToRoot(id, rootIndex)
            }
            getBitmap={getNodeBitmap}
            getNodeMask={getNodeMask}
            maskEdit={maskEdit}
            onBeginMaskEdit={(id) => {
              engine?.beginMaskEdit(id);
              engine?.setTool(TOOL.BRUSH);
            }}
            onEndMaskEdit={() => engine?.endMaskEdit()}
            onAddAdjustmentLayer={(kind) => {
              const starter = starterAdjustment(kind);
              const name = t(adjustmentLabelKey(kind));
              engine?.addAdjustmentLayer(kind, { [kind]: starter }, name);
            }}
            onAddLayer={() => {
              const name = t("editor.layer.defaultName", {
                index: layers.length + 1,
              });
              engine?.addNewLayer(name);
            }}
            onAddMask={() => {
              engine?.addMaskToSelected();
            }}
          />
        ) : null}

        {historyOpen ? (
          <Suspense fallback={null}>
            <EditorHistoryPanel
              canUndo={engine?.canUndo() ?? false}
              canRedo={engine?.canRedo() ?? false}
              entries={engine?.getHistoryEntries?.() ?? []}
              currentIndex={engine?.getCurrentHistoryIndex?.() ?? -1}
              onJumpTo={(idx) => void engine?.jumpToHistory?.(idx)}
              swapSide={sidePanelSwap}
              onToggleSide={toggleSwapPanels}
              mobileExpanded={mobilePropertiesExpanded}
              onMobileToggleExpanded={() => setMobilePropertiesExpanded((value) => !value)}
              onUndo={presentationHistory.undo}
              onRedo={presentationHistory.redo}
            />
          </Suspense>
        ) : null}

        {(
          <EditorToolbar
            variant={workbench.toolbar === "motion" ? "motion" : "design"}
            tool={tool}
            onTool={runTool}
            selectedNode={engine?.getSelected()}
            selectedNodes={engine?.getSelectedNodes?.() ?? []}
            snapping={snappingEnabled}
            onToggleSnapping={toggleSnapping}
            onFlipHorizontal={() => {
              void engine?.flipHorizontal?.();
              bump();
            }}
            onFlipVertical={() => {
              void engine?.flipVertical?.();
              bump();
            }}
            onRotateClockwise={() => {
              void engine?.rotateClockwise?.();
              bump();
            }}
            onRotateCounterClockwise={() => {
              void engine?.rotateCounterClockwise?.();
              bump();
            }}
            canCombine={canCombineSelection || engine?.getSelected()?.kind === "boolean"}
            onCombine={(op) => {
              engine?.combineSelected?.(op);
              bump();
            }}
            selectedBooleanOp={engine?.getSelected()?.kind === "boolean" ? engine.getSelected().operation : null}
            onAlign={(type) => {
              engine?.layoutSelection?.(alignNodes, type);
              bump();
            }}
            onDistribute={(axis) => {
              engine?.layoutSelection?.(distributeNodes, axis);
              bump();
            }}
            onMoveToFront={() => {
              const ids = engine?.getSelectedIds?.() ?? (engine?.getSelected() ? [engine.getSelected().id] : []);
              if (ids.length) {
                engine?.moveToFront?.(ids);
                bump();
              }
            }}
            onMoveForward={() => {
              const ids = engine?.getSelectedIds?.() ?? (engine?.getSelected() ? [engine.getSelected().id] : []);
              if (ids.length) {
                for (const id of ids) engine?.reorderNode?.(id, "up");
                bump();
              }
            }}
            onMoveBackward={() => {
              const ids = engine?.getSelectedIds?.() ?? (engine?.getSelected() ? [engine.getSelected().id] : []);
              if (ids.length) {
                for (const id of ids) engine?.reorderNode?.(id, "down");
                bump();
              }
            }}
            onMoveToBack={() => {
              const ids = engine?.getSelectedIds?.() ?? (engine?.getSelected() ? [engine.getSelected().id] : []);
              if (ids.length) {
                engine?.moveToBack?.(ids);
                bump();
              }
            }}
            canConvertToCurves={Boolean(engine?.getSelected() && !["path", "image", "group", "frame"].includes(engine.getSelected().kind))}
            onConvertToCurves={() => {
              engine?.convertSelectedToPath?.();
              bump();
            }}
            regionMode={engine?.getRegionMode() ?? "object"}
            onRegionMode={(mode) => engine?.setRegionMode(mode)}
            healingMode={engine?.getHealingMode() ?? "aiRepair"}
            onHealingMode={(mode) => engine?.setHealingMode(mode)}
            marqueeMode={engine?.getMarqueeMode() ?? "rect"}
            onMarqueeMode={(mode) => engine?.setMarqueeMode(mode)}
            brushMode={engine?.getBrushMode?.() ?? "normal"}
            onBrushMode={(mode) => engine?.setBrushMode?.(mode)}
          />
        )}

        {workbench.pieMenu && pieMenu ? (
          <EditorPieMenu
            family={pieMenu.family}
            triggerCode={pieMenu.triggerCode}
            position={pieMenu.position}
            tool={tool}
            marqueeMode={engine?.getMarqueeMode() ?? "rect"}
            brushMode={engine?.getBrushMode() ?? "normal"}
            healingMode={engine?.getHealingMode() ?? "aiRepair"}
            onTool={runTool}
            onMarqueeMode={(mode) => engine?.setMarqueeMode(mode)}
            onBrushMode={(mode) => engine?.setBrushMode(mode)}
            onHealingMode={(mode) => engine?.setHealingMode(mode)}
            onClose={() => setPieMenu(null)}
          />
        ) : null}

        <div
          data-testid="editor-zoom-position"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-0"
        >
          <div className="pointer-events-auto relative h-0">
            <EditorZoom
              onAddCanvas={
                canvasType === "3d" && !multi ? () => handleAddCanvas() : null
              }
              zoom={multi ? cameraZoom : zoom}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={presentationHistory.undo}
              onRedo={presentationHistory.redo}
              onZoomIn={
                multi ? () => zoomSharedStep(1) : () => engine?.zoomStep(1)
              }
              onZoomOut={
                multi ? () => zoomSharedStep(-1) : () => engine?.zoomStep(-1)
              }
              onZoomReset={
                multi ? zoomSharedHundred : () => engine?.zoomToHundred?.()
              }
              onFit={multi ? fitAll : () => engine?.zoomToFit()}
              grid={grid}
              gridSize={grid?.size ?? lastGridSizeRef.current}
              snapToGrid={snapToGrid}
              onToggleSnapToGrid={toggleSnapToGrid}
              onSetGridSize={(size) => {
                lastGridSizeRef.current = size;
                const next = { enabled: grid ? grid.enabled !== false : true, size };
                if (multi) {
                  for (const entry of enginesRef.current.values()) {
                    entry.engine?.setGrid?.(next);
                  }
                } else {
                  engine?.setGrid?.(next);
                }
                bump();
              }}
              onToggleGrid={() => {
                if (grid?.size) lastGridSizeRef.current = grid.size;
                const next = {
                  ...grid,
                  enabled: !grid || grid.enabled === false,
                  size: grid?.size ?? lastGridSizeRef.current,
                };
                if (multi) {
                  for (const entry of enginesRef.current.values()) {
                    entry.engine?.setGrid?.(next);
                  }
                } else {
                  engine?.setGrid?.(next);
                }
                bump();
              }}
              snapping={snappingEnabled}
              showRulers={showRulers}
              rulersAvailable={rulersVisible}
              onToggleRulers={toggleRulers}
              showGuides={showGuides}
              onToggleGuides={toggleGuides}
              canClearGuides={documentGuides.length > 0}
              onClearGuides={handleClearGuides}
              onImportMedia={openMediaPicker}
              onToggleSnapping={toggleSnapping}
            >
              {rulersVisible ? (
                <EditorCanvasAids
                  showGuides={showGuides}
                  onToggleGuides={toggleGuides}
                  t={t}
                />
              ) : null}
            </EditorZoom>
          </div>
        </div>

        {savedNotice ? (
          <div
            role="status"
            className="absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-[#b2ffd6] shadow-pop backdrop-blur-md"
          >
            ✓{" "}
            {typeof savedNotice === "string"
              ? savedNotice.startsWith("✓")
                ? savedNotice.slice(1).trim()
                : `${savedNotice} ${t("editor.saved") || "已保存"}`
              : t("editor.saved") || "已保存"}
          </div>
        ) : null}

        {exportNotice ? (
          <div
            role="status"
            className="absolute top-28 left-1/2 z-50 rounded-xl bg-surface-raised px-3 py-2 text-[11px] text-amber-300 shadow-pop"
          >
            {Array.isArray(exportNotice) && exportNotice.length > 0
              ? t(
                  typeof exportNotice[0] === "string"
                    ? `editor.exportWarning.${exportNotice[0]}`
                    : exportNotice[0]?.code
                      ? `editor.exportWarning.${exportNotice[0].code}`
                      : "editor.exportHtml3dWarning",
                )
              : typeof exportNotice === "string"
                ? t(exportNotice)
                : t("editor.exportHtml3dWarning")}
          </div>
        ) : null}

        {applyError ? (
          <div
            role="alert"
            className="absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            {applyError === "quotaExceeded"
              ? t("error.quotaExceeded")
              : typeof applyError === "string" && applyError !== "true"
                ? t(applyError)
                : t("editor.applyError")}
          </div>
        ) : null}

        {persistQuota ? (
          <div
            role="alert"
            className="absolute top-40 left-1/2 z-50 -translate-x-1/2 flex max-w-[520px] items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-1.5 text-[11px] font-mono text-rose-400 shadow-pop backdrop-blur-md"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400"
            />
            <span>{t("editor.storage.persistQuotaWarning")}</span>
            <button
              type="button"
              onClick={() => setPersistQuota(null)}
              className="shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
            >
              {t("error.dismiss")}
            </button>
          </div>
        ) : null}

        {imageActionError ? (
          <div
            role="alert"
            className="absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            {t(imageActionError)}
          </div>
        ) : null}

        {aiErrorText && !imageActionError ? (
          <div
            role="alert"
            data-testid="editor-ai-error"
            className="absolute top-28 left-1/2 z-50 flex max-w-[min(32rem,90%)] -translate-x-1/2 items-center gap-2 rounded-xl bg-black/60 px-3.5 py-1.5 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            <span className="min-w-0">{aiErrorText}</span>
            <button
              type="button"
              onClick={() => setAiErrorText(null)}
              aria-label={t("error.dismiss")}
              className="shrink-0 rounded-lg px-1 text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
            >
              ✕
            </button>
          </div>
        ) : null}

        {splitLayersError ? (
          <div
            role="alert"
            // One step below imageActionError's top-28: both can fire from the
            // same click on the taskbar, and stacked at the same offset the
            // second toast lands exactly on the first.
            className="absolute top-36 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            {t(
              splitLayersError === "extensionRequired"
                ? "editor.taskbar.splitLayersUnavailableWeb"
                : splitLayersError === "noLayersIdentified"
                  ? "editor.taskbar.splitNoLayers"
                  : "editor.taskbar.splitError",
            )}
          </div>
        ) : null}

        {aiRepairDownload ? (
          <AiRepairDownloadDialog
            state={aiRepairDownload}
            onDownload={() => void engine?.downloadAiRepairModel?.()}
            onCancel={() => engine?.cancelAiRepairDownload?.()}
          />
        ) : null}

        {mattingDownload ? (
          <AiRepairDownloadDialog
            state={{ ...mattingDownload, kind: "matting" }}
            onDownload={() => void downloadMattingModel()}
            onCancel={cancelMattingModelDownload}
          />
        ) : null}

        {regionHint ? (
          regionHintTone === "error" ? (
            <div
              role="alert"
              className={`absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md transition-opacity duration-300 ${
                regionHintFading ? "opacity-0" : "opacity-100"
              }`}
            >
              {t(regionHint)}
            </div>
          ) : (
            <div
              role="status"
              className={`pointer-events-none absolute top-28 left-1/2 z-50 -translate-x-1/2 text-center text-[12px] font-mono text-neutral-100 shadow-pop transition-opacity duration-300 ${
                regionHintFading ? "opacity-0" : "opacity-100"
              }`}
            >
              {t(regionHint)}
            </div>
          )
        ) : null}

        <SharedDocumentLoading />

        <div
          data-testid="canvas-notice-column"
          // Sit at the top-right, left of the properties/comments panel so the
          // bottom-left page switcher and comments toggle never cover a room
          // or offline notice.
          className="pointer-events-none absolute right-[20rem] top-4 z-40 flex flex-col gap-2 max-w-[min(360px,calc(100%-21rem))]"
        >
          <OfflineSessionNotice />
          <RoomProjectNotice />
        </div>

        <input
          ref={mediaInputRef}
          type="file"
          multiple
          accept={EDITOR_MEDIA_ACCEPT}
          // Rendered but invisible: a display:none file input does not raise
          // a picker when clicked, and the menu drives it programmatically.
          data-testid="editor-media-file-input"
          className="pointer-events-none absolute bottom-0 left-0 h-px w-px overflow-hidden opacity-0"
          aria-label={t("editor.menu.importMedia")}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            importMediaFiles(files);
          }}
        />

        {contextMenu ? (
          <EditorContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            engine={engine}
            selectedCount={engine ? engine.getSelectedIds().length : 0}
            onClose={() => setContextMenu(null)}
            onDeleteCanvas={multi ? () => handleDeleteCanvas(focusedId) : null}
            onDuplicateCanvas={
              multi ? () => handleDuplicateCanvas(focusedId) : null
            }
            onEditSvg={handleOpenSvgEdit}
            onCreateComponent={
              canCreateComponent ? handleCreateComponent : null
            }
            onDetachInstance={handleDetachInstance}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onImportMedia={openMediaPicker}
          />
        ) : null}

        <Suspense fallback={null}>
          <ShortcutReferenceModal
          isOpen={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
          titleKey="editor.shortcuts.title"
          groups={DESIGN_SHORTCUT_GROUPS}
        />

        <SvgEditModal
          isOpen={svgEditModal.isOpen}
          onClose={() =>
            setSvgEditModal((prev) => ({ ...prev, isOpen: false }))
          }
          initialSvg={svgEditModal.svgString}
          onApply={handleApplySvgEdit}
        />

        <EditorCommandPalette
          open={commandPaletteOpen}
          actions={paletteActions}
          onRun={runPaletteCommand}
          onClose={closeCommandPalette}
        />

        <EditorFindReplace
          open={findReplaceOpen}
          doc={engine?.getDocument?.() ?? null}
          onClose={closeFindReplace}
          onFocusMatch={focusFindMatch}
          onApplyDoc={applyFindReplaceDoc}
        />
        </Suspense>
      </div>
    </div>
  );
}

ImageEditor.propTypes = {
  agentVisible: PropTypes.bool,
  visible: PropTypes.bool,
};

// Keep pan subscriptions local to overlays that need screen-space coordinates.
function CameraPositionedOverlay({ component: Component, layout, ...props }) {
  const camera = useDesignStore((state) => state.editorCamera);
  return <Component {...props} zoom={camera?.zoom ?? 1}
    offsetX={(layout?.x ?? 0) * (camera?.zoom ?? 1) + (camera?.panX ?? 0)}
    offsetY={(layout?.y ?? 0) * (camera?.zoom ?? 1) + (camera?.panY ?? 0)} />;
}
