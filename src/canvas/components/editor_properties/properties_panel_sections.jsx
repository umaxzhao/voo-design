/** Section list rendering for node properties: transform, warp, text, shape, colour, and effects. */

import { useState } from "react";
import { resolvePanelForContext } from "./resolve_panel_context.js";
import PropTypes from "prop-types";
import TypeSpecificSections from "./type_specific_sections.jsx";
import AffinityAdjustmentSection from "./affinity_adjustment_section.jsx";
import AlignSection from "./align_section.jsx";
import ColourSection from "./colour_section.jsx";
import CombineSection from "./combine_section.jsx";
import ShapeSection from "./shape_section.jsx";
import TextSection from "./text_section.jsx";
import TransformSection from "./transform_section.jsx";
import LayerEffectsSection from "./layer_effects_section.jsx";
import LiveFilterSection from "./live_filter_section.jsx";
import PuppetPinSection from "./puppet_pin_section.jsx";
import WarpSection from "./warp_section.jsx";
import AutoLayoutSection from "./auto_layout_section.jsx";
import AutoLayoutChildSection from "./auto_layout_child_section.jsx";
import ConstraintsSection from "./constraints_section.jsx";
import ColorVariablesSection from "./color_variables_section.jsx";
import StyleSection from "./style_section.jsx";
import MediaSection from "./media_section.jsx";
import ModifiersSection from "./modifiers_section.jsx";
import VariantsSection from "./variants_section.jsx";
import PanelAddMenu from "./panel_add_menu.jsx";
import { resolveExtras } from "./panel_extras.js";
import { downloadSelectionPng } from "./type_specific_sections.jsx";
import {
  isRegionNode,
  supportsColour,
  normalizeAdjustments,
} from "../../editor/scene_model.js";
import { TOOL } from "../../editor/editor_constants.js";

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
  onCombine,
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
  const addItems = [
    eligible.effects && !hasContent.effects && { key: "effects", label: t("editor.panel.effects"), onSelect: () => setEffectsPicker(true) },
    eligible.liveFilters && !show("liveFilters") && { key: "liveFilters", label: t("editor.liveFilters.title"), onSelect: () => reveal("liveFilters") },
    eligible.variables && !show("variables") && { key: "variables", label: t("editor.variables.title"), onSelect: () => reveal("variables") },
    eligible.styles && !show("styles") && { key: "styles", label: t("styles.title"), onSelect: () => reveal("styles") },
    eligible.constraints && !show("constraints") && { key: "constraints", label: t("editor.constraints.title"), onSelect: () => reveal("constraints") },
    showRepeatArray && !show("modifiers") && { key: "modifiers", label: t("editor.props.modifiers"), onSelect: () => reveal("modifiers") },
    eligible.export && { key: "export", label: t("editor.props.exportPng"), onSelect: () => downloadSelectionPng(engine, object) },
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

      {!isWarpTool && has("alignment") && onLayout && object.kind !== "adjustment" ? (
        <AlignSection
          count={selectionCount}
          onLayout={onLayout}
          selectedNodes={selectedNodes}
        />
      ) : null}
      {!isWarpTool && onCombine ? (
        <CombineSection
          onCombine={onCombine}
          currentOperation={
            object?.kind === "boolean" ? object.operation : null
          }
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
        />
      ) : has("transform") && object.kind !== "adjustment" && object.kind !== "audio" ? (
        <TransformSection
          object={object}
          showRadius={has("radius")}
          docSize={docSize}
          isRegion={isRegionNode(object)}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          selectedNodes={selectedNodes}
          transformActions={transformActions}
        />
      ) : null}

      {/* The constraints row appears once set or when the add menu reveals it.
          Image actions (crop / replace / fit) live in ImageContextActions. */}
      {show("constraints") ? (
        <ConstraintsSection object={object} editAndCommit={editAndCommit} />
      ) : null}

      {!isWarpTool && object.isFrame ? (
        <VariantsSection engine={engine} isMainComponent={isMainComponent} />
      ) : null}

      {!isWarpTool && <TypeSpecificSections object={object} sections={allowed} engine={engine} editAndCommit={editAndCommit} />}

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

      {!isWarpTool && has("autoLayout") ? (
        <AutoLayoutSection object={object} editAndCommit={editAndCommit} />
      ) : null}

      {!isWarpTool && has("layoutChild") && parentLayout ? (
        <AutoLayoutChildSection object={object} editAndCommit={editAndCommit} />
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

      {!isWarpTool && (has("fill") || has("stroke")) && supportsColour(object) ? (
        <ColourSection
          object={object}
          showFill={has("fill")}
          showStroke={has("stroke")}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          selectedNodes={selectedNodes}
          getBitmap={getBitmap}
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
  onCombine: PropTypes.func,
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
