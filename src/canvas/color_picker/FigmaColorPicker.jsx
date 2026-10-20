import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { ColorSliderSurfaces } from "./ColorSliderSurfaces.jsx";
import { ColorChannelInputs } from "./ColorChannelInputs.jsx";
import { GradientStopsBar } from "./GradientStopsBar.jsx";
import { SwatchGrid } from "./SwatchGrid.jsx";
import { hexToHsv } from "./color_math.js";
import {
  formatGradient,
  isCssGradient,
  parseGradient,
} from "./gradient_fill.js";
import { useI18n } from "../use_i18n.js";

import { IconImage } from "../icons.jsx";

// Texture and video tabs are not yet supported by the renderer:
// - "texture" writes repeating-*-gradient() CSS that isCssGradient() won't
//   match, so the fill is silently dropped.
// - "video" writes a blob: URL that the canvas treats as a transparent image.
// Both tabs are hidden until the renderer adds support. "image" routes through
// blob: URLs the same way, so it too is hidden for now.
// Only "solid" and "gradient" are connected to working renderer paths.
const PRIMARY_FILL_TYPES = [
  { id: "solid", labelKey: "editor.colorPicker.solid", icon: "solid" },
  { id: "gradient", labelKey: "editor.colorPicker.gradient", icon: "gradient" },
  // image / texture / video deliberately omitted until renderer support lands.
];

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

  const handleApplyOpacity = (op) => {
    if (primaryType === "gradient") {
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

  const handleAngleChange = (rawVal) => {
    const num = parseInt(rawVal, 10);
    if (!Number.isFinite(num)) return;
    const clamped = ((num % 360) + 360) % 360;
    const nextAngle = `${clamped}deg`;
    setAngle(nextAngle);
    onChange(formatGradient(gradientType, nextAngle, gradientStops, geometry));
  };

  const handleEyeDropper = async () => {
    if (!window.EyeDropper) return;
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
    <div className="flex w-72 flex-col gap-3 rounded-2xl bg-neutral-900 p-3.5 text-white shadow-menu backdrop-blur-xl font-mono box-border select-none">
      {/* Header & Primary Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        {showTypeTabs ? (
          <div className="flex items-center gap-1">
            {PRIMARY_FILL_TYPES.map((fillType) => (
              <button
                key={fillType.id}
                type="button"
                onClick={() => handleSelectPrimaryType(fillType.id)}
                title={t(fillType.labelKey)}
                aria-label={t(fillType.labelKey)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-mono transition-all ${
                  primaryType === fillType.id
                    ? "bg-white/20 text-white font-medium"
                    : "text-neutral-400 hover:text-neutral-100 hover:bg-white/10"
                }`}
              >
                {fillType.icon === "solid" ? (
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="3"
                      fill="currentColor"
                      fillOpacity={0.9}
                    />
                  </svg>
                ) : fillType.icon === "gradient" ? (
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <defs>
                      <linearGradient
                        id="popover_grad_icon"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="currentColor"
                          stopOpacity="0.2"
                        />
                        <stop
                          offset="100%"
                          stopColor="currentColor"
                          stopOpacity="1"
                        />
                      </linearGradient>
                    </defs>
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="3"
                      fill="url(#popover_grad_icon)"
                      stroke="currentColor"
                    />
                  </svg>
                ) : fillType.icon === "image" ? (
                  <IconImage size={14} />
                ) : (
                  <span>{fillType.icon}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[12px] font-mono font-medium">
            {t("editor.colorPicker.title")}
          </span>
        )}

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        ) : null}
      </div>

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
        <div className="flex items-center gap-2 rounded-lg bg-neutral-800 px-2 py-1">
          <span className="text-[10px] font-mono text-neutral-400 shrink-0">
            ∠
          </span>
          <input
            type="number"
            min={0}
            max={359}
            step={1}
            value={parseInt(angle, 10) || 0}
            onChange={(e) => handleAngleChange(e.target.value)}
            aria-label={t("editor.props.gradientAngle")}
            className="min-w-0 flex-1 bg-transparent text-[11px] font-mono tabular-nums text-neutral-100 outline-none"
          />
          <span className="text-[10px] font-mono text-neutral-500">°</span>
        </div>
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
            activeOpacity={currentSolidOpacity}
            showOpacity={primaryType === "gradient"}
            onApplyColor={handleApplySolidColor}
            onApplyOpacity={handleApplyOpacity}
            onEyeDropper={window.EyeDropper ? handleEyeDropper : null}
            eyeDropperTitle={t("editor.colorPicker.eyedropper")}
          />

          <ColorChannelInputs
            hex={currentSolidHex}
            opacity={currentSolidOpacity}
            onChangeHex={handleApplySolidColor}
            onChangeOpacity={handleApplyOpacity}
          />

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
};
