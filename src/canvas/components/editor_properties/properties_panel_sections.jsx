/** Section list rendering for node properties: transform, warp, text, shape, colour, and effects. */

import PropTypes from "prop-types";
import AdjustmentControls from "./adjustment_controls.jsx";
import AffinityAdjustmentSection from "./affinity_adjustment_section.jsx";
import AlignSection from "./align_section.jsx";
import ColourSection from "./colour_section.jsx";
import CombineSection from "./combine_section.jsx";
import ShapeSection from "./shape_section.jsx";
import TextSection from "./text_section.jsx";
import TransformSection from "./transform_section.jsx";
import LayerEffectsSection from "./layer_effects_section.jsx";
import PuppetPinSection from "./puppet_pin_section.jsx";
import WarpSection from "./warp_section.jsx";
import AutoLayoutSection from "./auto_layout_section.jsx";
import AutoLayoutChildSection from "./auto_layout_child_section.jsx";
import ConstraintsSection from "./constraints_section.jsx";
import ColorVariablesSection from "./color_variables_section.jsx";
import StyleSection from "./style_section.jsx";
import MediaSection from "./media_section.jsx";
import {
  isRegionNode,
  supportsColour,
  normalizeAdjustments,
} from "../../editor/scene_model.js";
import { TOOL } from "../../editor/editor_constants.js";

export default function PropertiesPanelSections({
  object,
  engine,
  parentLayout,
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
  const isMedia =
    object.kind === "video" ||
    object.kind === "model3d" ||
    object.kind === "audio";
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

      {!isWarpTool && onLayout && object.kind !== "adjustment" ? (
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
      ) : object.kind !== "adjustment" && object.kind !== "audio" ? (
        <TransformSection
          object={object}
          docSize={docSize}
          isRegion={isRegionNode(object)}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          selectedNodes={selectedNodes}
          transformActions={transformActions}
        />
      ) : null}

      {/* Resize constraints: how this node follows its parent's resize. Frames
          (the page itself) and adjustments/regions/audio have no parent box;
          an auto-layout flow child is positioned by reflowAutoLayout instead. */}
      {!isWarpTool &&
      !object.isFrame &&
      object.kind !== "adjustment" &&
      object.kind !== "audio" &&
      !isRegionNode(object) &&
      !(parentLayout && object.layoutPosition !== "absolute") &&
      (selectionCount ?? 1) <= 1 ? (
        <ConstraintsSection object={object} editAndCommit={editAndCommit} />
      ) : null}


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

      {!isWarpTool && object.kind === "group" ? (
        <AutoLayoutSection object={object} editAndCommit={editAndCommit} />
      ) : null}

      {!isWarpTool && parentLayout ? (
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

      {!isWarpTool && supportsColour(object) ? (
        <ColourSection
          object={object}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          selectedNodes={selectedNodes}
          getBitmap={getBitmap}
        />
      ) : null}
      {!isWarpTool &&
      colorVariableActions &&
      supportsColour(object) &&
      object.kind !== "image" &&
      selectionCount === 1 ? (
        <ColorVariablesSection
          object={object}
          documentId={colorVariableActions.documentId}
          variables={colorVariableActions.variables}
          onCreate={colorVariableActions.create}
          onBind={colorVariableActions.bind}
          onUpdate={colorVariableActions.update}
          variablesV2={colorVariableActions.variablesV2 ?? null}
          variableActions={colorVariableActions.variableActions ?? null}
        />
      ) : null}

      {!isWarpTool &&
      styleActions &&
      object.kind !== "adjustment" &&
      !isMedia &&
      (selectionCount ?? 1) === 1 ? (
        <StyleSection
          object={object}
          styles={styleActions.styles ?? null}
          styleActions={styleActions.actions ?? null}
        />
      ) : null}

      {!isWarpTool && object.kind !== "adjustment" && !isMedia ? (
        <LayerEffectsSection
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
    </>
  );
}

PropertiesPanelSections.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
  parentLayout: PropTypes.object,
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
