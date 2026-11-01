import PropTypes from "prop-types";
import { useId } from "react";
import { ColorSliderSurfaces } from "./ColorSliderSurfaces.jsx";
import { ColorModelInputs } from "./ColorModelInputs.jsx";
import { PickerOpacityField } from "./PickerOpacityField.jsx";
import { BlendModeSelect } from "./BlendModeSelect.jsx";
import { DocumentColourRow } from "./DocumentColourRow.jsx";
import { PickerHeader } from "./PickerHeader.jsx";
import { GradientStopsBar } from "./GradientStopsBar.jsx";
import { GradientAngleControl } from "./GradientAngleControl.jsx";
import { SwatchGrid } from "./SwatchGrid.jsx";
import ImageFillControls from "./ImageFillControls.jsx";
import TextureFillControls from "./TextureFillControls.jsx";
import { useFillPicker } from "./use_fill_picker.js";
import { fillTypeOf } from "./texture-fill.js";
import { useI18n } from "../use_i18n.js";
const GRADIENT_SUB_TYPES = [{
  id: "linear",
  labelKey: "editor.props.gradient.linear",
  label: "Linear",
  icon: "linear"
}, {
  id: "radial",
  labelKey: "editor.props.gradient.radial",
  label: "Radial",
  icon: "radial"
}, {
  id: "angular",
  labelKey: "editor.props.gradient.angular",
  label: "Conic",
  icon: "angular"
}, {
  id: "diamond",
  labelKey: "editor.props.gradient.diamond",
  label: "Diamond",
  icon: "diamond"
}, {
  id: "mesh",
  labelKey: "editor.fillPicker.mesh",
  icon: "mesh"
}];
export default function FigmaColorPicker({
  color = "#FFFFFF",
  onChange,
  onClose,
  showTypeTabs = true,
  imageUrl = null,
  initialType = null,
  grayscaleOnly = false,
  opacity = null,
  onOpacityChange = null,
  onOpacityCommit,
  blendMode = null,
  onBlendModeChange = null,
  allowMedia = false,
  onPaintChange = null,
  imageScaleMode = "fill",
  imagePaint = null,
  dialogLabel = null
}) {
  const {
    t
  } = useI18n();
  const paintPanelId = useId();
  const {
    primaryType,
    gradientType,
    gradientStops,
    setGradientStops,
    activeStopIndex,
    setActiveStopIndex,
    angle,
    geometry,
    currentSolidHex,
    currentSolidOpacity,
    hsv,
    setHsv,
    eyeDropperAvailable,
    eyeDropperError,
    handleApplySolidColor,
    handleApplyOpacity,
    handleSelectPrimaryType,
    handleSelectGradientType,
    handleAngleChange,
    handleEyeDropper,
    handleHsvChange,
    handleImage,
    handleImageScale,
    applyGradient,
    applyTexture
  } = useFillPicker({
    color,
    initialType,
    imageUrl,
    imageScaleMode,
    imagePaint,
    onChange,
    onPaintChange,
    onOpacityChange
  });
  const hasOpacity = primaryType === "gradient" || onOpacityChange !== null;
  const shownOpacity = primaryType === "gradient" ? currentSolidOpacity : opacity ?? 100;
  const imageSource = fillTypeOf(color) === "image" ? color : imageUrl && fillTypeOf(imageUrl) === "image" ? imageUrl : null;
  return <div role={dialogLabel ? "dialog" : undefined} aria-label={dialogLabel ?? undefined} className="flex max-h-[calc(100dvh-1rem)] w-72 max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto rounded-2xl bg-neutral-900 p-3.5 text-white shadow-menu box-border select-none">
      <PickerHeader showTypeTabs={showTypeTabs} activeType={primaryType} onSelectType={handleSelectPrimaryType} onClose={onClose} allowMedia={allowMedia} panelId={paintPanelId} />

      <div id={paintPanelId} role={showTypeTabs ? "tabpanel" : undefined} aria-labelledby={showTypeTabs ? `${paintPanelId}-${primaryType}` : undefined} className="flex flex-col gap-3">
      {/* Gradient Sub-Types Toolbar */}
      {primaryType === "gradient" ? <div className="flex items-center gap-1 rounded-xl bg-neutral-800 p-1">
          {GRADIENT_SUB_TYPES.map(t2 => {
          const label = t2.labelKey ? t(t2.labelKey) : t2.label;
          return <button key={t2.id} type="button" onClick={() => handleSelectGradientType(t2.id)} title={label} className={`flex-1 py-1 text-center text-[10px] rounded-lg transition-colors ${gradientType === t2.id ? "bg-neutral-700 text-white font-medium" : "text-neutral-400 hover:text-neutral-200"}`}>
                {label}
              </button>;
        })}
        </div> : null}

      {/* Gradient angle field — only relevant for linear & angular (conic) */}
      {primaryType === "gradient" && (gradientType === "linear" || gradientType === "angular") ? <GradientAngleControl angle={angle} onChange={handleAngleChange} /> : null}

      {/* Gradient Stops Bar */}
      {primaryType === "gradient" && gradientType !== "mesh" ? <GradientStopsBar stops={gradientStops} activeStopIndex={activeStopIndex} onSelectStop={setActiveStopIndex} onChangeStops={setGradientStops} gradientType={gradientType} angle={angle} geometry={geometry} onApplyGradient={applyGradient} /> : null}

      {primaryType === "gradient" && gradientType === "mesh" ? <div className="flex flex-wrap gap-2" role="group" aria-label={t("editor.fillPicker.meshPoints")}>
        {gradientStops.map((stop, index) => <button key={`${geometry.points[index].x}:${geometry.points[index].y}`} type="button" aria-label={t("editor.fillPicker.meshPoint", {
          n: index + 1
        })} aria-pressed={activeStopIndex === index} onClick={() => setActiveStopIndex(index)} className={`size-8 rounded-full border ${activeStopIndex === index ? "border-white" : "border-white/20"}`} style={{
          backgroundColor: stop.color
        }} />)}
      </div> : null}
      {primaryType === "image" ? <ImageFillControls imageUrl={imageSource} scaleMode={imageSource ? imageScaleMode : "fill"} onChange={(fill, options) => handleImage(fill, imageSource ? imageScaleMode : "fill", options)} onScaleMode={handleImageScale} /> : null}
      {primaryType === "texture" ? <TextureFillControls value={color} onChange={applyTexture} /> : null}
      {eyeDropperError ? <p role="alert" className="text-[11px] text-neutral-200">{t("editor.fillPicker.pickFailed")}</p> : null}

      {/* Solid & Gradient Color Slider / SV Surfaces */}
      {primaryType === "solid" || primaryType === "gradient" ? <>
          <ColorSliderSurfaces hsv={hsv} setHsv={setHsv} activeColorHex={currentSolidHex} activeOpacity={shownOpacity} showOpacity={hasOpacity} onApplyColor={handleApplySolidColor} onApplyOpacity={handleApplyOpacity} onOpacityEnd={primaryType === "gradient" ? undefined : onOpacityCommit} onEyeDropper={eyeDropperAvailable ? handleEyeDropper : null} eyeDropperTitle={eyeDropperAvailable ? t("editor.colorPicker.eyedropper") : t("editor.colorPicker.eyedropperUnavailable")} />

          <div className="flex items-center gap-1.5">
            <ColorModelInputs hex={currentSolidHex} hsv={hsv} onChangeHex={handleApplySolidColor} onChangeHsv={handleHsvChange} />
            {hasOpacity ? <PickerOpacityField value={shownOpacity} onChange={handleApplyOpacity} onCommit={primaryType === "gradient" ? undefined : onOpacityCommit} /> : null}
          </div>



          <SwatchGrid onSelectColor={handleApplySolidColor} swatches={grayscaleOnly ? ["#000000", "#1A1A1A", "#333333", "#4D4D4D", "#666666", "#808080", "#999999", "#B3B3B3", "#CCCCCC", "#E6E6E6", "#F2F2F2", "#FFFFFF"] : undefined} />

          <DocumentColourRow onSelectColor={handleApplySolidColor} />
        </> : null}
      {(primaryType === "image" || primaryType === "texture") && onOpacityChange ? <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-200">
        <span>{t("editor.props.opacity")}</span><PickerOpacityField value={opacity ?? 100} onChange={onOpacityChange} onCommit={onOpacityCommit} />
      </div> : null}
      {onBlendModeChange ? <BlendModeSelect value={blendMode ?? "source-over"} onChange={onBlendModeChange} /> : null}
      </div>
    </div>;
}
FigmaColorPicker.propTypes = {
  color: PropTypes.string,
  allowMedia: PropTypes.bool,
  onPaintChange: PropTypes.func,
  imageScaleMode: PropTypes.string,
  imagePaint: PropTypes.object,
  dialogLabel: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func,
  showTypeTabs: PropTypes.bool,
  /** Preview for the image fill type. */
  imageUrl: PropTypes.string,
  /** Opens straight on this fill type instead of inferring it from `color`. */
  initialType: PropTypes.string,
  grayscaleOnly: PropTypes.bool,
  /** Fill/stroke opacity in percent (0-100), shared with the row field. */
  opacity: PropTypes.number,
  onOpacityChange: PropTypes.func,
  /** Interaction-end commit for opacity edits (same as the row field's). */
  onOpacityCommit: PropTypes.func,
  /** Layer blend mode ("source-over" is Normal). */
  blendMode: PropTypes.string,
  onBlendModeChange: PropTypes.func
};
