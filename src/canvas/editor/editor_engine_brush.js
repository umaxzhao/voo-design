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
    setColor: (next) => { color = next; },
    getBrushWidth: () => brushWidth,
    setBrushWidth: (next) => { brushWidth = next; },
    getBrushHardness: () => brushHardness,
    setBrushHardness: (next) => { brushHardness = next; },
    getBrushOpacity: () => brushOpacity,
    setBrushOpacity: (next) => { brushOpacity = next; },
    getBrushFlow: () => brushFlow,
    setBrushFlow: (next) => { brushFlow = next; },
    getBrushSmoothing: () => brushSmoothing,
    setBrushSmoothing: (next) => { brushSmoothing = next; },
    getBrushStrength: () => brushStrength,
    setBrushStrength: (next) => { brushStrength = next; },
    getBrushExposure: () => brushExposure,
    setBrushExposure: (next) => { brushExposure = next; },
    getBrushTonalRange: () => brushTonalRange,
    setBrushTonalRange: (next) => { brushTonalRange = next; },
    getBrushProtectLuminosity: () => brushProtectLuminosity,
    setBrushProtectLuminosity: (next) => { brushProtectLuminosity = next; },
    getBrushSaturating: () => brushSaturating,
    setBrushSaturating: (next) => { brushSaturating = next; },
    getBrushPreset: () => brushPreset,
    setBrushPreset: (next) => { brushPreset = next; },
    getPressureSize: () => pressureSize,
    setPressureSize: (next) => { pressureSize = next; },
    getPressureOpacity: () => pressureOpacity,
    setPressureOpacity: (next) => { pressureOpacity = next; },
    getBrushRoundness: () => brushRoundness,
    setBrushRoundness: (next) => { brushRoundness = next; },
    getBrushAngle: () => brushAngle,
    setBrushAngle: (next) => { brushAngle = next; },
    getBrushBlendMode: () => brushBlendMode,
    setBrushBlendMode: (next) => { brushBlendMode = next; },
    getPenStrokeWidth: () => penStrokeWidth,
    setPenStrokeWidth: (next) => { penStrokeWidth = next; },
    getArrowSize: () => arrowSize,
    setArrowSize: (next) => { arrowSize = next; },
    getArrowStart: () => arrowStart,
    setArrowStart: (next) => { arrowStart = next; },
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
