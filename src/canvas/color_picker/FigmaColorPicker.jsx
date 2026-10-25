import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { ColorSliderSurfaces } from "./ColorSliderSurfaces.jsx";
import { ColorModelInputs } from "./ColorModelInputs.jsx";
import { PickerOpacityField } from "./PickerOpacityField.jsx";
import { BlendModeSelect } from "./BlendModeSelect.jsx";
import { DocumentColourRow } from "./DocumentColourRow.jsx";
import { PickerHeader } from "./PickerHeader.jsx";
import { GradientStopsBar } from "./GradientStopsBar.jsx";
import { GradientAngleControl } from "./GradientAngleControl.jsx";
import { SwatchGrid } from "./SwatchGrid.jsx";
import { hexToHsv, hsvToHex } from "./color_math.js";
import {
  formatGradient,
  isCssGradient,
  parseGradient,
  normalizeGradientAngle,
} from "./gradient_fill.js";
import { useI18n } from "../use_i18n.js";

const GRADIENT_SUB_TYPES = [
  {
    id: "linear",
    labelKey: "editor.props.gradient.linear",
    label: "Linear",
    icon: "linear",
  },
  {
    id: "radial",
    labelKey: "editor.props.gradient.radial",
    label: "Radial",
    icon: "radial",
  },
  {
    id: "angular",
    labelKey: "editor.props.gradient.angular",
    label: "Conic",
    icon: "angular",
  },
  {
    id: "diamond",
    labelKey: "editor.props.gradient.diamond",
    label: "Diamond",
    icon: "diamond",
  },
];

export default function FigmaColorPicker({
  color = "#FFFFFF",
  onChange,
  onClose,
  showTypeTabs = true,
  // Kept for the hidden "image" fill tab (see PRIMARY_FILL_TYPES); the tab
  // returns once the renderer supports image paints.
  imageUrl: _imageUrl = null,
  initialType = null,
  grayscaleOnly = false,
  // Optional bindings to the row that opened the picker. When absent the
  // matching control is not shown (e.g. effect colours have no blend mode).
  opacity = null,
  onOpacityChange = null,
  onOpacityCommit = undefined,
  blendMode = null,
  onBlendModeChange = null,
}) {
  const { t } = useI18n();
  const isGradient = isCssGradient(color);
  const parsed = isGradient ? parseGradient(color) : null;
  const initialGradientType = parsed ? parsed.type : "linear";
  const initialPrimaryType = initialType ?? (isGradient ? "gradient" : "solid");

  const [primaryType, setPrimaryType] = useState(initialPrimaryType);
  const [gradientType, setGradientType] = useState(initialGradientType);
  const [gradientStops, setGradientStops] = useState(
    parsed?.stops ?? [
      { color: "#FFFFFF", opacity: 100, position: 0 },
      { color: "#000000", opacity: 100, position: 100 },
    ],
  );
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [angle, setAngle] = useState(parsed?.angle ?? "135deg");
  // Thread the geometry parsed from the live gradient string so that
  // GradientStopsBar can embed it back into formatGradient without silently
  // resetting the on-canvas gradient-line position to the default geometry.
  const [geometry, setGeometry] = useState(parsed?.geometry ?? null);

  const currentSolidHex = isGradient
    ? (gradientStops[activeStopIndex]?.color ?? "#FFFFFF")
    : color.slice(0, 7) || "#FFFFFF";
  const currentSolidOpacity = isGradient
    ? (gradientStops[activeStopIndex]?.opacity ?? 100)
    : 100;

  const [hsv, setHsv] = useState(() => hexToHsv(currentSolidHex));

  useEffect(() => {
    setHsv(hexToHsv(currentSolidHex));
  }, [currentSolidHex]);

  // When the upstream `color` prop changes (e.g. canvas drag updated the
  // gradient line), re-sync local state from the new parsed value.
  useEffect(() => {
    if (!isCssGradient(color)) return;
    const p = parseGradient(color);
    if (!p) return;
    setAngle(p.angle);
    setGeometry(p.geometry ?? null);
    setGradientStops(p.stops);
  }, [color]);

  const handleApplySolidColor = (hex) => {
    if (primaryType === "solid") {
      onChange(hex);
    } else if (primaryType === "gradient") {
      const nextStops = gradientStops.map((stop, idx) =>
        idx === activeStopIndex ? { ...stop, color: hex } : stop,
      );
      setGradientStops(nextStops);
      onChange(formatGradient(gradientType, angle, nextStops, geometry));
    }
  };

  // Solid: the opacity is the fill/stroke opacity shared with the row field.
  // Gradient: the opacity belongs to the active stop (existing behaviour).
  const hasOpacity = primaryType === "gradient" || onOpacityChange !== null;
  const shownOpacity = primaryType === "gradient" ? currentSolidOpacity : (opacity ?? 100);
  const handleApplyOpacity = (op) => {
    if (primaryType !== "gradient") {
      onOpacityChange?.(op);
    } else {
      const nextStops = gradientStops.map((stop, idx) =>
        idx === activeStopIndex ? { ...stop, opacity: op } : stop,
      );
      setGradientStops(nextStops);
      onChange(formatGradient(gradientType, angle, nextStops, geometry));
    }
  };

  const handleSelectPrimaryType = (nextType) => {
    setPrimaryType(nextType);
    if (nextType === "solid") {
      onChange(gradientStops[activeStopIndex]?.color ?? "#FFFFFF");
    } else if (nextType === "gradient") {
      onChange(formatGradient(gradientType, angle, gradientStops, geometry));
    }
  };

  const handleSelectGradientType = (nextGradType) => {
    setGradientType(nextGradType);
    onChange(formatGradient(nextGradType, angle, gradientStops, geometry));
  };

  const handleAngleChange = (rawVal, rotate = false) => {
    const normalized = normalizeGradientAngle(rawVal);
    if (!normalized) return;
    const numericValue = Number.parseFloat(rawVal);
    const nextValue = rotate
      ? ((numericValue % 360) + 360) % 360
      : Math.max(0, Math.min(360, numericValue));
    const nextAngle = `${nextValue}deg`;
    setAngle(nextAngle);
    // An explicit angle edit invalidates custom endpoints; retain center and size.
    const nextGeometry = geometry
      ? {
          ...geometry,
          startX: undefined,
          startY: undefined,
          endX: undefined,
          endY: undefined,
        }
      : geometry;
    setGeometry(nextGeometry);
    onChange(
      formatGradient(gradientType, nextAngle, gradientStops, nextGeometry),
    );
  };

  const handleHsvChange = (next) => {
    setHsv(next);
    handleApplySolidColor(hsvToHex(next.h, next.s, next.v));
  };

  const eyeDropperAvailable =
    typeof window !== "undefined" && Boolean(window.EyeDropper);
  const handleEyeDropper = async () => {
    if (!eyeDropperAvailable) return;
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        handleApplySolidColor(result.sRGBHex.toUpperCase());
      }
    } catch {
      // User canceled
    }
  };

  return (
    <div className="flex max-h-[calc(100vh-1rem)] w-72 flex-col gap-3 overflow-y-auto rounded-2xl bg-neutral-900 p-3.5 text-white shadow-menu backdrop-blur-xl font-mono box-border select-none">
      <PickerHeader
        showTypeTabs={showTypeTabs}
        activeType={primaryType}
        onSelectType={handleSelectPrimaryType}
        onClose={onClose}
      />

      {/* Gradient Sub-Types Toolbar */}
      {primaryType === "gradient" ? (
        <div className="flex items-center gap-1 rounded-xl bg-neutral-800 p-1">
          {GRADIENT_SUB_TYPES.map((t2) => {
            const label = t2.labelKey ? t(t2.labelKey) : t2.label;
            return (
              <button
                key={t2.id}
                type="button"
                onClick={() => handleSelectGradientType(t2.id)}
                title={label}
                className={`flex-1 py-1 text-center text-[10px] rounded-lg transition-colors ${
                  gradientType === t2.id
                    ? "bg-neutral-700 text-white font-medium"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Gradient angle field — only relevant for linear & angular (conic) */}
      {primaryType === "gradient" &&
      (gradientType === "linear" || gradientType === "angular") ? (
        <GradientAngleControl angle={angle} onChange={handleAngleChange} />
      ) : null}

      {/* Gradient Stops Bar */}
      {primaryType === "gradient" ? (
        <GradientStopsBar
          stops={gradientStops}
          activeStopIndex={activeStopIndex}
          onSelectStop={setActiveStopIndex}
          onChangeStops={setGradientStops}
          gradientType={gradientType}
          angle={angle}
          geometry={geometry}
          onApplyGradient={onChange}
        />
      ) : null}

      {/* Solid & Gradient Color Slider / SV Surfaces */}
      {primaryType === "solid" || primaryType === "gradient" ? (
        <>
          <ColorSliderSurfaces
            hsv={hsv}
            setHsv={setHsv}
            activeColorHex={currentSolidHex}
            activeOpacity={shownOpacity}
            showOpacity={hasOpacity}
            onApplyColor={handleApplySolidColor}
            onApplyOpacity={handleApplyOpacity}
            onOpacityEnd={primaryType === "gradient" ? undefined : onOpacityCommit}
            onEyeDropper={eyeDropperAvailable ? handleEyeDropper : null}
            eyeDropperTitle={
              eyeDropperAvailable
                ? t("editor.colorPicker.eyedropper")
                : t("editor.colorPicker.eyedropperUnavailable")
            }
          />

          <div className="flex items-center gap-1.5">
            <ColorModelInputs
              hex={currentSolidHex}
              hsv={hsv}
              onChangeHex={handleApplySolidColor}
              onChangeHsv={handleHsvChange}
            />
            {hasOpacity ? (
              <PickerOpacityField
                value={shownOpacity}
                onChange={handleApplyOpacity}
                onCommit={primaryType === "gradient" ? undefined : onOpacityCommit}
              />
            ) : null}
          </div>

          {onBlendModeChange ? (
            <BlendModeSelect
              value={blendMode ?? "source-over"}
              onChange={onBlendModeChange}
            />
          ) : null}

          <SwatchGrid
            onSelectColor={handleApplySolidColor}
            swatches={
              grayscaleOnly
                ? [
                    "#000000",
                    "#1A1A1A",
                    "#333333",
                    "#4D4D4D",
                    "#666666",
                    "#808080",
                    "#999999",
                    "#B3B3B3",
                    "#CCCCCC",
                    "#E6E6E6",
                    "#F2F2F2",
                    "#FFFFFF",
                  ]
                : undefined
            }
          />

          <DocumentColourRow onSelectColor={handleApplySolidColor} />
        </>
      ) : null}
    </div>
  );
}

FigmaColorPicker.propTypes = {
  color: PropTypes.string,
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
  onBlendModeChange: PropTypes.func,
};
