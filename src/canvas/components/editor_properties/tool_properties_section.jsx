/**
 * Tool properties section: renders property controls for the currently active tool.
 * Coordinates dedicated panels for brush, selection, pen, shape, eyedropper, crop, and color.
 */

import { TOOL } from "../../editor/editor_constants.js";
import {
  brushModeHasColor,
  brushModeHasPresets,
} from "../../editor/brush_properties.js";
import { toolPropertiesPropTypes } from "./tool_properties_types.js";
import ToolColorProperties from "./tool_color_properties.jsx";
import BrushProperties from "./brush_properties.jsx";
import BrushPresets from "./brush_presets.jsx";
import SelectionProperties from "./selection_properties.jsx";
import SelectionActions from "./selection_actions.jsx";
import EyedropperProperties from "./eyedropper_properties.jsx";
import PenProperties from "./pen_properties.jsx";
import ShapeProperties from "./shape_properties.jsx";
import CropProperties from "./crop_properties.jsx";
import TextToolProperties from "./text_tool_properties.jsx";
import GradientProperties from "./gradient_properties.jsx";

export {
  ToolColorProperties,
  BrushProperties,
  BrushPresets,
  SelectionProperties,
  SelectionActions,
  EyedropperProperties,
  PenProperties,
  ShapeProperties,
  CropProperties,
  TextToolProperties,
  GradientProperties,
};

export default function ToolPropertiesSection({
  tool,
  color = "#ffffff",
  onColor,
  onPickColor,
  brushWidth = 24,
  onBrushWidth,
  brushHardness = 0.5,
  onBrushHardness,
  brushOpacity = 1,
  onBrushOpacity,
  brushMode = "normal",
  brushFlow = 1,
  onBrushFlow,
  brushSmoothing = 0,
  onBrushSmoothing,
  brushStrength = 0.5,
  onBrushStrength,
  brushExposure = 0.5,
  onBrushExposure,
  brushTonalRange = "midtones",
  onBrushTonalRange,
  brushProtectLuminosity = false,
  onBrushProtectLuminosity,
  brushSaturating = true,
  onBrushSaturating,
  brushPreset = "medium_round",
  onBrushPreset,
  pressureSize = false,
  onPressureSize,
  pressureOpacity = false,
  onPressureOpacity,
  brushRoundness = 1,
  onBrushRoundness,
  brushAngle = 0,
  onBrushAngle,
  healingMode = "aiRepair",
  cloneAligned = false,
  onCloneAligned,
  cloneSource = null,
  brushBlendMode = "normal",
  onBrushBlendMode,
  penAnchorType = "corner",
  onPenAnchorType,
  penMode = "shape",
  onPenMode,
  penStrokeWidth = 1,
  onPenStrokeWidth,
  penCurveTension = 1,
  onPenCurveTension,
  wandTolerance = 32,
  onWandTolerance,
  wandContiguous = true,
  onWandContiguous,
  wandAntiAlias = true,
  onWandAntiAlias,
  wandSampleAll = false,
  onWandSampleAll,
  wandSampleSize = 0,
  onWandSampleSize,
  dropperSampleSize = 0,
  onDropperSampleSize,
  dropperSource = "current",
  onDropperSource,
  showSampleRing = true,
  onShowSampleRing,
  selectionMode = "replace",
  onSelectionMode,
  regionTarget = "all",
  onRegionTarget,
  regionMode = "object",
  selectionFeather = 0,
  onFeatherSelection,
  onModifySelection,
  onRefineEdge,
  marqueeMode = "rect",
  marqueeRatio = null,
  onMarqueeRatio,
  magneticLassoSettings = { width: 64, contrast: 50, frequency: 57 },
  onMagneticLassoSetting,
  hasSelection = false,
  onInvertSelection,
  onClearSelection,
  onTransformSelection,
  onFillSelection,
  onAiRepaintSelection,
  aiRepainting = false,
  selectionTransforming = false,
  onApplyTransformSelection,
  onCancelTransformSelection,
  onSelectSubject,
  cropRatio = null,
  onCropRatio,
  onResetCrop,
  cropMode = "free",
  onCropMode,
  cropWidth = 0,
  cropHeight = 0,
  onCropSize,
  cropAngle = 0,
  onCropAngle,
  onAutoCrop,
  onApplyCrop,
  onApplyDestructiveCrop,
  onCancelCrop,
  imageCropMode = false,
  lassoSaved = false,
  lassoBusy = false,
  localMattingSupported = true,
  onLassoCutout,
  onLassoEraseInside,
  onLassoKeepInside,
  onLassoCancel,
  swapColorsRef = null,
  // Text tool props (Affinity Style)
  fontFamily,
  onFontFamily,
  fontWeight,
  onFontWeight,
  fontSize,
  onFontSize,
  italic,
  onItalic,
  underline,
  onUnderline,
  align,
  onAlign,
  lineHeight,
  onLineHeight,
  letterSpacing,
  onLetterSpacing,
  // Shape tool props (Affinity Style)
  strokeWidth,
  onStrokeWidth,
  shapeStrokeColor = "#FFFFFF",
  onShapeStrokeColor,
  shapeOpacity = 1,
  onShapeOpacity,
  strokeStyle,
  onStrokeStyle,
  cornerRadius,
  onCornerRadius,
  cornerType,
  onCornerType,
  sides,
  onSides,
  starRatio,
  onStarRatio,
  arrowStart,
  onArrowStart,
  arrowEnd,
  onArrowEnd,
  arrowSize,
  onArrowSize,
  // Fill & Gradient props (Affinity Style)
  gradientType,
  onGradientType,
  gradientStops,
  onGradientStops,
  gradientAngle,
  onGradientAngle,
  gradientActiveStop,
  onGradientActiveStop,
  onApplyGradientTool,
  fillOpacity = 1,
  onFillOpacity,
  gradientOpacity = 1,
  onGradientOpacity,
  fillTolerance,
  onFillTolerance,
  fillContiguous,
  onFillContiguous,
  fillSampleAll,
  onFillSampleAll,
  onReverseGradient,
}) {
  const isSelectionTool =
    tool === TOOL.MARQUEE ||
    tool === TOOL.LASSO ||
    tool === TOOL.WAND ||
    tool === TOOL.REGION;
  const isRetouch = [
    TOOL.BLUR,
    TOOL.SHARPEN,
    TOOL.SMUDGE,
    TOOL.DODGE,
    TOOL.BURN,
    TOOL.SPONGE,
  ].includes(tool);
  const isBrushOrEraser =
    tool === TOOL.BRUSH ||
    tool === TOOL.ERASER ||
    tool === TOOL.HEALING ||
    isRetouch;
  const isPen =
    tool === TOOL.PEN || tool === TOOL.CURVATURE_PEN || tool === TOOL.FREE_PEN;
  const isArrow = tool === TOOL.ARROW;
  const isShape =
    tool === TOOL.RECT ||
    tool === TOOL.ELLIPSE ||
    tool === TOOL.POLYGON ||
    tool === TOOL.STAR ||
    tool === TOOL.LINE ||
    tool === TOOL.ARROW;
  const isWand = tool === TOOL.WAND;
  const isDropper = tool === TOOL.DROPPER;
  const isCrop = tool === TOOL.CROP;

  const hasColor =
    (tool === TOOL.BRUSH && brushModeHasColor(brushMode)) ||
    isShape ||
    isPen ||
    tool === TOOL.TEXT ||
    tool === TOOL.FILL ||
    tool === TOOL.GRADIENT;
  // Every brush mode shares the tip presets: retouch modes use width/hardness
  // from a preset just like the normal brush.
  const showBrushPresets =
    tool === TOOL.BRUSH || (tool === TOOL.ERASER && brushModeHasPresets("eraser"));

  return (
    <div className="flex flex-col font-mono text-neutral-200">
      {/* 1. Color properties (ColorWheel + Dual Swatches) */}
      {hasColor && onColor && (
        <ToolColorProperties
          color={color}
          onColor={onColor}
          onPickColor={onPickColor}
          swapColorsRef={swapColorsRef}
        />
      )}

      {/* 2. Shape / Arrow properties (Affinity Style) */}
      {isShape && (
        <ShapeProperties
          tool={tool}
          brushWidth={brushWidth}
          onBrushWidth={onBrushWidth}
          strokeWidth={strokeWidth}
          onStrokeWidth={onStrokeWidth}
          strokeColor={shapeStrokeColor}
          onStrokeColor={onShapeStrokeColor}
          opacity={shapeOpacity}
          onOpacity={onShapeOpacity}
          strokeStyle={strokeStyle}
          onStrokeStyle={onStrokeStyle}
          cornerRadius={cornerRadius}
          onCornerRadius={onCornerRadius}
          cornerType={cornerType}
          onCornerType={onCornerType}
          sides={sides}
          onSides={onSides}
          starRatio={starRatio}
          onStarRatio={onStarRatio}
          arrowStart={arrowStart}
          onArrowStart={onArrowStart}
          arrowEnd={arrowEnd}
          onArrowEnd={onArrowEnd}
          arrowSize={arrowSize}
          onArrowSize={onArrowSize}
        />
      )}

      {/* 2b. Text Tool Typography properties (Affinity Style) */}
      {tool === TOOL.TEXT && (
        <TextToolProperties
          fontFamily={fontFamily}
          onFontFamily={onFontFamily}
          fontWeight={fontWeight}
          onFontWeight={onFontWeight}
          fontSize={fontSize}
          onFontSize={onFontSize}
          italic={italic}
          onItalic={onItalic}
          underline={underline}
          onUnderline={onUnderline}
          align={align}
          onAlign={onAlign}
          lineHeight={lineHeight}
          onLineHeight={onLineHeight}
          letterSpacing={letterSpacing}
          onLetterSpacing={onLetterSpacing}
        />
      )}

      {/* 3. Brush, Eraser, Retouch, Healing & Presets */}
      {isBrushOrEraser && (
        <>
          <BrushProperties
            tool={tool}
            brushWidth={brushWidth}
            onBrushWidth={onBrushWidth}
            brushHardness={brushHardness}
            onBrushHardness={onBrushHardness}
            brushOpacity={brushOpacity}
            onBrushOpacity={onBrushOpacity}
            brushMode={brushMode}
            brushFlow={brushFlow}
            onBrushFlow={onBrushFlow}
            brushSmoothing={brushSmoothing}
            onBrushSmoothing={onBrushSmoothing}
            brushStrength={brushStrength}
            onBrushStrength={onBrushStrength}
            brushExposure={brushExposure}
            onBrushExposure={onBrushExposure}
            brushTonalRange={brushTonalRange}
            onBrushTonalRange={onBrushTonalRange}
            brushProtectLuminosity={brushProtectLuminosity}
            onBrushProtectLuminosity={onBrushProtectLuminosity}
            brushSaturating={brushSaturating}
            onBrushSaturating={onBrushSaturating}
            pressureSize={pressureSize}
            onPressureSize={onPressureSize}
            pressureOpacity={pressureOpacity}
            onPressureOpacity={onPressureOpacity}
            brushRoundness={brushRoundness}
            onBrushRoundness={onBrushRoundness}
            brushAngle={brushAngle}
            onBrushAngle={onBrushAngle}
            healingMode={healingMode}
            cloneAligned={cloneAligned}
            onCloneAligned={onCloneAligned}
            cloneSource={cloneSource}
            brushBlendMode={brushBlendMode}
            onBrushBlendMode={onBrushBlendMode}
          />
          {showBrushPresets && (
            <BrushPresets
              brushPreset={brushPreset}
              onBrushPreset={onBrushPreset}
              onBrushHardness={onBrushHardness}
              onBrushWidth={onBrushWidth}
              onBrushOpacity={onBrushOpacity}
            />
          )}
        </>
      )}

      {/* 4. Selection Tool Properties & Actions */}
      {isSelectionTool && onSelectionMode && (
        <>
          <SelectionProperties
            tool={tool}
            selectionMode={selectionMode}
            onSelectionMode={onSelectionMode}
            selectionFeather={selectionFeather}
            onFeatherSelection={onFeatherSelection}
            marqueeMode={marqueeMode}
            marqueeRatio={marqueeRatio}
            onMarqueeRatio={onMarqueeRatio}
            magneticLassoSettings={magneticLassoSettings}
            onMagneticLassoSetting={onMagneticLassoSetting}
            isWand={isWand}
            wandTolerance={wandTolerance}
            onWandTolerance={onWandTolerance}
            wandSampleSize={wandSampleSize}
            onWandSampleSize={onWandSampleSize}
            wandContiguous={wandContiguous}
            onWandContiguous={onWandContiguous}
            wandAntiAlias={wandAntiAlias}
            onWandAntiAlias={onWandAntiAlias}
            wandSampleAll={wandSampleAll}
            onWandSampleAll={onWandSampleAll}
            regionTarget={regionTarget}
            onRegionTarget={onRegionTarget}
            regionMode={regionMode}
            brushWidth={brushWidth}
            onBrushWidth={onBrushWidth}
            lassoSaved={lassoSaved}
            lassoBusy={lassoBusy}
            localMattingSupported={localMattingSupported}
            onLassoCutout={onLassoCutout}
            onLassoEraseInside={onLassoEraseInside}
            onLassoKeepInside={onLassoKeepInside}
            onLassoCancel={onLassoCancel}
            onSelectSubject={onSelectSubject}
          />
          <SelectionActions
            hasSelection={hasSelection}
            onInvertSelection={onInvertSelection}
            onClearSelection={onClearSelection}
            onTransformSelection={onTransformSelection}
            onFillSelection={onFillSelection}
            onRefineEdge={onRefineEdge}
            selectionTransforming={selectionTransforming}
            onApplyTransformSelection={onApplyTransformSelection}
            onCancelTransformSelection={onCancelTransformSelection}
            onAiRepaintSelection={onAiRepaintSelection}
            aiRepainting={aiRepainting}
            onModifySelection={onModifySelection}
          />
        </>
      )}

      {/* 5. Eyedropper Sampling */}
      {isDropper && onDropperSampleSize && (
        <EyedropperProperties
          dropperSampleSize={dropperSampleSize}
          onDropperSampleSize={onDropperSampleSize}
          dropperSource={dropperSource}
          onDropperSource={onDropperSource}
          showSampleRing={showSampleRing}
          onShowSampleRing={onShowSampleRing}
        />
      )}

      {/* 6. Pen Options */}
      {isPen && (
        <PenProperties
          tool={tool}
          penMode={penMode}
          onPenMode={onPenMode}
          penStrokeWidth={penStrokeWidth}
          onPenStrokeWidth={onPenStrokeWidth}
          penAnchorType={penAnchorType}
          onPenAnchorType={tool === TOOL.FREE_PEN ? null : onPenAnchorType}
          penCurveTension={penCurveTension}
          onPenCurveTension={onPenCurveTension}
        />
      )}

      {/* 7. Crop Options */}
      {isCrop && (
        <CropProperties
          cropRatio={cropRatio}
          onCropRatio={onCropRatio}
          onResetCrop={onResetCrop}
          cropMode={cropMode}
          onCropMode={onCropMode}
          cropWidth={cropWidth}
          cropHeight={cropHeight}
          onCropSize={onCropSize}
          cropAngle={cropAngle}
          onCropAngle={onCropAngle}
          onAutoCrop={onAutoCrop}
          onApplyCrop={onApplyCrop}
          onApplyDestructiveCrop={onApplyDestructiveCrop}
          onCancelCrop={onCancelCrop}
          imageCropMode={imageCropMode}
        />
      )}

      {/* 8. Fill & Gradient Options (Affinity Style) */}
      {(tool === TOOL.FILL || tool === TOOL.GRADIENT) && (
        <GradientProperties
          tool={tool}
          gradientType={gradientType}
          onGradientType={onGradientType}
          gradientStops={gradientStops}
          onGradientStops={onGradientStops}
          gradientAngle={gradientAngle}
          onGradientAngle={onGradientAngle}
          gradientActiveStop={gradientActiveStop}
          onGradientActiveStop={onGradientActiveStop}
          onApplyGradientTool={onApplyGradientTool}
          fillOpacity={fillOpacity}
          onFillOpacity={onFillOpacity}
          gradientOpacity={gradientOpacity}
          onGradientOpacity={onGradientOpacity}
          fillTolerance={fillTolerance}
          onFillTolerance={onFillTolerance}
          fillContiguous={fillContiguous}
          onFillContiguous={onFillContiguous}
          fillSampleAll={fillSampleAll}
          onFillSampleAll={onFillSampleAll}
          onReverseGradient={onReverseGradient}
        />
      )}
    </div>
  );
}

ToolPropertiesSection.propTypes = toolPropertiesPropTypes;
