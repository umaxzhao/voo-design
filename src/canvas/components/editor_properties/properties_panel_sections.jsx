/** Section list rendering for node properties: transform, warp, text, shape, colour, and effects. */

import { useState } from "react";
import { resolvePanelForContext } from "./resolve_panel_context.js";
import PropTypes from "prop-types";
import TypeSpecificSections from "./type_specific_sections.jsx";
import AffinityAdjustmentSection from "./affinity_adjustment_section.jsx";
import ImageContextActions from "./image_context_actions.jsx";
import AlignSection from "./align_section.jsx";
import ColourSection from "./colour_section.jsx";
import ShapeSection from "./shape_section.jsx";
import TextSection from "./text_section.jsx";
import TransformSection from "./transform_section.jsx";
import LayerEffectsSection from "./layer_effects_section.jsx";
import LiveFilterSection from "./live_filter_section.jsx";
import PuppetPinSection from "./puppet_pin_section.jsx";
import WarpSection from "./warp_section.jsx";
import AutoLayoutChildSection from "./auto_layout_child_section.jsx";
import ConstraintsSection from "./constraints_section.jsx";
import ColorVariablesSection from "./color_variables_section.jsx";
import { DocumentColoursContext } from "../../color_picker/document_colours_context.js";
import StyleSection from "./style_section.jsx";
import MediaSection from "./media_section.jsx";
import ModifiersSection from "./modifiers_section.jsx";
import VariantsSection from "./variants_section.jsx";
import PanelAddMenu from "./panel_add_menu.jsx";
import AppearanceSection from "./appearance_section.jsx";
import ExportSection from "./export_section.jsx";
import SelectionColorsSection from "./selection_colors_section.jsx";
import InstanceSection from "./instance_section.jsx";
import { normalizeStyles } from "../../editor/scene_styles.js";
import { resolveExtras } from "./panel_extras.js";
import {
  isRegionNode,
  supportsColour,
  normalizeAdjustments,
} from "../../editor/scene_model.js";
import { TOOL } from "../../editor/editor_constants.js";

/** Stable empty list so the context value does not change identity per render. */
const NO_DOCUMENT_COLOURS = [];

export default function PropertiesPanelSections({
  object,
  sections = null,
  engine,
  parentLayout,
  parentIsFrame = false,
  parentNode = null,
  isMainComponent = false,
  colorVariableActions,
  styleActions,
  docSize,
  tool,
  isWarpTool,
  puppetPins,
  puppetPinId,
  puppetRotation,
  onRotatePuppetPin,
  onMovePuppetPinDepth,
  onTogglePuppetPinFixed,
  isBackground = false,
  selectionCount,
  selectedNodes,
  onLayout,
  edit,
  editAndCommit,
  commitNow,
  transformActions,
  onMutate,
  onCommit,
  swapSide,
  panelRef,
  getBitmap,
  mediaError,
  t,
}) {
  const allowed = sections ?? resolvePanelForContext({ selection: [object] }).sections;
  const has = (section) => allowed.includes(section);
  // Frames with a Layout group own W/H (Figma keeps them in Layout); other
  // shapes keep the dimension bar in Transform.
  const hasLayoutGroup = has("layoutGrid") || has("autoLayout");
  const frameFallbackFill =
    object.isFrame &&
    !(Array.isArray(object.fills) && object.fills.length) &&
    (!object.fill || object.fill === "transparent") &&
    typeof docSize?.backgroundColor === "string" &&
    docSize.backgroundColor !== "transparent"
      ? docSize.backgroundColor
      : null;
  const isMedia =
    object.kind === "video" ||
    object.kind === "model3d" ||
    object.kind === "audio";
  // Optional capabilities stay hidden until the add menu reveals them; the
  // reveal belongs to one selection and resets when another node is picked.
  const [revealState, setRevealState] = useState({ id: object?.id, keys: [], effectsPicker: false });
  const current = revealState.id === object?.id ? revealState : { id: object?.id, keys: [], effectsPicker: false };
  const revealed = (key) => current.keys.includes(key);
  const reveal = (key) => setRevealState({ ...current, keys: [...current.keys, key] });
  const setEffectsPicker = (open) => setRevealState({ ...current, effectsPicker: open });
  const { eligible, hasContent } = resolveExtras({
    object, allowed, isWarpTool, isMedia, selectionCount: selectionCount ?? 1,
    parentLayout, parentIsFrame, parentNode, colorVariableActions, styleActions, engine,
  });
  // Array modifiers target one node at a time, so they are a single-selection
  // affordance; frames and adjustments have no array target.
  const showRepeatArray = !isBackground && eligible.modifiers;
  const show = (key) => eligible[key] && (hasContent[key] || revealed(key));
  // Inline binding chips (Pen-style): resolve the bound variable/style names
  // once for the Fill/Stroke rows.
  const bindingDoc = engine?.getDocument?.();
  const boundVariable = object.fillVariableId
    ? (bindingDoc?.variablesV2?.collections ?? [])
        .flatMap((collection) => collection.variables ?? [])
        .find((variable) => variable.id === object.fillVariableId)
    : null;
  const boundPaintStyle = object.styleIds?.paintId
    ? normalizeStyles(bindingDoc?.styles).paint.find(
        (style) => style.id === object.styleIds.paintId,
      )
    : null;
  const bindings = {
    variableName: boundVariable?.name ?? null,
    styleName: boundPaintStyle?.name ?? null,
    onDetachVariable: () => colorVariableActions?.variableActions?.bind?.(null),
    onDetachStyle: () => styleActions?.detach?.("paint"),
  };

  const addItems = [
    eligible.liveFilters && !show("liveFilters") && { key: "liveFilters", label: t("editor.liveFilters.title"), onSelect: () => reveal("liveFilters") },
    eligible.variables && !show("variables") && { key: "variables", label: t("editor.variables.title"), onSelect: () => reveal("variables") },
    eligible.styles && !show("styles") && { key: "styles", label: t("styles.title"), onSelect: () => reveal("styles") },
    showRepeatArray && !show("modifiers") && { key: "modifiers", label: t("editor.props.modifiers"), onSelect: () => reveal("modifiers") },
  ].filter(Boolean);
  return (
    <>
      {isWarpTool && tool === TOOL.PUPPET_WARP ? (
        <PuppetPinSection
          pins={puppetPins}
          pinId={puppetPinId}
          rotation={puppetRotation}
          onRotate={onRotatePuppetPin}
          onMoveDepth={onMovePuppetPinDepth}
          onToggleFixed={onTogglePuppetPinFixed}
        />
      ) : null}

      {!isWarpTool && (onLayout || engine?.layoutSelection) && object.kind !== "adjustment" ? (
        <AlignSection
          count={selectionCount}
          onLayout={onLayout ?? ((layout, argument) => engine.layoutSelection(layout, argument))}
          selectedNodes={selectedNodes}
          showQuickActions={(selectionCount ?? 1) < 2}
        />
      ) : null}

      {isWarpTool ? (
        <WarpSection
          tool={tool}
          object={object}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          onReset={() =>
            editAndCommit({
              warpMesh: null,
              perspectiveCorners: null,
              puppetPins: null,
            })
          }
          puppetPins={puppetPins}
          puppetPinId={puppetPinId}
          onSelectPuppetPin={(id) => engine?.setSelectedPuppetPin?.(id)}
          onDeletePuppetPin={(id) => {
            engine?.setSelectedPuppetPin?.(id);
            engine?.deletePuppetPin?.();
          }}
        />
      ) : has("transform") && object.kind !== "adjustment" && object.kind !== "audio" ? (
        <TransformSection
          object={object}
          showRadius={has("radius")}
          showDimensions={!hasLayoutGroup}
          docSize={docSize}
          isRegion={isRegionNode(object)}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          selectedNodes={selectedNodes}
          transformActions={transformActions}
          parentLayout={parentLayout}
        />
      ) : null}

      {/* The constraints row appears once set or when the add menu reveals it.
          One-shot crop and replace actions live in the bottom quickbar. */}
      {!isWarpTool && eligible.constraints && !object.isFrame ? (
        <ConstraintsSection object={object} editAndCommit={editAndCommit} />
      ) : null}

      {!isWarpTool && object.isFrame ? (
        <VariantsSection engine={engine} isMainComponent={isMainComponent} />
      ) : null}

      {!isWarpTool ? <InstanceSection object={object} engine={engine} /> : null}

      {!isWarpTool && (
        <TypeSpecificSections
          object={object}
          sections={allowed}
          showDimensions={hasLayoutGroup}
          engine={engine}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
        />
      )}

      {!isWarpTool && isMedia ? (
        <MediaSection
          object={object}
          engine={engine}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          error={mediaError}
          t={t}
        />
      ) : null}

      {!isWarpTool && has("layoutChild") && parentLayout ? (
        <AutoLayoutChildSection object={object} editAndCommit={editAndCommit} />
      ) : null}

      {/* Polygon/star parameters and the line/arrow head menu. Single
          selection only: the patches carry absolute geometry. */}
      {!isWarpTool &&
      object.kind === "path" &&
      (object.poly === true || object.arrow === true || object.line === true) &&
      (selectionCount ?? 1) <= 1 ? (
        <ShapeSection
          object={object}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
        />
      ) : null}

      {object.kind === "adjustment" ? (
        <AffinityAdjustmentSection
          object={object}
          adjustments={normalizeAdjustments(object.adjustments)}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          bitmap={getBitmap?.(object) ?? null}
          t={t}
        />
      ) : null}

      {!isWarpTool && object.kind === "text" ? (
        <TextSection
          object={object}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          selectedNodes={selectedNodes}
        />
      ) : null}

      {!isWarpTool ? (
        <SelectionColorsSection selectedNodes={selectedNodes} engine={engine} />
      ) : null}

      {!isWarpTool && object.kind !== "adjustment" && object.kind !== "region" && object.kind !== "audio" ? (
        <AppearanceSection
          object={object}
          selectedNodes={selectedNodes}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
        />
      ) : null}

      {!isWarpTool && (has("fill") || has("stroke")) && supportsColour(object) ? (
        // The picker's "Document colours" row reads the document's colour variables.
        <DocumentColoursContext.Provider value={colorVariableActions?.variables ?? NO_DOCUMENT_COLOURS}>
          <ColourSection
            object={object}
            frameFallbackFill={frameFallbackFill}
            showFill={has("fill")}
            showStroke={has("stroke")}
            edit={edit}
            editAndCommit={editAndCommit}
            commitNow={commitNow}
            selectedNodes={selectedNodes}
            getBitmap={getBitmap}
            bindings={bindings}
          />
        </DocumentColoursContext.Provider>
      ) : null}
      {/* Image-only tools: one collapsed disclosure right after fill / stroke. */}
      {!isWarpTool && object.kind === "image" && (tool ?? TOOL.SELECT) === TOOL.SELECT ? (
        <ImageContextActions
          object={object}
          engine={engine}
          editAndCommit={editAndCommit}
        />
      ) : null}
      {show("variables") ? (
        <ColorVariablesSection
          object={object}
          documentId={colorVariableActions.documentId}
          variables={colorVariableActions.variables}
          onCreate={colorVariableActions.create}
          onBind={colorVariableActions.bind}
          onUpdate={colorVariableActions.update}
          variablesV2={colorVariableActions.variablesV2 ?? null}
          variableActions={colorVariableActions.variableActions ?? null}
          revealed={revealed("variables")}
        />
      ) : null}

      {show("styles") ? (
        <StyleSection
          object={object}
          styles={styleActions.styles ?? null}
          styleActions={styleActions.actions ?? null}
          revealed={revealed("styles")}
        />
      ) : null}

      {eligible.effects ? (
        <LayerEffectsSection
          addPickerOpen={current.effectsPicker}
          onAddPickerChange={setEffectsPicker}
          object={object}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          onMutate={onMutate}
          onCommit={onCommit}
          swapSide={swapSide}
          panelRef={panelRef}
          getBitmap={getBitmap}
        />
      ) : null}

      {eligible.export ? (
        <ExportSection object={object} selectedNodes={selectedNodes} engine={engine} />
      ) : null}

      {eligible.liveFilters ? (
        <LiveFilterSection
          object={object}
          revealed={revealed("liveFilters")}
          liveFilters={normalizeAdjustments(object.adjustments).liveFilters}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
        />
      ) : null}

      {showRepeatArray ? <ModifiersSection object={object} engine={engine} t={t} revealed={revealed("modifiers")} /> : null}

      <PanelAddMenu items={addItems} />

    </>
  );
}

PropertiesPanelSections.propTypes = {
  object: PropTypes.object.isRequired,
  sections: PropTypes.arrayOf(PropTypes.string),
  engine: PropTypes.object,
  parentLayout: PropTypes.object,
  parentIsFrame: PropTypes.bool,
  parentNode: PropTypes.object,
  isMainComponent: PropTypes.bool,
  colorVariableActions: PropTypes.object,
  styleActions: PropTypes.object,
  docSize: PropTypes.object,
  tool: PropTypes.string,
  isWarpTool: PropTypes.bool,
  puppetPins: PropTypes.array,
  puppetPinId: PropTypes.string,
  puppetRotation: PropTypes.number,
  onRotatePuppetPin: PropTypes.func,
  onMovePuppetPinDepth: PropTypes.func,
  onTogglePuppetPinFixed: PropTypes.func,
  /** True when the selection is the canvas background (no array target). */
  isBackground: PropTypes.bool,
  selectionCount: PropTypes.number,
  selectedNodes: PropTypes.array,
  onLayout: PropTypes.func,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  transformActions: PropTypes.object,
  onMutate: PropTypes.func,
  onCommit: PropTypes.func,
  swapSide: PropTypes.bool,
  panelRef: PropTypes.object,
  getBitmap: PropTypes.func,
  mediaError: PropTypes.string,
  t: PropTypes.func.isRequired,
};
