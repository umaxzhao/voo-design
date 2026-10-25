import { resolvePanelForContext } from "./resolve_panel_context.js";
import VariantsSection from "./variants_section.jsx";
/**
 * Editor properties panel: root component docked on canvas side showing
 * background, tool properties, mask editing, pen editing, or node properties.
 */

import { useState, useRef } from "react";
import BackgroundSection from "./background_section.jsx";
import FrameSizeSection from "./frame_size_section.jsx";
import { ColorRow, InspectorGroup } from "../inspector_primitives.jsx";
import PenEditSection from "./pen_edit_section.jsx";
import ToolPropertiesSection from "./tool_properties_section.jsx";
import { usePropertyCommit } from "./use_property_commit.js";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import PropertiesPanelHeader from "./properties_panel_header.jsx";
import PropertiesPanelMaskToolbar from "./properties_panel_mask_toolbar.jsx";
import PropertiesPanelSections from "./properties_panel_sections.jsx";
import LiveFilterSection from "./live_filter_section.jsx";
import { editorPropertiesPropTypes } from "./properties_panel_types.js";
import { PROPERTIES_PANEL_MAX_HEIGHT_CLASS } from "../editor_panel_clearance.js";

export const PROPERTIES_PANEL_CONTENT_CLASS = "flex-1 min-h-0 overflow-x-hidden overflow-y-auto";

export {
  PropertiesPanelHeader,
  PropertiesPanelMaskToolbar,
  PropertiesPanelSections,
  LiveFilterSection,
  editorPropertiesPropTypes,
};

export default function EditorProperties({
   object = null,
   isMainComponent = false,
   parentLayout = null,
   parentIsFrame = false,
   parentNode = null,

  colorVariableActions = null,
  styleActions = null,
  index: _index = -1,
  docSize = null,
  isBackground = false,
  backgroundColor = "#262626",
  onSetBackgroundColor = null,
  onSetDocumentSize = null,
  framePosition = null,
  onSetFramePosition = null,
  maskActions = null,
  transformActions = null,
  getBitmap = null,
  onMutate = () => {},
  onCommit = () => {},
  selectionCount = 1,
  /** The selected node objects when several are picked (plan 1.9). */
  selectedNodes = [],
  onCombine = null,
  onLayout = null,
  swapSide = false,
  onToggleSide = null,
  onToggleMotion = null,
  motionTriggerRef = null,
  motionOpen = false,
  bottomInset = 0,
  engine = null,
  mediaError = null,
  tool = null,
  toolProps = null,
  /** True while a pen node is open for anchor editing (the panel goes all-pen). */
  penEditing = false,
  /** The selected (green) Puppet Warp pin's id, or null. */
  puppetPinId = null,
  /** The selected node's Puppet Warp pins (engine truth). */
  puppetPins = [],
  /** The selected pin's current rotation in degrees. */
  puppetRotation = 0,
  /** Set the selected pin's absolute rotation, in degrees. */
  onRotatePuppetPin = null,
  /** Move the selected pin to the front or back of its stacking order. */
  onMovePuppetPinDepth = null,
  /** Toggle the selected pin's fixed state. */
  onTogglePuppetPinFixed = null,
  /** Pen-edit anchor actions, forwarded from the engine. */
  onConvertAnchor = null,
  onDeleteAnchor = null,
}) {
  const { t } = useI18n();
  const sideClass = swapSide ? "left-4" : "right-4";
  const panelRef = useRef(null);
  const dynamicPanelClass = `flex flex-col [&>div:first-child]:shrink-0 absolute ${sideClass} top-1/2 z-30 ${PROPERTIES_PANEL_MAX_HEIGHT_CLASS} max-md:inset-x-3 max-md:w-auto md:w-64 -translate-y-1/2 rounded-3xl bg-black/95 p-3 shadow-panel backdrop-blur-md font-mono text-neutral-200`;
  // The canvas-local timeline owns the reserved bottom area. Keep the
  // original horizontal placement and center within the remaining height.
  const panelStyle =
    bottomInset > 0
      ? {
          top: `calc(50% - ${bottomInset / 2}px)`,
          maxHeight: `calc(100% - ${bottomInset + 80}px)`,
        }
      : undefined;
  const contentClass = `${PROPERTIES_PANEL_CONTENT_CLASS} ${bottomInset > 0 ? "ui-scroll" : "no-scrollbar"}`;
  const backgroundContentClass =
    bottomInset > 0
      ? contentClass
      : `${PROPERTIES_PANEL_CONTENT_CLASS} no-scrollbar`;
  const { edit, editAndCommit, commitNow } = usePropertyCommit({
    onMutate,
    onCommit,
  });

  const [feather, setFeather] = useState(8);

  // A warp tool owns the selection: while it is armed AND the selected object
  // actually carries warp data, the panel shows only what that tool adjusts.
  const isWarpTool =
    object &&
    (tool === TOOL.PERSPECTIVE ||
      tool === TOOL.DISTORT ||
      tool === TOOL.PUPPET_WARP);

  const hasMask = maskActions?.hasMask ?? false;
  const maskEditing = maskActions?.editing ?? null;
  const maskBusy = maskActions?.busy ?? false;
  const showMaskBtn =
    object &&
    object.kind !== "region" &&
    object.kind !== "adjustment" &&
    object.kind !== "group" &&
    object.kind !== "video" &&
    object.kind !== "model3d" &&
    Boolean(maskActions) &&
    !isWarpTool;

  /**
   * Bare form controls (checkboxes, colour wells, text fields) carry an
   * accessible name but no hover tooltip; first hover promotes that name to
   * the native title so a wandering cursor still says what the control does.
   */
  const promoteTitleOnHover = (event) => {
    const control = event.target.closest?.("input, select, button, textarea");
    if (!control || control.title || !control.getAttribute("aria-label")) {
      return;
    }
    control.title = control.getAttribute("aria-label");
  };

  const context = resolvePanelForContext({
    tool,
    selection: !isBackground && object ? (selectedNodes.length ? selectedNodes : [object]) : [],
  });
  // The active tool's options own the panel: always with nothing selected, and
  // over a selection for the raster tools (brush, eraser, crop, selection...).
  const isDedicatedToolActive =
    !penEditing && !maskEditing && (context.panel === "tool" || Boolean(context.toolOptions));

  const header = (
    <PropertiesPanelHeader
      tool={tool}
      isToolActive={isDedicatedToolActive}
      showMaskBtn={showMaskBtn}
      hasMask={hasMask}
      maskActions={maskActions}
      maskBusy={maskBusy}
      maskEditing={maskEditing}
      onToggleMotion={onToggleMotion}
      motionTriggerRef={motionTriggerRef}
      motionOpen={motionOpen}
      onToggleSide={onToggleSide}
      t={t}
    />
  );

  const maskToolbar = (
    <PropertiesPanelMaskToolbar
      maskEditing={maskEditing}
      maskActions={maskActions}
      hasMask={hasMask}
      maskBusy={maskBusy}
      feather={feather}
      setFeather={setFeather}
      t={t}
    />
  );

  if (isDedicatedToolActive && toolProps) {
    return (
      <aside
        data-testid="editor-properties-panel"
        className={dynamicPanelClass}
        style={panelStyle}
        ref={panelRef}
        onMouseOver={promoteTitleOnHover}
      >
        {header}
        <div className={contentClass}>
          <ToolPropertiesSection tool={tool} {...toolProps} />
        </div>
      </aside>
    );
  }

  if (isBackground) {
    return (
      <aside
        data-testid="editor-properties-panel"
        className={dynamicPanelClass}
        style={panelStyle}
        onMouseOver={promoteTitleOnHover}
      >
        {header}
        <div className={backgroundContentClass}>
          <VariantsSection engine={engine} isMainComponent={isMainComponent} />
          {docSize && onSetDocumentSize && framePosition && onSetFramePosition && (
            <InspectorGroup title={t("editor.frame.transform")}>
              <FrameSizeSection
                x={framePosition.x}
                y={framePosition.y}
                width={docSize.width}
                height={docSize.height}
                onSetPosition={onSetFramePosition}
                onSetSize={onSetDocumentSize}
              />
            </InspectorGroup>
          )}
          <InspectorGroup title={t("editor.layer.canvasBackground") || t("editor.props.fill")}>
            <div className="px-3 py-2">
              <ColorRow
                label={t("editor.layer.canvasBackground") || t("editor.props.fill")}
                value={backgroundColor}
                onChange={(next) => onSetBackgroundColor?.(next)}
                onCommit={(next) => onSetBackgroundColor?.(next)}
              />
            </div>
          </InspectorGroup>
        </div>
      </aside>
    );
  }

  if (!object) return null;

  if (maskEditing && maskActions) {
    return (
      <aside
        data-testid="editor-properties-panel"
        className={dynamicPanelClass}
        style={panelStyle}
        ref={panelRef}
        onMouseOver={promoteTitleOnHover}
      >
        {header}
        <div className={contentClass}>{maskToolbar}</div>
      </aside>
    );
  }

  // While a pen node is open for anchor editing the whole panel becomes
  // pen-related controls.
  if (penEditing && object.kind === "path" && object.pen === true) {
    return (
      <aside
        data-testid="editor-properties-panel"
        className={dynamicPanelClass}
        style={panelStyle}
        ref={panelRef}
        onMouseOver={promoteTitleOnHover}
      >
        {header}
        <div className={contentClass}>
          <PenEditSection
            object={object}
            edit={edit}
            editAndCommit={editAndCommit}
            commitNow={commitNow}
            selectedNodes={selectedNodes}
            getBitmap={getBitmap}
            onConvertAnchor={onConvertAnchor}
            onDeleteAnchor={onDeleteAnchor}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside
      data-testid="editor-properties-panel"
      className={dynamicPanelClass}
      style={panelStyle}
      ref={panelRef}
      onMouseOver={promoteTitleOnHover}
    >
      {header}
      <div className={contentClass}>
        {maskToolbar}
          <PropertiesPanelSections
            sections={context.sections}
            object={object}
            engine={engine}
            parentLayout={parentLayout}
            parentIsFrame={parentIsFrame}
            parentNode={parentNode}
            isMainComponent={isMainComponent}
            colorVariableActions={colorVariableActions}
            styleActions={styleActions}
            docSize={docSize}
            tool={tool}
            isWarpTool={isWarpTool}
            puppetPins={puppetPins}
            puppetPinId={puppetPinId}
            puppetRotation={puppetRotation}
            onRotatePuppetPin={onRotatePuppetPin}
            onMovePuppetPinDepth={onMovePuppetPinDepth}
            onTogglePuppetPinFixed={onTogglePuppetPinFixed}
            isBackground={isBackground}
            selectionCount={selectionCount}
            selectedNodes={selectedNodes}
            onLayout={onLayout}
            onCombine={onCombine}
            edit={edit}
            editAndCommit={editAndCommit}
            commitNow={commitNow}
            transformActions={transformActions}
            onMutate={onMutate}
            onCommit={onCommit}
            swapSide={swapSide}
            panelRef={panelRef}
            getBitmap={getBitmap}
            mediaError={mediaError}
            t={t}
          />
      </div>
    </aside>
  );
}

EditorProperties.propTypes = editorPropertiesPropTypes;
