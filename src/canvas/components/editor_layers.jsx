import { useRef } from "react";
import EditorLayersResize from "./editor_layers_resize.jsx";
import EditorLayersHeader from "./editor_layers_header.jsx";
import EditorLayersAssets from "./editor_layers_assets.jsx";
import EditorLayersControls from "./editor_layers_controls.jsx";
import EditorLayersTree from "./editor_layers_tree.jsx";
import EditorLayersFooter from "./editor_layers_footer.jsx";
import EditorLayersPopovers from "./editor_layers_popovers.jsx";
import EditorLayerContextMenu from "./editor_layer_context_menu.jsx";
import useEditorLayersController from "./use_editor_layers_controller.js";
import { editorLayersPropTypes } from "./editor_layers_contract.js";
import { LAYERS_PANEL_MAX_HEIGHT_CLASS } from "./editor_panel_clearance.js";
export { handleLayerRenameKeyDown } from "./editor_layer_rename.js";
/**
 * A re-render that produces identical output writes no DOM, so a MutationObserver
 * cannot see the layer panel re-rendering — the render count is the only
 * observable for the "idle hover must not re-render the tree" contract, and it
 * is what `scripts/verify-layer-hover-mutations.mjs` asserts. Null unless the
 * harness opted in under ?voo-test=1, so normal runs pay one property read.
 */
const LAYER_PANEL_RENDER_COUNTER = typeof window !== "undefined" && window.location?.search?.includes("voo-test=1") ? "__vooTestLayerPanelRenders" : null;
export default function EditorLayers({
  objects,
  assetEngine = null,
  bottomInset = 0,
  activeIndex = -1,
  backgroundColor = "#262626",
  selectedIds = [],
  selectedGroupId = null,
  isBackgroundSelected = false,
  isolationGroupId = null,
  onSelect,
  onToggleSelect,
  onSelectExactly = null,
  onSelectBackground = () => {},
  onSelectGroup = () => {},
  onToggle,
  onToggleLock = () => {},
  onToggleLockTransparency = () => {},
  onToggleLockPosition = () => {},
  onToggleLockImagePixels = () => {},
  onReorder = null,
  onReorderGroup = null,
  onRemove,
  onRemoveMask = null,
  onDeleteSelected = null,
  onRename = null,
  onLayerToFront = () => {},
  onLayerToBack = () => {},
  onRasterize = null,
  onConvertToPath = null,
  onDuplicateLayer = () => {},
  onMutate,
  onCommit,
  getBitmap = null,
  getNodeMask = null,
  maskEdit = null,
  onBeginMaskEdit = null,
  onEndMaskEdit = null,
  swapSide = false,
  onToggleSide = null,
  mobileExpanded = false,
  onMobileToggleExpanded = null,
  onAddAdjustmentLayer = null,
  onAddLayer = null,
  onAddMask = null,
  onGroupSelected = null,
  canGroupSelected = false,
  onCombineSelected = null,
  canCombineSelected = false,
  onClipInto = null,
  onMoveIntoGroup = null,
  onMoveNodeToRoot = null,
  canvasPages = [],
  selectedCanvasIds = null,
  activeCanvasId = null,
  onFocusCanvas = null,
  onSelectCanvasLayer = null,
  onOpenCanvasInstance = null,
  resolveCanvas = null,
  selectedInstanceChild = null,
  onSelectInstanceChild = null,
  initialCollapsedCanvasIds = null,
  initialSearch = ""
}) {
  if (LAYER_PANEL_RENDER_COUNTER) {
    window[LAYER_PANEL_RENDER_COUNTER] = (window[LAYER_PANEL_RENDER_COUNTER] ?? 0) + 1;
  }
  const props = {
    assetEngine,
    objects,
    bottomInset,
    activeIndex,
    backgroundColor,
    selectedIds,
    selectedGroupId,
    isBackgroundSelected,
    isolationGroupId,
    onSelect,
    onToggleSelect,
    onSelectExactly,
    onSelectBackground,
    onSelectGroup,
    onToggle,
    onToggleLock,
    onToggleLockTransparency,
    onToggleLockPosition,
    onToggleLockImagePixels,
    onReorder,
    onReorderGroup,
    onRemove,
    onRemoveMask,
    onDeleteSelected,
    onRename,
    onLayerToFront,
    onLayerToBack,
    onRasterize,
    onConvertToPath,
    onDuplicateLayer,
    onMutate,
    onCommit,
    getBitmap,
    getNodeMask,
    maskEdit,
    onBeginMaskEdit,
    onEndMaskEdit,
    swapSide,
    onToggleSide,
    mobileExpanded,
    onMobileToggleExpanded,
    onAddAdjustmentLayer,
    onAddLayer,
    onAddMask,
    onGroupSelected,
    canGroupSelected,
    onCombineSelected,
    canCombineSelected,
    onClipInto,
    onMoveIntoGroup,
    onMoveNodeToRoot,
    canvasPages,
    selectedCanvasIds,
    activeCanvasId,
    onFocusCanvas,
    onSelectCanvasLayer,
    onOpenCanvasInstance,
    resolveCanvas,
    selectedInstanceChild,
    onSelectInstanceChild,
    initialCollapsedCanvasIds,
    initialSearch
  };
  const model = useEditorLayersController(props);
  const panelRef = useRef(null);
  const sideClass = swapSide ? "right-4" : "left-4";
  const {
    t,
    panelTab
  } = model;
  return <aside
    ref={panelRef}
    data-testid="editor-layers-panel"
    aria-label={t(panelTab === "assets" ? "editor.assets" : "editor.layers")}
    className={`editor-layers-resizable absolute ${sideClass} top-1/2 z-30 flex ${LAYERS_PANEL_MAX_HEIGHT_CLASS} max-md:inset-x-3 max-md:w-auto md:w-64 -translate-y-1/2 flex-col rounded-3xl border border-white/10 bg-black/95 p-3 shadow-panel backdrop-blur-md font-mono text-neutral-200 transition-[top,max-height,transform] duration-200 ease-out`}
    style={bottomInset > 0 ? {
      top: `calc(50% - ${bottomInset / 2}px)`,
      maxHeight: `calc(100% - ${bottomInset + 80}px)`
    } : undefined}
  >
    <EditorLayersResize panelRef={panelRef} swapped={swapSide} t={t} />
    <EditorLayersHeader
      model={model}
    />
    {panelTab === "assets" ? <EditorLayersAssets
      model={model}
    /> : <>
      <EditorLayersControls
        model={model}
      /><EditorLayersTree
        model={model}
      />
      <EditorLayersFooter
        model={model}
      /><EditorLayersPopovers
        model={model}
      />
      <EditorLayerContextMenu
        model={model}
      />
    </>}
  </aside>;
}
EditorLayers.propTypes = editorLayersPropTypes;
