import { useEffect, useReducer, useRef } from "react";
import { hexToHsv, hsvToHex } from "./color_math.js";
import { parseGradient, formatGradient, normalizeGradientAngle, MESH_GRADIENT_PRESETS } from "./gradient_fill.js";
import { fillTypeOf, formatTextureFill } from "./texture-fill.js";
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const pointStops = points => points.map((point, index) => ({
  color: point.color,
  opacity: point.opacity ?? 100,
  position: index * 100 / Math.max(1, points.length - 1)
}));
function gradientState(color) {
  const parsed = fillTypeOf(color) === "gradient" ? parseGradient(color) : null;
  return {
    type: parsed?.type ?? "linear",
    angle: parsed?.angle ?? "135deg",
    geometry: parsed?.type === "mesh" ? {
      points: parsed.points,
      blur: parsed.blur
    } : parsed?.geometry ?? {},
    stops: parsed?.type === "mesh" ? pointStops(parsed.points) : parsed?.stops ?? [{
      color: HEX.test(color) ? color.slice(0, 7) : "#D9D9D9",
      opacity: 100,
      position: 0
    }, {
      color: "#FFFFFF",
      opacity: 100,
      position: 100
    }]
  };
}

/** Keep each mode's draft without writing an empty image or mutating a different row. */
export function useFillPicker({
  color,
  initialType,
  imageUrl,
  imageScaleMode,
  imagePaint,
  onChange,
  onPaintChange,
  onOpacityChange
}) {
  const initial = gradientState(color);
  const nativeImage = Boolean(imagePaint && (!color || color === "transparent"));
  const [state, dispatch] = useReducer((current, patch) => ({
    ...current,
    ...patch
  }), null, () => ({
    primaryType: initialType ?? (nativeImage ? "image" : fillTypeOf(color)),
    gradientType: initial.type,
    gradientStops: initial.stops,
    activeStopIndex: 0,
    angle: initial.angle,
    geometry: initial.geometry,
    hsv: hexToHsv(HEX.test(color) ? color.slice(0, 7) : initial.stops[0].color),
    eyeDropperError: false
  }));
  const {
    primaryType,
    gradientType,
    gradientStops,
    activeStopIndex,
    angle,
    geometry,
    hsv,
    eyeDropperError
  } = state;
  const lastEmission = useRef(color);
  const drafts = useRef({
    solid: HEX.test(color) ? color : initial.stops[0].color
  });
  const imageDraft = useRef(imagePaint ?? (imageUrl ? {
    fill: imageUrl,
    imageScaleMode
  } : null));
  const currentSolidHex = primaryType === "gradient" ? gradientStops[activeStopIndex]?.color ?? "#FFFFFF" : HEX.test(color) ? color.slice(0, 7) : drafts.current.solid;
  const currentSolidOpacity = gradientStops[activeStopIndex]?.opacity ?? 100;
  useEffect(() => {
    dispatch({
      hsv: hexToHsv(currentSolidHex)
    });
  }, [currentSolidHex]);
  useEffect(() => {
    if (lastEmission.current === color) return;
    lastEmission.current = color;
    const next = gradientState(color);
    if (fillTypeOf(color) === "gradient") {
      dispatch({
        primaryType: "gradient",
        gradientType: next.type,
        angle: next.angle,
        geometry: next.geometry,
        gradientStops: next.stops,
        activeStopIndex: 0
      });
    } else dispatch({
      primaryType: nativeImage ? "image" : fillTypeOf(color)
    });
  }, [color, nativeImage]);
  useEffect(() => {
    if (imagePaint) imageDraft.current = imagePaint;else if (imageUrl && fillTypeOf(imageUrl) === "image") imageDraft.current = {
      fill: imageUrl,
      imageScaleMode
    };
  }, [imageUrl, imageScaleMode, imagePaint]);
  const emit = (fill, patch, options) => {
    lastEmission.current = fill;
    if (patch && onPaintChange) return onPaintChange({
      fill,
      ...patch
    }, options);
    return onChange(fill);
  };
  const applyStops = nextStops => {
    const nextGeometry = gradientType === "mesh" ? {
      ...geometry,
      points: geometry.points.map((point, index) => ({
        ...point,
        color: nextStops[index].color,
        opacity: nextStops[index].opacity
      }))
    } : geometry;
    dispatch({
      gradientStops: nextStops,
      geometry: nextGeometry
    });
    emit(formatGradient(gradientType, angle, nextStops, nextGeometry));
  };
  const handleApplySolidColor = hex => {
    if (primaryType === "solid") {
      drafts.current.solid = hex;
      emit(hex);
    } else if (primaryType === "gradient") applyStops(gradientStops.map((stop, index) => index === activeStopIndex ? {
      ...stop,
      color: hex
    } : stop));
  };
  const handleApplyOpacity = opacity => {
    if (primaryType !== "gradient") onOpacityChange?.(opacity);else applyStops(gradientStops.map((stop, index) => index === activeStopIndex ? {
      ...stop,
      opacity
    } : stop));
  };
  const handleSelectPrimaryType = nextType => {
    if (nextType === primaryType) return;
    if (fillTypeOf(color) === primaryType) drafts.current[primaryType] = color;
    if (primaryType === "image" && fillTypeOf(color) === "image") imageDraft.current = {
      fill: color,
      imageScaleMode
    };
    dispatch({
      primaryType: nextType
    });
    if (nextType === "solid") emit(drafts.current.solid);else if (nextType === "gradient") emit(drafts.current.gradient ?? formatGradient(gradientType, angle, gradientStops, geometry));else if (nextType === "texture") emit(drafts.current.texture ?? formatTextureFill(), {
      imageScaleMode: "tile"
    });else if (imageDraft.current) emit(imageDraft.current.fill, imageDraft.current);
  };
  const handleSelectGradientType = type => {
    dispatch({
      gradientType: type
    });
    if (type === "mesh") {
      const points = geometry.points ?? MESH_GRADIENT_PRESETS.aurora;
      const nextGeometry = {
        points,
        blur: geometry.blur ?? 45
      };
      dispatch({
        geometry: nextGeometry,
        gradientStops: pointStops(points),
        activeStopIndex: 0
      });
      emit(formatGradient(type, angle, [], nextGeometry));
    } else emit(formatGradient(type, angle, gradientStops, geometry));
  };
  const handleAngleChange = (raw, rotate = false) => {
    if (!normalizeGradientAngle(raw)) return;
    const value = Number.parseFloat(raw);
    const nextAngle = `${rotate ? (value % 360 + 360) % 360 : Math.max(0, Math.min(360, value))}deg`;
    const nextGeometry = {
      ...geometry,
      startX: undefined,
      startY: undefined,
      endX: undefined,
      endY: undefined
    };
    dispatch({
      angle: nextAngle,
      geometry: nextGeometry
    });
    emit(formatGradient(gradientType, nextAngle, gradientStops, nextGeometry));
  };
  const handleImage = (fill, mode, options) => {
    imageDraft.current = {
      fill,
      imageScaleMode: mode
    };
    return emit(fill, {
      imageScaleMode: mode
    }, options);
  };
  const handleImageScale = mode => {
    if (imageDraft.current) imageDraft.current = {
      ...imageDraft.current,
      imageScaleMode: mode
    };
    return onPaintChange?.({
      imageScaleMode: mode
    });
  };
  const eyeDropperAvailable = typeof window !== "undefined" && Boolean(window.EyeDropper);
  const handleEyeDropper = async () => {
    if (!eyeDropperAvailable) return;
    dispatch({
      eyeDropperError: false
    });
    try {
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) handleApplySolidColor(result.sRGBHex.toUpperCase());
    } catch (error) {
      if (error.name !== "AbortError") {
        console.warn("[fill-picker] Eyedropper failed", error);
        dispatch({
          eyeDropperError: true
        });
      }
    }
  };
  return {
    primaryType,
    gradientType,
    gradientStops,
    setGradientStops: gradientStops => dispatch({
      gradientStops
    }),
    activeStopIndex,
    setActiveStopIndex: activeStopIndex => dispatch({
      activeStopIndex
    }),
    angle,
    geometry,
    currentSolidHex,
    currentSolidOpacity,
    hsv,
    setHsv: hsv => dispatch({
      hsv
    }),
    eyeDropperAvailable,
    eyeDropperError,
    handleApplySolidColor,
    handleApplyOpacity,
    handleSelectPrimaryType,
    handleSelectGradientType,
    handleAngleChange,
    handleEyeDropper,
    handleHsvChange: next => {
      dispatch({
        hsv: next
      });
      handleApplySolidColor(hsvToHex(next.h, next.s, next.v));
    },
    handleImage,
    handleImageScale,
    applyGradient: emit,
    applyTexture: texture => emit(formatTextureFill(texture), {
      imageScaleMode: "tile"
    })
  };
}
