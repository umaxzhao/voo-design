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
