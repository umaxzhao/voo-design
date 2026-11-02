import React, { useEffect, useState } from "react";
import { useI18n } from "../use_i18n.js";
import { CANVAS_TYPE } from "../editor/scene_doc_factory.js";
import { FRAME_TYPE_ICON_TONES } from "./editor_page_constants.js";
import { editorPagePropTypes } from "./editor_page_contract.js";
import { suggestOutpaintPlanForNode } from "./editor_page_outpaint.js";
import { useEditorPageEngine } from "./editor_hooks/use_editor_page_engine.js";
import { useEditorPageChrome, useEditorPageRefs } from "./editor_hooks/use_editor_page_chrome.js";
import { editorPageInteractions } from "./editor_page_interactions.js";
import EditorPageArtwork from "./editor_page_artwork.jsx";
import EditorPageOverlays from "./editor_page_overlays.jsx";
import EditorPageFrameLabels from "./editor_page_frame_labels.jsx";
import EditorFreePage from "./editor_free_page.jsx";
import EditorFullPage from "./editor_full_page.jsx";
import StreamingLayoutPreview from "./streaming_layout_preview.jsx";
export { CANVAS_TYPE_TONES, FRAME_TYPE_ICON_TONES } from "./editor_page_constants.js";

/** Orchestrate one page while preserving its persistent engine and keyed overlays. */
export default function EditorPage({
  readOnly = false,
  nodeId,
  title,
  focused,
  active,
  mode,
  rect = null,
  sharedZoom = 1,
  workspaceRendererReady = true,
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
  /** How many instances use this page as their main component. */
  componentUses = 0,
  /** (nodeId, name) => void: renames this frame; omit to make it fixed. */
  onRenamePage = null,
  /** Pointer handlers for the title label drag-to-pan handle, or null. */
  titlePanHandlers = null,
  onBodyPointerDown = null,
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
  /** (stageWidth) => { left, right }: stage the fit keeps clear. */
  getFitInsets = null,
}) {
  const { t } = useI18n();
  const free = mode === "free";
  const refs = useEditorPageRefs(free);
  const props = {
    readOnly, nodeId, title, focused, active,
    mode, rect, sharedZoom, workspaceRendererReady, snapshot,
    onFocus, onEngine, onBeforeDispose, onChange, onGeneratedOutput,
    onVisibility, onRegionCutout, onAddPoint, onRepaint, onRepaintNode,
    onRepaintSelection, onOutpaintSubmit, onAddCanvas, onDeleteCanvas, isLast,
    cutoutBusy, repaintBusy, onAutoMask, autoMaskBusy, onAutoEnhance,
    onPortraitRetouch, portraitRetouchBusy, onSplitLayers, splitLayersBusy, onUpscale,
    upscaleBusy, onAddAdjustmentLayer, onApplyPreset, getBitmap, componentUses,
    onRenamePage, titlePanHandlers, onBodyPointerDown, pageTitleActions, resolveCanvas,
    selectedInstanceChild, onSelectInstanceChild, onOpenCanvasSource, adjustingInstanceId, onAdjustView,
    onFinishAdjustView, onCancelAdjustView, onCanvasTypeChanged, streamingLayout, getFitInsets,
  };
  const state = useEditorPageEngine({ props, refs, free, t });
  const { engine, selected, selectedIds, tool, doc } = state;
  // The layer being outpainted, while its grow-frame gesture is active.
  const [renaming, setRenaming] = useState(false);
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

  useEffect(() => {
    const handleOutpaintRequest = (event) => {
      if (
        selected?.kind !== "image" ||
        event.detail?.nodeId !== selected.id ||
        !onOutpaintSubmit
      ) {
        return;
      }
      setOutpaintNode(selected);
      setOutpaintPlan(suggestOutpaintPlanForNode(engine, selected));
    };
    window.addEventListener("editor:request-outpaint", handleOutpaintRequest);
    return () =>
      window.removeEventListener("editor:request-outpaint", handleOutpaintRequest);
  }, [engine, onOutpaintSubmit, selected]);

  const chrome = useEditorPageChrome({ props, refs, free, engine, renaming });
  const interactions = editorPageInteractions({ ...props, ...state });
  const iconTone = FRAME_TYPE_ICON_TONES[state.canvasType] || FRAME_TYPE_ICON_TONES[CANVAS_TYPE.DESIGN];
  const page = { ...props, ...state, ...refs, ...chrome, ...interactions, free, t,
    renaming, setRenaming, startRename, iconTone, outpaintNode, setOutpaintNode,
    outpaintPlan, setOutpaintPlan, pageError: state.error, retryPage: state.retry };
  const content = { ...page,
    canvases: <EditorPageArtwork page={page} />,
    overlays: <EditorPageOverlays page={page} />,
    frameLabels: <EditorPageFrameLabels page={page} />,
    streamingContent: streamingLayout ? <StreamingLayoutPreview
      previewHtml={streamingLayout.html} width={streamingLayout.width}
      height={streamingLayout.height} t={t} /> : null,
    contextualTaskBarProps: {
      engine,
      selectedIds,
      tool,
      selected,
      doc,
      onRepaintNode,
      onRepaintSelection,
      onOutpaintSubmit,
      onAutoMask,
      autoMaskBusy,
      onAddAdjustmentLayer,
      onApplyPreset,
      getBitmap,
      onUpscale,
      upscaleBusy,
      onAutoEnhance,
      onPortraitRetouch,
      portraitRetouchBusy,
      onSplitLayers,
      splitLayersBusy,
    },
  };
  return free ? <EditorFreePage page={content} /> : <EditorFullPage page={content} />;
}
EditorPage.propTypes = editorPagePropTypes;
