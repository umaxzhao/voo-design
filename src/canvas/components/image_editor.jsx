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
import { getSelectedCanvasPageIds } from "./editor_canvas_selection.js";
import {
  calculateFitInsets,
  editorPanelLayout,
  editorPageFitInsets,
  editorPanelVisibility,
  fitEditorPageCamera,
  shouldReserveBothPanelInsets,
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
import {
  hasConstraints,
  reflowConstraints,
} from "../editor/scene_constraints.js";
import { selectionBounds } from "../editor/editor_export_bounds.js";
import { alignNodes, distributeNodes } from "../editor/align_ops.js";
import EditorPage from "./editor_page.jsx";
import LoadingModal from "./loading_modal.jsx";
import EditorProperties from "./editor_properties/index.jsx";
import { layoutPresentationPages } from "../presentation/presentation-document.js";
import { usePresentationHistory } from "./presentation/use_presentation_history.js";
import { usePresentationEditor } from "./presentation/use_presentation_editor.js";
import PresentationPageMenu from "./presentation/presentation_page_menu.jsx";
const PresentationViewer = lazy(() => import("./presentation/presentation_viewer.jsx"));
const PresentationExportDialog = lazy(() => import("./presentation/presentation_export_dialog.jsx"));
import PresentationSlide from "./presentation/presentation_slide.jsx";
import {
  editorMediaFileKind,
  importEditorMediaFile,
} from "./editor_media_import.js";
import EditorToolbar, { EditorZoom } from "./editor_toolbar.jsx";
import EditorRulers, { EditorCanvasAids } from "./editor_rulers.jsx";
import EditorComments from "./editor_comments.jsx";
import EditorToolSubbar from "./editor_tool_subbar.jsx";
import EditorPieMenu from "./editor_pie_menu.jsx";
import EditorPenSubbar from "./editor_pen_subbar.jsx";
import EditorContextMenu from "./editor_context_menu.jsx";
const EditorCommandPalette = lazy(() => import("./editor_command_palette.jsx"));
const EditorFindReplace = lazy(() => import("./editor_find_replace.jsx"));
const ShortcutReferenceModal = lazy(() => import("./shortcut_reference_modal.jsx"));
const SvgEditModal = lazy(() => import("./SvgEditModal.jsx"));
import { DESIGN_SHORTCUT_GROUPS } from "../../shared/editor-shortcut-catalog.js";
import { getSetting, setSetting } from "../../shared/settings.js";
import {
  addGuide,
  createGuide,
  readDocumentGuides,
  removeGuide,
  serialiseGuides,
  updateGuide,
} from "../editor/rulers_geometry.js";
import {
  addComment,
  addReply,
  deleteComment,
  normalizeComments,
  serializeComments,
  setResolved,
} from "../comments/comment_model.js";
import {
  TOOL,
  ZOOM_STEP,
  clampZoom,
  wheelPanDelta,
  wheelZoomFactor,
} from "../editor/editor_constants.js";
import { marqueeItemForMode } from "../editor/tool_families.js";
import { executeEditorCommand } from "../editor/command_table.js";
import { PendingCanvasSelectionManager } from "./editor_pending_canvas_selection.js";
import { useEditorShortcuts } from "../use_editor_shortcuts.js";
import { EDITOR_MEDIA_ACCEPT, importPickedEditorFile } from "./editor_import_files.js";
import { useEditorDnd } from "./use_editor_dnd.js";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";
import { useWorkspaceSkia } from "../use_skia_page.js";
import { SpatialIndex } from "../editor/spatial_index.js";
import { requestCollabOriginal } from "../collab/use_collab.js";
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
import {
  dragArtboardPosition,
  positionArtboard,
} from "../editor/editor_artboard_positions.js";
import { applySmartCrop } from "../editor/auto_crop_page.js";
import {
  addColorVariable,
  bindColorVariable,
  updateColorVariable,
} from "../editor/scene_color_variables.js";
import { createVariablesPanelActions } from "../editor/scene_variables.js";
import { createStylePanelActions } from "../editor/scene_styles.js";
import { useEditorApply } from "./editor_hooks/use_editor_apply.js";
import { readImageRgba } from "./bitmap_pixels.js";
import {
  ENHANCE_SAMPLE_EDGE,
  mergeEnhanceAdjustments,
  planOneTapEnhance,
} from "../editor/auto_enhance_apply.js";
import { RETOUCH_TOO_LARGE } from "../editor/portrait_retouch_plan.js";
import { useEditorRaster } from "./editor_hooks/use_editor_raster.js";
import { useEditorLayerSplit } from "./editor_hooks/use_editor_layer_split.js";
import {
  starterAdjustment,
  starterEffect,
  adjustmentLabelKey,
} from "../editor/adjustment_catalog.js";
import { layoutCanvasSize } from "../layout_geometry.js";
import { isLocalMattingSupported } from "../editor/ai_capabilities.js";
import { maskErrorCopy } from "../error_text.js";
import { subscribePersistenceAlert } from "../editor/editor_persist_events.js";

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

/** Free-canvas spacing between artboards, in camera-space units. */
const FREE_GUTTER = 64;
/** Free-canvas padding around the artboard row. */
const FREE_PADDING = 48;
/** Artboards without a saved position fill a grid this many columns wide. */
const FREE_COLUMNS = 3;

/**
 * Persisted view-aid keys. The pointer/snapping modules read the same keys
 * synchronously, so a toggle here changes the very next drag.
 */
const SHOW_RULERS_SETTING = "voo.editor.showRulers";
const SHOW_GUIDES_SETTING = "voo.editor.showGuides";
const SNAP_TO_GRID_SETTING = "voo.editor.snapToGrid";
/** History label for every guide edit (one entry per completed gesture). */
const GUIDES_HISTORY_NAME = "editor.history.entry.guides";
/** History label for every comment edit (create/reply/resolve/delete). */
const COMMENTS_HISTORY_NAME = "editor.history.entry.comments";
/** History label for find-and-replace commits (one entry per Replace All). */
const FIND_REPLACE_HISTORY_NAME = "editor.history.entry.replaceText";

/**
 * Default free-canvas placement: a grid of equal cells in reading order, each
 * artboard centred in its cell. Saved positions still win over this.
 */
function gridArtboardLayouts(sizes) {
  const cellWidth = Math.max(...sizes.map((size) => size.width));
  const cellHeight = Math.max(...sizes.map((size) => size.height));
  return sizes.map((size, index) => {
    const column = index % FREE_COLUMNS;
    const row = Math.floor(index / FREE_COLUMNS);
    return {
      ...size,
      x: FREE_PADDING + column * (cellWidth + FREE_GUTTER) + (cellWidth - size.width) / 2,
      y: FREE_PADDING + row * (cellHeight + FREE_GUTTER) + (cellHeight - size.height) / 2,
    };
  });
}

/** Left edge of the presentation row for the page at `index`. */
function presentationRowX(sizes, index) {
  return sizes.slice(0, index).reduce((x, size) => x + size.width + FREE_GUTTER, FREE_PADDING);
}

/**
 * Zooms a camera around a stage-space point, keeping it under the cursor —
 * the same maths the per-page viewport uses, shared across artboards here.
 */
function zoomCameraAt(camera, factor, point) {
  const zoom = clampZoom(camera.zoom * factor);
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    panX: point.x - (point.x - camera.panX) * ratio,
    panY: point.y - (point.y - camera.panY) * ratio,
  };
}

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

  const nodeIds = useDesignStore((state) => state.editingNodeIds);
  const focusedId = useDesignStore((state) => state.editingNodeId);
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
  const panEditorCamera = useDesignStore((state) => state.panEditorCamera);
  const setEditorArtboardLayouts = useDesignStore(
    (state) => state.setEditorArtboardLayouts,
  );
  const setEditorArtboardLayout = useDesignStore(
    (state) => state.setEditorArtboardLayout,
  );
  const moveEditorArtboard = useDesignStore(
    (state) => state.moveEditorArtboard,
  );
  const setEditorViewport = useDesignStore(
    (state) => state.setEditorViewport,
  );

  const multi = nodeIds.length > 1 || Boolean(presentationId);

  // A design editor opened these pictures; the fast first paint shipped a
  // compressed preview, so fetch the untouched originals for editing (the
  // collab responds and the store's image map is replaced by the full-res blob).
  useEffect(() => {
    if (!nodeIds.length) return;
    const imageIds = (nodeIds ?? [])
      .map((id) => nodes.find((n) => n.id === id)?.data?.imageId)
      .filter(Boolean);
    if (imageIds.length) requestCollabOriginal(imageIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIds.join(",")]);

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
  const artboardLayerRef = useRef(null);
  const freeGridRef = useRef(null);
  const panGestureRef = useRef(null);
  const artboardDragRef = useRef(null);
  const spaceRef = useRef(false);
  const [busy, setBusy] = useState(false);
  /** A save/export failed; the editor stays open so the work survives. */
  const [applyError, setApplyError] = useState(false);
  /** Why the region tool drew nothing (an i18n key), or null. */
  const [regionHint, setRegionHint] = useState(null);
  const [regionHintFading, setRegionHintFading] = useState(false);
  /** Background mask/paint persist hit the storage quota; the warning stays
   * until dismissed — pixels are at risk until the user frees space. */
  const [persistQuota, setPersistQuota] = useState(null);
  /** Whether this browser can run the matting model in-page. */
  const [localMattingSupported] = useState(() => isLocalMattingSupported());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedInstanceChild, setSelectedInstanceChild] = useState(null);
  // Rulers/guides/snap-to-grid view aids. Persisted, not document state: they
  // describe how the user looks at a canvas, not what the canvas contains.
  const [showRulers, setShowRulers] = useState(
    () => getSetting(SHOW_RULERS_SETTING) !== false,
  );
  const [showGuides, setShowGuides] = useState(
    () => getSetting(SHOW_GUIDES_SETTING) !== false,
  );
  const [snapToGrid, setSnapToGrid] = useState(
    () => getSetting(SNAP_TO_GRID_SETTING) === true,
  );
  const [selectedGuideId, setSelectedGuideId] = useState(null);
  /** Document snapshot taken when a guide drag begins; the whole drag is one undo. */
  const guideDragOriginRef = useRef(null);
  // Comments panel/placement mode are view state, like rulers: the threads
  // themselves live in the page document (`doc.comments`).
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [adjustingInstance, setAdjustingInstance] = useState(null);
  const [returnCanvasId, setReturnCanvasId] = useState(null);
  const [navigationError, setNavigationError] = useState(false);
  const returnCanvasStackRef = useRef([]);
  const pendingNavigationRef = useRef(null);
  const [mediaImportBusy, setMediaImportBusy] = useState(false);
  const [mediaImportError, setMediaImportError] = useState(null);
  const mediaInputRef = useRef(null);
  const [swapPanels, setSwapPanels] = useState(false);
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
  /** Set on a successful apply; a timer clears it (see the effect below). */
  const [savedNotice, setSavedNotice] = useState(false);
  /** Right-click menu position, or null when closed. */
  const [contextMenu, setContextMenu] = useState(null);
  /** Press-and-hold "compare with original" preview state. */
  const [comparing, setComparing] = useState(false);
  /** Copy key for a failed one-click image action, shown as a toast. */
  const [imageActionError, setImageActionError] = useState(null);
  const [aiErrorText, setAiErrorText] = useState(null);
  /** Export popover state: open flag, chosen format and quality. */
  const [exportOpen, setExportOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState(false);
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
  /** Secondary tool subbar hover state: active family ID when mouse hovers top toolbar */
  const [hoveredFamily, setHoveredFamily] = useState(null);
  const hoverLeaveTimerRef = useRef(null);
  /** Pie Menu state: active family and screen coordinates { family, position: { x, y } } */
  const [pieMenu, setPieMenu] = useState(null);
  /** ⌘K palette / ⌘F find bar: editor overlays, not document state. */
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);

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

  /**
   * Writes the guide list through the same `setDoc` path every node edit uses,
   * so it persists in `.voo` (scene serialisation already carries `guides`)
   * and lands in undo history exactly once per call.
   */
  const writeDocumentGuides = useCallback(
    (nextGuides, { commit = true } = {}) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      const pageDoc = pageEngine.getDocument();
      if (!pageDoc) return;
      const guides = serialiseGuides(nextGuides);
      pageEngine.setDoc(
        { ...pageDoc, guides },
        commit ? { name: GUIDES_HISTORY_NAME } : { commit: false },
      );
      bump();
    },
    [focusedPageEngine],
  );

  /** Drag out of the ruler: create one guide and one history entry. */
  const handleCreateGuide = useCallback(
    ({ type, pos }) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      const existing = readDocumentGuides(pageEngine.getDocument());
      const created = createGuide({ type, pos }, existing);
      if (!created) return;
      writeDocumentGuides(addGuide(existing, created));
      setSelectedGuideId(created.id);
    },
    [focusedPageEngine, writeDocumentGuides],
  );

  /**
   * Move phases keep the drag atomic: `begin` snapshots the document, the
   * previews write without committing, and `commit` pushes a single entry.
   * `cancel` restores the snapshot (used by Escape and by drop-on-ruler).
   */
  const handleMoveGuide = useCallback(
    (id, pos, phase) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      if (phase === "begin") {
        guideDragOriginRef.current = pageEngine.getDocument();
        return;
      }
      if (phase === "cancel" || phase === "preview") {
        // Previews are drawn by the overlay from its own draft state; the
        // document is untouched until release, so a drag never re-renders the
        // whole editor on every pointer move and never spams history.
        if (phase === "cancel") guideDragOriginRef.current = null;
        return;
      }
      // Commit from the drag's origin snapshot so a multi-step move is one
      // entry; keyboard nudges have no snapshot and commit from the live doc.
      const baseDoc = guideDragOriginRef.current ?? pageEngine.getDocument();
      guideDragOriginRef.current = null;
      const guides = readDocumentGuides(baseDoc);
      writeDocumentGuides(updateGuide(guides, id, pos));
    },
    [focusedPageEngine, writeDocumentGuides],
  );

  const handleRemoveGuide = useCallback(
    (id) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      const guides = readDocumentGuides(pageEngine.getDocument());
      if (!guides.some((guide) => guide.id === id)) return;
      writeDocumentGuides(removeGuide(guides, id));
      setSelectedGuideId((current) => (current === id ? null : current));
    },
    [focusedPageEngine, writeDocumentGuides],
  );

  const handleClearGuides = useCallback(() => {
    const pageEngine = focusedPageEngine();
    if (!pageEngine) return;
    if (readDocumentGuides(pageEngine.getDocument()).length === 0) return;
    writeDocumentGuides([]);
    setSelectedGuideId(null);
  }, [focusedPageEngine, writeDocumentGuides]);

  /**
   * Comment edits go through the focused page's `setDoc` exactly once, named
   * so Undo reads "Comments". The mutator returns the same document for a
   * no-op (empty body, unknown thread), which skips the history entry.
   */
  const mutateDocumentComments = useCallback(
    (mutate) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return false;
      const pageDoc = pageEngine.getDocument();
      if (!pageDoc) return false;
      const base = {
        ...pageDoc,
        comments: normalizeComments(pageDoc.comments),
      };
      const nextDoc = mutate(base);
      if (!nextDoc || nextDoc === base) return false;
      pageEngine.setDoc(
        { ...nextDoc, comments: serializeComments(nextDoc) },
        { name: COMMENTS_HISTORY_NAME },
      );
      bump();
      return true;
    },
    [focusedPageEngine],
  );

  const handleCreateComment = useCallback(
    (x, y, body, author) => {
      mutateDocumentComments((pageDoc) =>
        addComment(pageDoc, { x, y, body, author }),
      );
    },
    [mutateDocumentComments],
  );

  const handleReplyComment = useCallback(
    (commentId, body, author) => {
      mutateDocumentComments((pageDoc) =>
        addReply(pageDoc, commentId, { body, author }),
      );
    },
    [mutateDocumentComments],
  );

  const handleResolveComment = useCallback(
    (commentId, resolved) => {
      mutateDocumentComments((pageDoc) =>
        setResolved(pageDoc, commentId, resolved),
      );
    },
    [mutateDocumentComments],
  );

  const handleDeleteComment = useCallback(
    (commentId) => {
      mutateDocumentComments((pageDoc) => deleteComment(pageDoc, commentId));
    },
    [mutateDocumentComments],
  );

  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setCommentMode(false);
  }, []);

  const toggleCommentsPanel = useCallback(() => {
    setCommentsOpen((previous) => !previous);
  }, []);

  const toggleCommentMode = useCallback(() => {
    setCommentMode((previous) => !previous);
  }, []);

  // Closing the panel disarms placement too, so the canvas never stays in a
  // click-to-comment mode with no visible way out.
  useEffect(() => {
    if (!commentsOpen) setCommentMode(false);
  }, [commentsOpen]);

  const toggleRulers = useCallback(() => {
    setShowRulers((previous) => {
      const next = !previous;
      void setSetting(SHOW_RULERS_SETTING, next);
      return next;
    });
  }, []);

  const toggleGuides = useCallback(() => {
    setShowGuides((previous) => {
      const next = !previous;
      void setSetting(SHOW_GUIDES_SETTING, next);
      if (!next) setSelectedGuideId(null);
      return next;
    });
  }, []);

  // ⌘K palette and ⌘F find bar. Both are editor overlays rather than document
  // state, so their open flags never reach `.voo` serialisation.
  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((previous) => !previous);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  const openFindReplace = useCallback(() => {
    setFindReplaceOpen(true);
  }, []);

  const closeFindReplace = useCallback(() => {
    setFindReplaceOpen(false);
  }, []);

  /** Selects the text layer that owns a find match, leaving the bar focused. */
  const focusFindMatch = useCallback(
    (match) => {
      if (!match?.nodeId) return;
      const pageEngine = focusedPageEngine();
      pageEngine?.selectNode?.(match.nodeId);
    },
    [focusedPageEngine],
  );

  /**
   * Commits a find & replace document through the focused page engine, named so
   * Undo reads "Find and replace" and Replace All lands as exactly one entry.
   */
  const applyFindReplaceDoc = useCallback(
    (nextDoc) => {
      if (!nextDoc) return;
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      if (pageEngine.getDocument?.() === nextDoc) return;
      pageEngine.setDoc(nextDoc, { name: FIND_REPLACE_HISTORY_NAME });
      bump();
    },
    [focusedPageEngine, bump],
  );

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
  // A 3D frame paints its scene background over the page colour, so the
  // Layers background row shows whichever one is actually visible.
  const sceneBackground = doc?.scene3d?.backgroundColor;
  const sceneBackgroundOpacity = doc?.scene3d?.backgroundOpacity ?? 1;
  const frameBackground =
    canvasType === "3d" &&
    sceneBackground &&
    sceneBackground !== "transparent" &&
    sceneBackgroundOpacity >= 1
      ? sceneBackground
      : doc?.backgroundColor || "#262626";
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
  /** The selected (blue) Puppet Warp pin, read straight from the engine. */
  const puppetPinId = engine?.getSelectedPuppetPin?.() ?? null;
  const puppetRotation = puppetPinId
    ? (engine?.getPuppetPinRotation?.(puppetPinId) ?? 0)
    : 0;

  const layers = doc ? doc.nodes : [];
  const canvasBackgroundColor =
    useDesignStore((state) => state.canvasBackgroundColor) || "#1e1e1e";
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
    focusedId &&
    !selected &&
    !selectedGroup &&
    !canvasBackgroundSelected,
  );

  /**
   * Free-canvas layout: artboards laid out left to right in camera-space,
   * each vertically centred against the tallest. Docs are read live because
   * their sizes settle as engines finish opening.
   */
  const readySignature = nodeIds
    .map((id) => {
      const state = enginesRef.current.get(id);
      return state?.ready ? `${state.width}x${state.height}` : "pending";
    })
    .join(",");
  const savedPositionById = useMemo(() => {
    const map = new Map();
    for (const node of nodes) {
      const saved =
        (editorArtboardLayouts instanceof Map
          ? editorArtboardLayouts.get(node.id)
          : editorArtboardLayouts?.[node.id]) ||
        node.data?.editorCanvasPosition;
      if (saved && (saved.x !== undefined || saved.y !== undefined)) {
        map.set(node.id, saved);
      }
    }
    return map;
  }, [nodes, editorArtboardLayouts]);
  const positionSignature = nodeIds
    .map((id) => {
      const position = savedPositionById.get(id);
      return `${position?.x ?? "auto"},${position?.y ?? "auto"}`;
    })
    .join(";");
  const freeLayouts = useMemo(() => {
    if (!multi) return [];
    const sizes = nodeIds.map((nodeId) => {
      const state = enginesRef.current.get(nodeId);
      const width = state?.ready
        ? state.width
        : (presentationOwner?.data.presentation.width ?? 1024);
      const height = state?.ready
        ? state.height
        : (presentationOwner?.data.presentation.height ?? 1024);
      return { nodeId, width, height };
    });
    const automatic = presentationId
      ? layoutPresentationPages(
          sizes.map((size, index) => ({ ...size, x: presentationRowX(sizes, index) })),
          { padding: FREE_PADDING, gap: FREE_GUTTER },
        )
      : gridArtboardLayouts(sizes);
    return automatic.map((layout) =>
      positionArtboard(layout, savedPositionById.get(layout.nodeId)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    multi,
    nodeIds,
    readySignature,
    positionSignature,
    presentationId,
    presentationOwner?.data.presentation.width,
    presentationOwner?.data.presentation.height,
  ]);

  const layoutById = useMemo(
    () => new Map(freeLayouts.map((entry) => [entry.nodeId, entry])),
    [freeLayouts],
  );

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
      rotation: doc.rotation ?? 0,
      flipX: doc.flipX ?? false,
      flipY: doc.flipY ?? false,
      opacity: doc.opacity ?? 1,
      blendMode: doc.blendMode ?? "normal",
      fill: doc.backgroundColor || "#ffffff",
      fills:
        doc.fills && doc.fills.length > 0
          ? doc.fills
          : doc.backgroundColor && doc.backgroundColor !== "transparent"
            ? [{ color: doc.backgroundColor, opacity: 1, type: "solid" }]
            : [{ color: "#ffffff", opacity: 1, type: "solid" }],
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
      visible: true,
      locked: false,
    };
  }, [doc, focusedId, isFrameSelected, frameLayout.x, frameLayout.y]);

  /**
   * Page/frame resize through the engine's document path.
   *
   * When top-level nodes carry explicit resize constraints, the resize and
   * their reflow are resolved together and committed once, so one undo entry
   * covers both. Documents without constraints keep the historical
   * `setDocumentSize` path (which centres contents and refits the viewport).
   */
  const applyPageResize = useCallback(
    (nextW, nextH, options = {}) => {
      const current = engine?.getDocument?.();
      const constrained = Boolean(
        current?.nodes?.some(
          (entry) => !entry.parentId && hasConstraints(entry),
        ),
      );
      if (!current || !constrained) {
        engine?.setDocumentSize?.(nextW, nextH);
        return;
      }
      const oldBox = {
        x: 0,
        y: 0,
        width: current.width,
        height: current.height,
      };
      // The resize op historically centres every top-level node, so capture
      // the pre-resize boxes and let the constraints resolve from those.
      const beforeBoxes = new Map(
        current.nodes
          .filter((entry) => !entry.parentId)
          .map((entry) => [
            entry.id,
            {
              x: entry.x,
              y: entry.y,
              width: entry.width,
              height: entry.height,
            },
          ]),
      );
      const resized = resizePageDocument(current, nextW, nextH);
      const next = reflowConstraints(resized, {
        parentId: null,
        oldBox,
        newBox: { x: 0, y: 0, width: resized.width, height: resized.height },
        beforeBoxes,
      });
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
        const layout = layoutById.get(focusedId);
        if (layout) {
          setEditorArtboardLayout(focusedId, {
            ...layout,
            width: nextW,
            height: nextH,
          });
        }
      }

      if (patch.fill !== undefined) {
        engine?.setBackgroundColor?.(patch.fill);
        engine?.setDocumentBackgroundColor?.(patch.fill);
      }
      if (patch.fills !== undefined) {
        const primaryColor = patch.fills?.[0]?.color;
        if (primaryColor) {
          engine?.setBackgroundColor?.(primaryColor);
          engine?.setDocumentBackgroundColor?.(primaryColor);
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
    if (!hasDoc) return;
    // A family the new mode's toolbar does not carry must not keep its subbar.
    setHoveredFamily(null);
  }, [focusedId, workbench, hasDoc]);
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
        if (liveDoc) return { ...liveDoc, id: liveDoc.id || liveDoc.canvasId || id };
        const canvasDoc = nodes.find((n) => n.id === id)?.data?.canvasDoc;
        if (canvasDoc) return { ...canvasDoc, id: canvasDoc.id || canvasDoc.canvasId || id };
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
      index.insert({
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

  useWorkspaceSkia({
    enabled: multi,
    canvasRef: workspaceCanvasRef,
    stageRef: freeStageRef,
    docs: workspaceDocs,
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

  // Sync artboard layouts and viewport dimensions into workflow store for target resolution.
  useEffect(() => {
    if (!multi || freeLayouts.length === 0) return;
    const stage = freeStageRef.current;
    if (stage) {
      setEditorViewport({
        width: stage.clientWidth || 1440,
        height: stage.clientHeight || 900,
      });
    }
    setEditorArtboardLayouts(layoutById);
  }, [
    multi,
    freeLayouts,
    layoutById,
    setEditorArtboardLayouts,
    setEditorViewport,
  ]);

  // Fine-grained hardware-accelerated transform sync for multi-artboard canvas pan.
  // Directly updates layer transform so pan operations do not trigger React re-renders
  // or individual artboard DOM mutations.
  useEffect(() => {
    if (!multi) return undefined;
    const syncTransform = (cam) => {
      const el = artboardLayerRef.current;
      if (!cam) return;
      if (freeGridRef.current) freeGridRef.current.style.backgroundPosition = `${cam.panX || 0}px ${cam.panY || 0}px`;
      if (!el) return;
      el.style.transform = `translate3d(${cam.panX || 0}px, ${cam.panY || 0}px, 0)`;
    };
    syncTransform(useDesignStore.getState().editorCamera);
    let lastCamera = useDesignStore.getState().editorCamera;
    return useDesignStore.subscribe((state) => {
      const cam = state.editorCamera;
      if (cam && cam !== lastCamera) {
        lastCamera = cam;
        syncTransform(cam);
      }
    });
  }, [multi]);

  /** AI generation commits a new Group candidate instead of mutating its source. */
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

  // Split Layers failures must be visible, not console-only: the alert toast
  // surfaces the reason for six seconds, the same pattern applyError uses.
  useEffect(() => {
    if (!splitLayersError) return undefined;
    const timer = setTimeout(() => clearSplitLayersError(), 6000);
    return () => clearTimeout(timer);
  }, [splitLayersError, clearSplitLayersError]);

  // The one-click image actions (auto enhance, portrait retouch) fail loudly
  // for the same reason Split Layers does: a button that appears to do nothing
  // reads as broken, and the retouch engine knows why it refused.
  useEffect(() => {
    if (!imageActionError) return undefined;
    const timer = setTimeout(() => setImageActionError(null), 6000);
    return () => clearTimeout(timer);
  }, [imageActionError]);

  // Repaint, expand, upscale and cutout report through maskError, which the
  // Properties panel shows only while its mask section is open. Echo each new
  // failure as a toast so a model run never ends in silence.
  useEffect(() => {
    if (!maskError) return undefined;
    setAiErrorText(
      maskError === true ? t("editor.ai.failed") : maskErrorCopy(maskError),
    );
    const timer = setTimeout(() => setAiErrorText(null), 8000);
    return () => clearTimeout(timer);
  }, [maskError, t]);

  useEffect(() => {
    if (!retouchError) return undefined;
    setImageActionError(
      retouchError === RETOUCH_TOO_LARGE
        ? "editor.retouch.tooLarge"
        : retouchError === "noImage"
          ? "editor.imageAction.noImage"
          : "editor.retouch.failed",
    );
    return undefined;
    // retouchErrorSeq is the failure's identity: the same code failing twice is
    // two events, and the second must toast as well.
  }, [retouchError, retouchErrorSeq]);

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
      // Adding the second page switches this page's camera mode and rebuilds
      // its engine. Capture the live master before that transition so its
      // document is available to instances and to the replacement engine.
      if (nodeIds.length === 1 && refId && engineState?.ready) {
        void handleBeforeDispose(refId, engineState.engine, true);
      }
      return addEditorPage(refId, customSize);
    },
    [focusedId, nodeIds, addEditorPage, handleBeforeDispose],
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

  const importMediaFiles = useCallback(
    (files, { point = null, targetEngine = null } = {}) => {
      const activeEngine = targetEngine || engine;
      if (!files?.length || !activeEngine || mediaImportBusy) return;
      setMediaImportBusy(true);
      setMediaImportError(null);
      void (async () => {
        for (const file of files) {
          await importPickedEditorFile(activeEngine, file, {
            point,
            openDocument: openVooDocument,
            importMedia: (file) => importEditorMediaFile(
              activeEngine, file, useDesignStore.getState(), { point },
            ),
          });
        }
      })()
        .then(() => {
          activeEngine.setTool(TOOL.SELECT);
          // Sound has no box on the stage, so the timeline is the only place
        })
        .catch((error) => {
          console.error("[Design Editor] Media import failed", error);
          setMediaImportError(t("editor.media.importFailed"));
        })
        .finally(() => setMediaImportBusy(false));
    },
    [engine, mediaImportBusy, t, openVooDocument],
  );

  const handleMediaDrop = useCallback(
    (event) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        editorMediaFileKind,
      );
      if (!files.length) return;
      event.preventDefault();

      const pageElement =
        event.target?.closest?.('[data-testid="editor-page"]') ||
        (typeof document !== "undefined" && document.elementsFromPoint
          ? document
              .elementsFromPoint(event.clientX, event.clientY)
              .map((el) => el.closest?.('[data-testid="editor-page"]'))
              .find(Boolean)
          : null) ||
        (typeof document !== "undefined" && document.elementFromPoint
          ? document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest?.('[data-testid="editor-page"]')
          : null);
      const targetNodeId = pageElement?.getAttribute("data-node-id");
      const targetEntry = targetNodeId
        ? enginesRef.current.get(targetNodeId)
        : null;
      const targetEngine = targetEntry?.engine || engine;
      const targetId = targetEntry ? targetNodeId : focusedId;
      if (targetId && targetId !== focusedId) {
        focusEditorPage(targetId);
      }

      const point =
        targetEntry && targetEngine?.toDocPoint
          ? targetEngine.toDocPoint(event.clientX, event.clientY)
          : null;

      importMediaFiles(files, { point, targetEngine });
    },
    [engine, focusedId, focusEditorPage, importMediaFiles],
  );

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
  // Shared free-canvas camera (multi-page only).

  /** The free stage's centre in stage coordinates, for cursor-anchored zoom. */
  const stageCentre = useCallback(() => {
    const stage = freeStageRef.current;
    return {
      x: (stage?.clientWidth ?? 0) / 2,
      y: (stage?.clientHeight ?? 0) / 2,
    };
  }, []);

  /** Fits the whole artboard row into the free stage. */
  const fitAll = useCallback(() => {
    const stage = freeStageRef.current;
    if (!stage || freeLayouts.length === 0) return;
    const fittingLayouts = presentationId
      ? [layoutById.get(focusedId) ?? freeLayouts[0]]
      : freeLayouts;
    const box = fittingLayouts.reduce(
      (acc, layout) => ({
        x: Math.min(acc.x, layout.x),
        y: Math.min(acc.y, layout.y),
        right: Math.max(acc.right, layout.x + layout.width),
        bottom: Math.max(acc.bottom, layout.y + layout.height),
      }),
      { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const width = box.right - box.x;
    const height = box.bottom - box.y;
    const panel = editorPanelLayout({
      stageWidth: stage.clientWidth,
      swapped: swapPanels,
      // Multi-page actions must remain clear when Properties opens after the
      // first Fit. Reserve its band so selection never moves the camera.
      reserveBothPanels:
        multi ||
        shouldReserveBothPanelInsets({
          layersPanelShown,
          propertiesOpen,
          historyOpen,
        }),
    });
    const insets = panel.insets;
    const camera = fitEditorPageCamera({
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      layout: { x: box.x, y: box.y, width, height },
      insets,
    });
    if (!camera) return;
    setEditorCamera(camera);
  }, [
    freeLayouts,
    multi,
    setEditorCamera,
    presentationId,
    focusedId,
    layoutById,
    swapPanels,
    layersPanelShown,
    propertiesOpen,
    historyOpen,
  ]);

  const zoomSharedStep = useCallback(
    (direction) =>
      setEditorCamera((prev) =>
        zoomCameraAt(prev, ZOOM_STEP ** direction, stageCentre()),
      ),
    [stageCentre, setEditorCamera],
  );
  const zoomSharedHundred = useCallback(
    () =>
      setEditorCamera((prev) => {
        const stage = freeStageRef.current;
        const focusedLayout = layoutById.get(focusedId);
        if (stage && focusedLayout) {
          return {
            zoom: 1,
            panX:
              (stage.clientWidth - focusedLayout.width) / 2 - focusedLayout.x,
            panY:
              (stage.clientHeight - focusedLayout.height) / 2 - focusedLayout.y,
          };
        }
        return zoomCameraAt(prev, 1 / prev.zoom, stageCentre());
      }),
    [stageCentre, setEditorCamera, focusedId, layoutById],
  );

  /**
   * Non-command-table actions the palette exposes: view toggles, zoom, panel
   * openers. Handlers are closures over the live editor state, so a palette row
   * always acts on the page the user is looking at.
   */
  const paletteActions = useMemo(
    () => [
      {
        id: "undo",
        labelKey: "editor.undo",
        label: "Undo",
        catalogKey: "editor.undo",
        run: () => void presentationHistory.undo(),
      },
      {
        id: "redo",
        labelKey: "editor.redo",
        label: "Redo",
        catalogKey: "editor.redo",
        run: () => void presentationHistory.redo(),
      },
      {
        id: "zoom-in",
        labelKey: "editor.zoomIn",
        label: "Zoom in",
        run: () => (multi ? zoomSharedStep(1) : engine?.zoomStep?.(1)),
      },
      {
        id: "zoom-out",
        labelKey: "editor.zoomOut",
        label: "Zoom out",
        run: () => (multi ? zoomSharedStep(-1) : engine?.zoomStep?.(-1)),
      },
      {
        id: "zoom-fit",
        labelKey: "editor.zoomFit",
        label: "Zoom to fit",
        run: () => (multi ? fitAll() : engine?.zoomToFit?.()),
      },
      {
        id: "zoom-100",
        labelKey: "editor.shortcut.zoom100",
        label: "Zoom to 100%",
        run: () =>
          multi ? zoomSharedHundred() : engine?.zoomToHundred?.(),
      },
      {
        id: "toggle-rulers",
        labelKey: "editor.rulers.toggle",
        label: "Show/hide rulers",
        catalogKey: "editor.rulers.toggle",
        run: toggleRulers,
      },
      {
        id: "toggle-guides",
        labelKey: "editor.guides.toggle",
        label: "Show/hide guides",
        catalogKey: "editor.guides.toggle",
        run: toggleGuides,
      },
      {
        id: "clear-guides",
        labelKey: "editor.guides.clearAll",
        label: "Clear all guides",
        run: handleClearGuides,
      },
      {
        id: "snap-to-grid",
        labelKey: "editor.snapping.toGrid",
        label: "Snap to grid",
        catalogKey: "editor.snapping.toGrid",
        run: toggleSnapToGrid,
      },
      {
        id: "toggle-comments",
        labelKey: "editor.comments.toggle",
        label: "Show/hide comments",
        catalogKey: "editor.comments.toggle",
        run: toggleCommentsPanel,
      },
      {
        id: "comment-mode",
        labelKey: "editor.comments.toggleAddMode",
        label: "Comment mode",
        run: toggleCommentMode,
      },
      {
        id: "find-replace",
        labelKey: "findReplace.title",
        label: "Find and replace",
        catalogKey: "findReplace.title",
        run: openFindReplace,
      },
      {
        id: "export",
        labelKey: "editor.exportTitle",
        label: "Export",
        run: () => setExportOpen(true),
      },
      {
        id: "shortcuts",
        labelKey: "editor.shortcuts.title",
        label: "Keyboard shortcuts",
        run: () => setShortcutsOpen(true),
      },
    ],
    [
      presentationHistory,
      multi,
      zoomSharedStep,
      zoomSharedHundred,
      engine,
      fitAll,
      toggleRulers,
      toggleGuides,
      handleClearGuides,
      toggleSnapToGrid,
      toggleCommentsPanel,
      toggleCommentMode,
      openFindReplace,
    ],
  );

  /**
   * Runs a palette row. Commands come from the editor's own command table, so
   * palette execution and agent execution share one implementation; actions
   * carry their handler from `paletteActions`.
   */
  const runPaletteCommand = useCallback(
    (command) => {
      setCommandPaletteOpen(false);
      if (!command) return;
      if (command.kind === "action") {
        command.run?.();
        return;
      }
      void executeEditorCommand(command.sourceId, engine).catch((error) => {
        if (error?.code === "NO_SELECTION" || error?.code === "EDITOR_NOT_OPEN") {
          return;
        }
        console.error(`command palette: ${command.sourceId} failed`, error);
      });
    },
    [engine],
  );

  // The saved notice hides itself. Owning the timer in an effect means closing
  // the editor inside those seconds cancels it, instead of leaving a
  // callback that sets state on a component that is gone. The notice also
  // carries the "Tab returns to the canvas" hint, so it stays up long enough
  // to be read, not just noticed.
  useEffect(() => {
    if (!savedNotice) return undefined;
    const timer = setTimeout(() => setSavedNotice(false), 3200);
    return () => clearTimeout(timer);
  }, [savedNotice]);

  useEffect(() => {
    if (!exportNotice) return undefined;
    const timer = setTimeout(() => setExportNotice(false), 8000);
    return () => clearTimeout(timer);
  }, [exportNotice]);

  // The save-failed banner clears itself too; it must never pin the editor
  // into a state that looks broken after the user has moved on.
  useEffect(() => {
    if (!applyError) return undefined;
    const timer = setTimeout(() => setApplyError(false), 6000);
    return () => clearTimeout(timer);
  }, [applyError]);

  // A region gesture that drew nothing (the pointer was not over a picture)
  // surfaces here as a toast, and clears itself — the engine keeps the reason
  // so the panel does not need its own copy. Error-toned hints are failures
  // (a model run that produced nothing, a stroke that failed): they render as
  // an alert pill and dwell six seconds instead of vanishing in a breath.
  const regionHintFromEngine = engine?.getRegionHint() ?? null;
  const regionHintTone = engine?.getRegionHintTone?.() ?? null;
  useEffect(() => {
    if (!regionHintFromEngine) {
      setRegionHint(null);
      setRegionHintFading(false);
      return undefined;
    }
    setRegionHint(regionHintFromEngine);
    setRegionHintFading(false);
    const isError = regionHintTone === "error";
    const fadeTimer = setTimeout(
      () => setRegionHintFading(true),
      isError ? 5600 : 1200,
    );
    const clearTimer = setTimeout(
      () => {
        engine?.setRegionHint(null);
        setRegionHint(null);
        setRegionHintFading(false);
      },
      isError ? 6000 : 1600,
    );
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(clearTimer);
    };
  }, [engine, regionHintFromEngine, regionHintTone]);

  // Background persist failures reach us through the engine persistence alert
  // bus: quota exhaustion must become a standing, dismissible warning — a
  // silently-swallowed error loses the user's pixel work on the next reload.
  useEffect(() => {
    const unsubscribe = subscribePersistenceAlert((alert) => {
      if (alert?.type === "persist-quota") {
        setPersistQuota({ source: alert.source ?? "unknown" });
      }
    });
    return unsubscribe;
  }, []);

  // Wheel over the free stage: scroll pans, ⌘/Ctrl+wheel zooms around the
  // cursor. Attached natively because React's onWheel is passive and would
  // swallow preventDefault.
  useEffect(() => {
    if (!multi || !visible) return undefined;
    const stage = freeStageRef.current;
    if (!stage) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = stage.getBoundingClientRect();
        setEditorCamera((prev) =>
          zoomCameraAt(prev, wheelZoomFactor(event.deltaY), {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          }),
        );
        return;
      }
      const { dx, dy } = wheelPanDelta(event);
      panEditorCamera(dx, dy);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);

    };
  }, [multi, visible, panEditorCamera, setEditorCamera]);

  // Fit the whole row once every page has finished opening.
  const fittedRef = useRef(null);
  useEffect(() => {
    if (!multi) return;
    const allReady = presentationId
      ? enginesRef.current.get(focusedId)?.ready
      : nodeIds.every((id) => enginesRef.current.get(id)?.ready);
    if (!allReady) return;
    const signature = (presentationId ? nodeIds : [...nodeIds].sort()).join(
      "|",
    );
    if (fittedRef.current === signature) return;
    const firstFit = fittedRef.current === null;
    fittedRef.current = signature;
    // A remembered group reopens exactly where its user left it; a hand
    // multi-select (or a first group edit with no saved view) fits the pages.
    const saved =
      editorRememberCamera && (!presentationId || firstFit)
        ? getGroupCamera(editingGroupId)
        : null;
    if (saved && saved.panX !== undefined && saved.panY !== undefined) {
      setEditorCamera({
        zoom: saved.zoom ?? 1,
        panX: saved.panX,
        panY: saved.panY,
      });
    } else {
      fitAll();
    }
  }, [
    multi,
    nodeIds,
    fitAll,
    setEditorCamera,
    editorRememberCamera,
    editingGroupId,
    getGroupCamera,
    presentationId,
    focusedId,
  ]);

  // A component jump is complete when its live page and visible stage are
  // ready. The normal multi-page fit runs first; this then focuses the target.
  useEffect(() => {
    const navigation = pendingNavigationRef.current;
    if (!navigation || navigation.pageId !== focusedId) return;
    const targetEngine = enginesRef.current.get(focusedId);
    if (!targetEngine?.ready) return;

    if (multi) {
      const stage = freeStageRef.current;
      const layout = layoutById.get(focusedId);
      if (!stage || !layout) return;
      if (navigation.kind === "enter") {
        const panel = editorPanelLayout({
          stageWidth: stage.clientWidth,
          swapped: swapPanels,
        });
        const insets = panel.insets;
        const camera = fitEditorPageCamera({
          stageWidth: stage.clientWidth,
          stageHeight: stage.clientHeight,
          layout,
          insets,
        });
        if (!camera) return;
        setEditorCamera(camera);
      } else if (navigation.camera) {
        const camera = navigation.camera;
        setEditorCamera(
          navigation.cameraMode === "shared"
            ? camera
            : {
                zoom: camera.zoom,
                panX: camera.panX - layout.x * camera.zoom,
                panY: camera.panY - layout.y * camera.zoom,
              },
        );
      }
    } else if (navigation.kind === "enter") {
      targetEngine.engine.zoomToFit?.();
    } else if (navigation.cameraMode === "local" && navigation.camera) {
      targetEngine.engine.setViewport?.(navigation.camera);
    }

    if (navigation.kind === "return") {
      const current = targetEngine.engine.getDocument();
      const ids = navigation.selectedIds.filter((id) =>
        current.nodes.some((node) => node.id === id),
      );
      targetEngine.engine.selectExactly(ids);
      if (navigation.playback) {
        targetEngine.engine.seekToTime(navigation.playback.time);
        if (navigation.playback.playing) targetEngine.engine.play();
      }
    }
    pendingNavigationRef.current = null;
  }, [
    focusedId,
    multi,
    readySignature,
    layoutById,
    swapPanels,
    setEditorCamera,
  ]);

  // Remember the free-canvas view for a group: when the editor closes (or the
  // set of pages changes), write the camera back onto the group node so the
  // next open restores it. A hand multi-select (no group) is never written.
  const cameraRef = useRef(useDesignStore.getState().editorCamera);
  cameraRef.current = useDesignStore.getState().editorCamera;
  useEffect(() => useDesignStore.subscribe((state) => {
    cameraRef.current = state.editorCamera;
  }), []);
  const rememberedRef = useRef({ groupId: null, active: false });
  useEffect(() => {
    if (multi && editorRememberCamera && editingGroupId) {
      rememberedRef.current = { groupId: editingGroupId, active: true };
      return;
    }
    const prev = rememberedRef.current;
    if (prev.active && prev.groupId) {
      saveGroupCamera(prev.groupId, cameraRef.current);
    }
    rememberedRef.current = { groupId: null, active: false };
  }, [multi, editorRememberCamera, editingGroupId, nodeIds, saveGroupCamera]);

  // Space arms the hand tool over the free canvas.
  useEffect(() => {
    if (!multi) return undefined;
    const isTypingTarget = (target) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    const setHand = (active) => {
      spaceRef.current = active;
      const stage = freeStageRef.current;
      if (stage) stage.style.cursor = active ? "grab" : "default";
    };
    const onKeyDown = (event) => {
      if (event.code !== "Space") return;
      if (event.target.closest?.("[data-presentation-overlay]")) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setHand(true);
    };
    const onKeyUp = (event) => {
      if (event.code !== "Space") return;
      setHand(false);
    };
    const onBlur = () => setHand(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [multi, visible]);

  // Free-stage pointer gestures: Space / middle-button drag pans, and clicking
  // the empty canvas deselects the focused page. Left-button drag on the empty
  // canvas (not over any artboard) also pans the free view — a view-only camera
  // offset that never writes back to workflow node positions.
  const onFreePointerDown = useCallback((event) => {
    const isPanTrigger = event.button === 1 || spaceRef.current;
    const isLeftClick = event.button === 0;

    if (!isPanTrigger && !isLeftClick) return;

    // Never pan when interacting with UI panels, menus, dialogs, form controls
    if (
      event.target.closest?.(
        '[role="dialog"], [role="menu"], [data-testid="editor-top-bar"], [data-testid="editor-toolbar"], [data-testid="editor-layers-panel"], [data-testid="editor-properties-panel"], [data-testid="agent-panel"], button, input, textarea, select',
      )
    ) {
      return;
    }

    // For plain left clicks without Space, let artboards handle their own selection/drawing/tools
    if (!isPanTrigger && event.target.closest?.("[data-editor-artboard]")) {
      return;
    }

    // Middle-button drag, space+drag, or drag on empty canvas: start panning camera
    event.preventDefault();
    if (isPanTrigger) {
      event.stopPropagation();
    }

    try {
      freeStageRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers and already-released ids cannot be captured;
      // the move/up handlers below still work without capture.
    }

    const stage = freeStageRef.current;
    if (stage) stage.style.cursor = "grabbing";

    panGestureRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      button: event.button,
    };
  }, []);
  const onFreePointerMove = useCallback(
    (event) => {
      const gesture = panGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.lastX;
      const dy = event.clientY - gesture.lastY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;

      if (!gesture.moved) {
        const totalDist = Math.hypot(
          event.clientX - (gesture.startX ?? gesture.lastX),
          event.clientY - (gesture.startY ?? gesture.lastY),
        );
        // Middle button or space drag pans immediately (threshold 1px)
        const threshold = gesture.button === 1 || spaceRef.current ? 1 : 4;
        if (totalDist < threshold) return;
        gesture.moved = true;
      }

      panEditorCamera(dx, dy);
    },
    [panEditorCamera],
  );
  const onFreePointerUp = useCallback(
    (event) => {
      const gesture = panGestureRef.current;
      if (gesture?.pointerId !== event.pointerId) return;
      panGestureRef.current = null;

      try {
        freeStageRef.current?.releasePointerCapture?.(event.pointerId);
      } catch {
        // The pointer may already be gone; nothing left to release.
      }
      const stage = freeStageRef.current;
      if (stage) stage.style.cursor = spaceRef.current ? "grab" : "default";

      // A bare left-click on empty canvas (never dragged) deselects the focused
      // page and its selection, like Figma.
      if (!gesture.moved && gesture.button === 0 && !spaceRef.current) {
        setCanvasBackgroundSelected(true);
        enginesRef.current.get(focusedId)?.engine?.select?.(null);
        focusEditorPage(null);
      }
    },
    [focusedId, focusEditorPage],
  );

  // Ref populated by ToolPropertiesSection so the X shortcut can swap colours.
  const swapColorsRef = useRef(null);

  // Space-drag on a title keeps the camera pan gesture available.
  const onTitlePanDown = useCallback((event) => {
    if (
      event.button !== 0 ||
      event.target.closest?.(
        "button, input, textarea, [role=dialog], [role=menu]",
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    try {
      // Capture on the title label itself so the drag's move/up retarget here,
      // independent of the (non-capturing) free-stage handlers.
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; move/up still work.
    }
    panGestureRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      button: event.button,
    };
  }, []);

  const onTitlePointerDown = useCallback(
    (nodeId, event) => {
      if (spaceRef.current) {
        onTitlePanDown(event);
        return;
      }
      if (
        event.button !== 0 ||
        event.target.closest?.(
          "button, input, textarea, [role=dialog], [role=menu]",
        )
      )
        return;
      const layout = layoutById.get(nodeId);
      if (!layout) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic pointers can complete through the move/up handlers.
      }
      artboardDragRef.current = {
        pointerId: event.pointerId,
        nodeId,
        start: { x: layout.x, y: layout.y },
        clientX: event.clientX,
        clientY: event.clientY,
        next: { x: layout.x, y: layout.y },
        moved: false,
      };
    },
    [layoutById, onTitlePanDown],
  );

  const onTitlePointerMove = useCallback(
    (event) => {
      const gesture = artboardDragRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        onFreePointerMove(event);
        return;
      }
      const dx = event.clientX - gesture.clientX;
      const dy = event.clientY - gesture.clientY;
      if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
      const next = dragArtboardPosition(
        gesture.start,
        { x: dx, y: dy },
        cameraZoom,
      );
      if (!next) return;
      gesture.moved = true;
      gesture.next = next;
      const board = event.currentTarget.closest("[data-editor-artboard]");
      if (board) {
        board.style.left = `${next.x * cameraZoom}px`;
        board.style.top = `${next.y * cameraZoom}px`;
      }
      const layout = layoutById.get(gesture.nodeId);
      if (layout)
        setEditorArtboardLayout(gesture.nodeId, { ...layout, ...next });
    },
    [cameraZoom, layoutById, onFreePointerMove, setEditorArtboardLayout],
  );

  const onTitlePointerUp = useCallback(
    (event) => {
      const gesture = artboardDragRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        onFreePointerUp(event);
        return;
      }
      artboardDragRef.current = null;
      try {
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
      } catch {
        // The browser may release capture before pointercancel arrives.
      }
      const cancelled = event.type === "pointercancel";
      if (!gesture.moved) {
        // A plain click on a frame title selects that frame, as Figma does.
        if (!cancelled) handleFocusCanvas(gesture.nodeId);
        return;
      }
      if (cancelled) {
        const board = event.currentTarget.closest("[data-editor-artboard]");
        if (board) {
          board.style.left = `${gesture.start.x * cameraZoom}px`;
          board.style.top = `${gesture.start.y * cameraZoom}px`;
        }
        const layout = layoutById.get(gesture.nodeId);
        if (layout) setEditorArtboardLayout(gesture.nodeId, layout);
        return;
      }
      moveEditorArtboard(gesture.nodeId, gesture.next);
    },
    [
      cameraZoom,
      handleFocusCanvas,
      layoutById,
      moveEditorArtboard,
      onFreePointerUp,
      setEditorArtboardLayout,
    ],
  );

  /**
   * Figma-like: with the Select tool and nothing selected in a frame, pressing
   * on the frame body drags the frame. It runs the same gesture as the title
   * bar, listening on the artboard element while the pointer is captured.
   */
  const onArtboardBodyPointerDown = useCallback(
    (nodeId, event) => {
      if (event.button !== 0 || spaceRef.current) return;
      if (
        event.target.closest?.(
          "[data-editor-artboard-title], button, input, textarea, [role=dialog], [role=menu], [role=separator], [data-interactive]",
        )
      )
        return;
      if (tool !== TOOL.SELECT) return;
      const isFocused = nodeId === focusedId;
      if (isFocused && (engine?.getSelectedIds?.().length ?? 0) > 0) return;
      const board = event.currentTarget;
      onTitlePointerDown(nodeId, event);
      if (!artboardDragRef.current) return;
      const move = (e) => onTitlePointerMove(e);
      const up = (e) => {
        onTitlePointerUp(e);
        board.removeEventListener("pointermove", move);
        board.removeEventListener("pointerup", up);
        board.removeEventListener("pointercancel", up);
      };
      board.addEventListener("pointermove", move);
      board.addEventListener("pointerup", up);
      board.addEventListener("pointercancel", up);
    },
    [engine, focusedId, tool, onTitlePointerDown, onTitlePointerMove, onTitlePointerUp],
  );

  // Keyboard zoom steps the shared camera when several pages are open, and the
  // focused page's own viewport otherwise.
  // Components are made from Design and Motion frames, not from 3D scenes.
  const canCreateComponent = getCanvasType(doc) !== "3d";

  useEditorShortcuts({
    engine,
    enabled: visible,
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

  /**
   * The page's own engine and the image a taskbar action should act on — the
   * same resolution the adjustment and preset handlers use, so a click on a
   * background page is not routed to the focused one.
   */
  const imageTargetFor = useCallback(
    (nodeId) => {
      const pageEngine = enginesRef.current.get(nodeId)?.engine || engine;
      const pageDoc =
        pageEngine?.getDocument?.() || snapshotsRef.current.get(nodeId)?.doc;
      return {
        pageEngine,
        target:
          pageEngine?.getSelected?.() ||
          pageDoc?.nodes?.find((n) => n.kind === "image") ||
          null,
      };
    },
    [engine],
  );

  /**
   * One-tap auto enhance: measure the layer's own pixels, plan the correction,
   * and write the plan into the node's adjustments as one undoable edit.
   *
   * The measurement comes from a downscaled copy — statistics do not need
   * resolution, and a click must not walk a full-size layer — while the edit
   * itself stays in adjustment rows, so the picture is never re-encoded.
   */
  const runAutoEnhance = useCallback(
    (nodeId) => {
      const { pageEngine, target } = imageTargetFor(nodeId);
      if (!pageEngine) return;
      if (!target || target.kind !== "image") {
        setImageActionError("editor.imageAction.noImage");
        return;
      }
      try {
        const bitmap = pageEngine.getNodeBitmap?.(target) ?? null;
        if (!bitmap) throw new Error("bitmapMissing");
        const { rgba } = readImageRgba(bitmap, {
          maxEdge: ENHANCE_SAMPLE_EDGE,
        });
        const plan = planOneTapEnhance(rgba);
        // updateNode commits: it goes through commitOrPreviewEditorDocument, so
        // this single call is the whole history entry (there is no separate
        // engine commit step to call).
        pageEngine.updateNode(target.id, {
          adjustments: mergeEnhanceAdjustments(target.adjustments, plan),
        });
      } catch (error) {
        console.error("auto enhance failed", error);
        setImageActionError("editor.enhance.failed");
      }
    },
    [imageTargetFor],
  );

  /**
   * Portrait retouch of the selected layer. The runner owns the focused page's
   * engine, so a background page is refused here rather than retouched through
   * the wrong one — the same limit the upscale button already has.
   */
  const runPortraitRetouch = useCallback(
    (nodeId, strengths) => {
      const { pageEngine } = imageTargetFor(nodeId);
      if (!pageEngine || pageEngine !== engine) return;
      void retouchImage(strengths);
    },
    [engine, imageTargetFor, retouchImage],
  );

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
  const streamingLayout = streamingPreview
    ? {
        nodeId: streamingPageId,
        html: streamingPreview,
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
    setSwapPanels((swapped) => !swapped);
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
      aria-hidden={!visible}
      className={`absolute bottom-0 left-0 top-0 z-50 flex flex-col overflow-hidden rounded-b-2xl bg-surface-canvas ${
        dockAgent ? "right-[376px]" : "right-0"
      } ${visible ? "" : "invisible pointer-events-none"}`}
      {...dropHandlers}
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
            onAuxClick={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
          >
            <canvas
              ref={workspaceCanvasRef}
              data-testid="workspace-skia-canvas"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
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
                    onEditSvg={handleOpenSvgEdit}
                    onCreateComponent={
                      canCreateComponent ? handleCreateComponent : null
                    }
                    onDetachInstance={handleDetachInstance}
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
            className="h-full w-full overflow-hidden"
          >
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
                onEditSvg={handleOpenSvgEdit}
                onCreateComponent={
                  canCreateComponent ? handleCreateComponent : null
                }
                onDetachInstance={handleDetachInstance}
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
              onExport={() => void exportImage()}
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
              swapSide={inspectorSwap}
              onToggleSide={toggleSwapPanels}
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
              onMutate={(patch) =>
                nestedEngine.updateNode(nestedNode.id, patch, { commit: false })
              }
              onCommit={() => nestedEngine.commit("editor.history.entry.layer")}
            />
          )
        ) : propertiesOpen && propertyObject?.kind === "canvasInstance" ? (
          <PropertiesPanelShell
            swapSide={inspectorSwap}
            onToggleSide={toggleSwapPanels}
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
                if (selected?.id) engine?.updateNode(selected.id, { arrowSize: size });
                else engine?.setArrowSize?.(size);
              },
              arrowStart: selected?.arrowStart ?? (engine?.getArrowStart?.() ?? false),
              onArrowStart: (val) => {
                if (selected?.id) engine?.updateNode(selected.id, { arrowStart: val });
                else engine?.setArrowStart?.(val);
              },
              arrowEnd: selected?.arrowEnd ?? true,
              onArrowEnd: (val) => {
                if (selected?.id) engine?.updateNode(selected.id, { arrowEnd: val });
              },
              strokeWidth: selected?.strokeWidth ?? (engine?.getStrokeWidth?.() ?? 1),
              onStrokeWidth: (val) => {
                if (selected?.id) engine?.updateNode(selected.id, { strokeWidth: val });
                else engine?.setStrokeWidth?.(val);
              },
              strokeStyle: selected?.strokeStyle || (selected?.strokeDashed ? "dashed" : "solid"),
              onStrokeStyle: (style) => {
                if (selected?.id) engine?.updateNode(selected.id, { strokeStyle: style, strokeDashed: style === "dashed" });
              },
              cornerRadius: selected?.cornerRadius ?? selected?.radius ?? 0,
              onCornerRadius: (val) => {
                if (selected?.id) engine?.updateNode(selected.id, { cornerRadius: val });
              },
              cornerType: selected?.cornerType || "round",
              onCornerType: (type) => {
                if (selected?.id) engine?.updateNode(selected.id, { cornerType: type });
              },
              sides: selected?.spikes ?? selected?.sides ?? 5,
              onSides: (val) => {
                if (selected?.id) engine?.updateNode(selected.id, { spikes: val, sides: val });
              },
              starRatio: selected?.ratio ?? 0.5,
              onStarRatio: (val) => {
                if (selected?.id) engine?.updateNode(selected.id, { ratio: val });
              },
              // Text Tool properties (Affinity Style)
              fontFamily: selected?.fontFamily || engine?.getDefaultFontFamily?.() || "Inter",
              onFontFamily: (family) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { fontFamily: family });
                else engine?.setDefaultFontFamily?.(family);
              },
              fontWeight: selected?.fontWeight || 400,
              onFontWeight: (weight) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { fontWeight: weight });
                else engine?.setDefaultFontWeight?.(weight);
              },
              fontSize: selected?.fontSize || 16,
              onFontSize: (sz) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { fontSize: sz });
                else engine?.setDefaultFontSize?.(sz);
              },
              italic: selected?.italic || false,
              onItalic: (val) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { italic: val });
              },
              underline: selected?.underline || false,
              onUnderline: (val) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { underline: val });
              },
              align: selected?.align || "left",
              onAlign: (val) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { align: val });
              },
              lineHeight: selected?.lineHeight || 1.25,
              onLineHeight: (val) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { lineHeight: val });
              },
              letterSpacing: selected?.letterSpacing || 0,
              onLetterSpacing: (val) => {
                if (selected?.id && selected.kind === "text") engine?.updateNode(selected.id, { letterSpacing: val });
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
            onLayout={
              selectedIds.length >= 1
                ? (layout, argument) =>
                    engine?.layoutSelection(layout, argument)
                : null
            }
            onCombine={
              canCombineSelection
                ? (operation) => engine?.combineSelected(operation)
                : null
            }
            docSize={doc}
            isBackground={canvasBackgroundSelected}
            backgroundColor={canvasBackgroundColor}
            onSetDocumentSize={applyPageResize}
            framePosition={layoutById.get(focusedId) ?? null}
            onSetFramePosition={(x, y) => {
              const layout = layoutById.get(focusedId);
              if (layout) setEditorArtboardLayout(focusedId, { ...layout, x, y });
            }}
            onSetBackgroundColor={(next) => {
              setCanvasBackgroundColor?.(next);
            }}
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
              for (const id of ids) {
                engine?.updateNode(id, patch, { commit: false });
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
            onSelect={(index) => {
              setCanvasBackgroundSelected(false);
              setSelectedInstanceChild(null);
              engine?.selectExactly([layers[index].id]);
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
            onHoverFamily={(fam) => {
              if (hoverLeaveTimerRef.current) {
                clearTimeout(hoverLeaveTimerRef.current);
                hoverLeaveTimerRef.current = null;
              }
              setHoveredFamily(fam);
            }}
            onLeaveFamily={() => {
              if (hoverLeaveTimerRef.current)
                clearTimeout(hoverLeaveTimerRef.current);
              hoverLeaveTimerRef.current = setTimeout(() => {
                setHoveredFamily(null);
              }, 180);
            }}
          />
        )}

        {workbench.subbar ? (
          <EditorToolSubbar
            activeFamilyId={hoveredFamily}
            tool={tool}
            onTool={runTool}
            marqueeMode={engine?.getMarqueeMode() ?? "rect"}
            onMarqueeMode={(mode) => engine?.setMarqueeMode(mode)}
            brushMode={engine?.getBrushMode() ?? "normal"}
            onBrushMode={(mode) => engine?.setBrushMode(mode)}
            healingMode={engine?.getHealingMode() ?? "aiRepair"}
            onHealingMode={(mode) => engine?.setHealingMode(mode)}
            onSelect={() => {
              if (hoverLeaveTimerRef.current) {
                clearTimeout(hoverLeaveTimerRef.current);
                hoverLeaveTimerRef.current = null;
              }
              setHoveredFamily(null);
            }}
            onMouseEnter={() => {
              if (hoverLeaveTimerRef.current) {
                clearTimeout(hoverLeaveTimerRef.current);
                hoverLeaveTimerRef.current = null;
              }
            }}
            onMouseLeave={() => {
              if (hoverLeaveTimerRef.current)
                clearTimeout(hoverLeaveTimerRef.current);
              hoverLeaveTimerRef.current = setTimeout(() => {
                setHoveredFamily(null);
              }, 180);
            }}
          />
        ) : null}

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

        {/* Vector-edit sub-tools, only while a pen node is open for editing. */}
        {engine?.penEdit ? (
          <EditorPenSubbar
            subTool={engine.getPenSubTool?.() ?? "move"}
            onSubTool={(mode) => engine.setPenSubTool?.(mode)}
            onCloseEdit={() => engine.endEdit?.()}
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
              onFit={multi ? fitAll : () => engine?.zoomToFit()}
              grid={grid}
              onToggleGrid={() => {
                const next = grid ? null : { enabled: true, size: 32 };
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
              onToggleSnapping={toggleSnapping}
            >
              {rulersVisible ? (
                <EditorCanvasAids
                  showRulers={showRulers}
                  showGuides={showGuides}
                  snapToGrid={snapToGrid}
                  canClearGuides={documentGuides.length > 0}
                  onToggleRulers={toggleRulers}
                  onToggleGuides={toggleGuides}
                  onToggleSnapToGrid={toggleSnapToGrid}
                  onClearGuides={handleClearGuides}
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
            onImportMedia={() => mediaInputRef.current?.click()}
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

function AiRepairDownloadDialog({ state, onDownload, onCancel }) {
  const { t } = useI18n();
  const isMatting = state.kind === "matting";
  const copy = isMatting ? "editor.matting" : "editor.aiRepair";
  const downloading = state.phase === "downloading";
  const running = state.phase === "running";
  const failed = state.phase === "failed" || state.phase === "runFailed";
  const detail = downloading
    ? t(`${copy}.downloading`, { percent: state.progress ?? 0 })
    : running
      ? t(`${copy}.running`)
      : failed
        ? t(
            state.phase === "runFailed"
              ? `${copy}.runFailed`
              : `${copy}.downloadFailed`,
          )
        : t(`${copy}.downloadHint`);

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-repair-download-title"
        className="w-full max-w-xs rounded-3xl border border-white/10 bg-neutral-900 p-4 shadow-panel"
      >
        <h2
          id="ai-repair-download-title"
          className="text-[12px] font-medium text-neutral-100"
        >
          {t(`${copy}.downloadTitle`)}
        </h2>
        <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">
          {detail}
        </p>
        {downloading ? (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#E5B2FF] transition-[width] duration-200"
              style={{
                width: `${Math.max(0, Math.min(100, state.progress ?? 0))}%`,
              }}
            />
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          {!downloading && !running ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-3 py-1.5 text-[10px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-100"
            >
              {t("editor.cancel")}
            </button>
          ) : null}
          {!downloading && !running ? (
            <button
              type="button"
              onClick={onDownload}
              className="rounded-xl bg-[#E5B2FF] px-3 py-1.5 text-[10px] font-medium text-black transition-colors hover:bg-[#eed0ff]"
            >
              {failed ? t(`${copy}.retry`) : t(`${copy}.download`)}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

AiRepairDownloadDialog.propTypes = {
  state: PropTypes.shape({
    kind: PropTypes.string,
    phase: PropTypes.string.isRequired,
    progress: PropTypes.number,
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

// Keep pan subscriptions local to overlays that need screen-space coordinates.
function CameraPositionedOverlay({ component: Component, layout, ...props }) {
  const camera = useDesignStore((state) => state.editorCamera);
  return <Component {...props} zoom={camera?.zoom ?? 1}
    offsetX={(layout?.x ?? 0) * (camera?.zoom ?? 1) + (camera?.panX ?? 0)}
    offsetY={(layout?.y ?? 0) * (camera?.zoom ?? 1) + (camera?.panY ?? 0)} />;
}
