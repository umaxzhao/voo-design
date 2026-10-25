/**
 * Brush styling state and drawing tool configuration controller.
 *
 * Extracted from editor_engine.js to isolate brush dynamics and drawing parameters.
 */

import {
  DEFAULT_BRUSH_WIDTH,
  DEFAULT_MARK_COLOR,
  DEFAULT_PEN_STROKE_WIDTH,
} from "./editor_constants.js";
import { createDrawingApi } from "./editor_drawing_api.js";
import { DEFAULT_SOFT_BRUSH_HARDNESS } from "./scene_model_node_builders.js";
import {
  createDefaultGradientToolState,
  normalizeGradientToolState,
  rotateGradientStops,
} from "./gradient_tool_state.js";

export function createEngineBrushController({
  getDoc,
  setDoc,
  getSelectedId,
  selectMany,
  requestRender,
  notify,
}) {
  let brushMode = "normal";
  let color = DEFAULT_MARK_COLOR;
  let brushWidth = DEFAULT_BRUSH_WIDTH;
  // The pixel brush starts with a soft edge; path nodes keep the hard
  // DEFAULT_BRUSH_HARDNESS as their own.
  let brushHardness = DEFAULT_SOFT_BRUSH_HARDNESS;
  let brushOpacity = 1;
  let brushFlow = 1;
  let brushSmoothing = 0;
  let brushStrength = 0.5;
  let brushExposure = 0.5;
  let brushTonalRange = "midtones";
  let brushProtectLuminosity = true;
  let brushSaturating = true;
  let brushPreset = "pencil";
  let pressureSize = false;
  let pressureOpacity = false;
  let brushRoundness = 1;
  let brushAngle = 0;
  let brushBlendMode = "normal";
  let penStrokeWidth = DEFAULT_PEN_STROKE_WIDTH;
  let arrowSize = 24;
  let arrowStart = false;
  // The Gradient tool's multi-stop state (type/angle/stops): the panel is the
  // writer, the drag-and the panel's Apply both paint from it.
  let gradientTool = createDefaultGradientToolState();
  // Tool-level paint opacity (Fill / Gradient panels). Values are 0..1 and are
  // applied at paint time; they are not layer opacity.
  let fillOpacity = 1;
  let gradientOpacity = 1;
  // Shape-tool paint: the colour wheel is the fill, these are the other axes.
  let shapeStrokeColor = "#FFFFFF";
  let shapeStrokeWidth = 1;
  let shapeOpacity = 1;
  const setGradientToolState = (patch = {}) => {
    gradientTool = normalizeGradientToolState({ ...gradientTool, ...patch });
    notify();
    return gradientTool;
  };

  const drawingApi = createDrawingApi({
    getDoc,
    setDoc,
    getSelectedId,
    selectMany,
    getColor: () => color,
    setColor: (next) => {
      color = next;
      notify?.();
    },
    getBrushWidth: () => brushWidth,
    setBrushWidth: (next) => {
      brushWidth = next;
      notify?.();
    },
    getBrushHardness: () => brushHardness,
    setBrushHardness: (next) => {
      brushHardness = next;
      notify?.();
    },
    getBrushOpacity: () => brushOpacity,
    setBrushOpacity: (next) => {
      brushOpacity = next;
      notify?.();
    },
    getBrushFlow: () => brushFlow,
    setBrushFlow: (next) => {
      brushFlow = next;
      notify?.();
    },
    getBrushSmoothing: () => brushSmoothing,
    setBrushSmoothing: (next) => {
      brushSmoothing = next;
      notify?.();
    },
    getBrushStrength: () => brushStrength,
    setBrushStrength: (next) => {
      brushStrength = next;
      notify?.();
    },
    getBrushExposure: () => brushExposure,
    setBrushExposure: (next) => {
      brushExposure = next;
      notify?.();
    },
    getBrushTonalRange: () => brushTonalRange,
    setBrushTonalRange: (next) => {
      brushTonalRange = next;
      notify?.();
    },
    getBrushProtectLuminosity: () => brushProtectLuminosity,
    setBrushProtectLuminosity: (next) => {
      brushProtectLuminosity = next;
      notify?.();
    },
    getBrushSaturating: () => brushSaturating,
    setBrushSaturating: (next) => {
      brushSaturating = next;
      notify?.();
    },
    getBrushPreset: () => brushPreset,
    setBrushPreset: (next) => {
      brushPreset = next;
      notify?.();
    },
    getPressureSize: () => pressureSize,
    setPressureSize: (next) => {
      pressureSize = next;
      notify?.();
    },
    getPressureOpacity: () => pressureOpacity,
    setPressureOpacity: (next) => {
      pressureOpacity = next;
      notify?.();
    },
    getBrushRoundness: () => brushRoundness,
    setBrushRoundness: (next) => {
      brushRoundness = next;
      notify?.();
    },
    getBrushAngle: () => brushAngle,
    setBrushAngle: (next) => {
      brushAngle = next;
      notify?.();
    },
    getBrushBlendMode: () => brushBlendMode,
    setBrushBlendMode: (next) => {
      brushBlendMode = next;
      notify?.();
    },
    getPenStrokeWidth: () => penStrokeWidth,
    setPenStrokeWidth: (next) => {
      penStrokeWidth = next;
      notify?.();
    },
    getArrowSize: () => arrowSize,
    setArrowSize: (next) => {
      arrowSize = next;
      notify?.();
    },
    getArrowStart: () => arrowStart,
    setArrowStart: (next) => {
      arrowStart = next;
      notify?.();
    },
    requestRender,
    notify,
  });

  return {
    getColor: () => color,
    getGradientToolState: () => gradientTool,
    getShapeStrokeColor: () => shapeStrokeColor,
    setShapeStrokeColor(next) {
      if (typeof next === "string" && /^#[0-9a-fA-F]{6}$/.test(next)) {
        shapeStrokeColor = next.toUpperCase();
        notify?.();
      }
    },
    getStrokeWidth: () => shapeStrokeWidth,
    setStrokeWidth(next) {
      const value = Number(next);
      shapeStrokeWidth = Number.isFinite(value)
        ? Math.max(0, Math.min(100, value))
        : 1;
      notify?.();
    },
    getShapeOpacity: () => shapeOpacity,
    setShapeOpacity(next) {
      const value = Number(next);
      shapeOpacity = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 1;
      notify?.();
    },
    getFillOpacity: () => fillOpacity,
    setFillOpacity(next) {
      const value = Number(next);
      fillOpacity = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
      notify?.();
    },
    getGradientOpacity: () => gradientOpacity,
    setGradientOpacity(next) {
      const value = Number(next);
      gradientOpacity = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 1;
      notify?.();
    },
    setGradientToolState,
    setGradientToolType(type) {
      return setGradientToolState({ type });
    },
    setGradientToolAngle(angle) {
      return setGradientToolState({ angle });
    },
    setGradientToolStops(stops, activeStopIndex = null) {
      if (stops != null) setGradientToolState({ stops });
      if (activeStopIndex != null) setGradientToolState({ activeStopIndex });
      return gradientTool;
    },
    setGradientToolActiveStop(index) {
      return setGradientToolState({ activeStopIndex: index });
    },
    /** Paints the picked colour into the active stop (the wheel is the editor). */
    setGradientToolStopColor(color) {
      const index = Math.max(0, Math.min(gradientTool.stops.length - 1, gradientTool.activeStopIndex));
      if (!(typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color))) return gradientTool;
      const stops = gradientTool.stops.map((stop, i) =>
        i === index ? { ...stop, color: color.toUpperCase() } : stop,
      );
      gradientTool = { ...gradientTool, stops };
      notify();
      return gradientTool;
    },
    /** Reverses the gradient stops (was wired in the panel before the engine method existed). */
    reverseGradient() {
      gradientTool = {
        ...gradientTool,
        stops: rotateGradientStops(gradientTool.stops),
      };
      notify();
      return gradientTool;
    },
    getBrushMode: () => brushMode,
    setBrushMode(mode) {
      const allowed = [
        "normal",
        "smudge",
        "blur",
        "sharpen",
        "dodge",
        "burn",
        "sponge",
      ];
      brushMode = allowed.includes(mode) ? mode : "normal";
      notify();
    },
    ...drawingApi,
  };
}
