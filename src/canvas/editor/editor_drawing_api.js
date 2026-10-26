/**
 * Drawing-domain API extracted from the createEditor closure.
 *
 * All mutable drawing state is read and written through live accessors so
 * this module never holds stale copies:
 * - color, brushWidth, brushHardness, brushOpacity, brushFlow,
 *   brushSmoothing, brushStrength, brushExposure, brushTonalRange,
 *   brushProtectLuminosity, brushSaturating, brushPreset, pressureSize,
 *   pressureOpacity, brushRoundness, brushAngle, brushBlendMode,
 *   penStrokeWidth, arrowSize and arrowStart are all reassigned by these
 *   methods (and by other engine code), so every access goes through
 *   getX/setX callbacks.
 *
 * Stable references passed directly: getDoc/setDoc, selectMany, requestRender,
 * notify.
 */

import {
  NODE_KIND,
  findNode,
  normalizePathHardness,
} from "./scene_model.js";
import { clampBrushWidth } from "./editor_constants.js";
import * as ops from "./doc_ops.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import { createDrawingShapesApi } from "./drawing_api_shapes.js";
import { getTextToolDefaults, setTextToolDefault } from "./text_tool_defaults.js";

export { createDrawingShapesApi };

export function createDrawingApi({
  getDoc,
  setDoc,
  getSelectedId,
  selectMany,
  getColor,
  setColor,
  getBrushWidth,
  setBrushWidth,
  getBrushHardness,
  setBrushHardness,
  getBrushOpacity,
  setBrushOpacity,
  getBrushFlow,
  setBrushFlow,
  getBrushSmoothing,
  setBrushSmoothing,
  getBrushStrength,
  setBrushStrength,
  getBrushExposure,
  setBrushExposure,
  getBrushTonalRange,
  setBrushTonalRange,
  getBrushProtectLuminosity,
  setBrushProtectLuminosity,
  getBrushSaturating,
  setBrushSaturating,
  getBrushPreset,
  setBrushPreset,
  getPressureSize,
  setPressureSize,
  getPressureOpacity,
  setPressureOpacity,
  getBrushRoundness,
  setBrushRoundness,
  getBrushAngle,
  setBrushAngle,
  getBrushBlendMode,
  setBrushBlendMode,
  getPenStrokeWidth,
  setPenStrokeWidth,
  getArrowSize,
  setArrowSize,
  getArrowStart,
  setArrowStart,
  requestRender,
  notify,
}) {
  const shapes = createDrawingShapesApi({
    getDoc,
    setDoc,
    selectMany,
    getColor,
  });

  return {
    getColor: () => getColor(),
    getBrushWidth: () => getBrushWidth(),
    getPenStrokeWidth: () => getPenStrokeWidth(),
    setPenStrokeWidth(next) {
      const value = Number(next);
      if (Number.isFinite(value) && value >= 1) {
        setPenStrokeWidth(Math.round(value));
        notify();
      }
    },
    getBrushHardness: () => getBrushHardness(),
    getBrushOpacity: () => getBrushOpacity(),
    getBrushBlendMode: () => getBrushBlendMode(),
    setBrushBlendMode(mode) {
      setBrushBlendMode(
        ["multiply", "screen", "overlay"].includes(mode) ? mode : "normal",
      );
      notify();
    },
    setColor(next) {
      setColor(next);
      const selectedId = getSelectedId();
      const selectedNode = selectedId ? findNode(getDoc(), selectedId) : null;
      if (selectedNode?.kind === NODE_KIND.PATH) {
        commitEditorDocument(
          "editor.drawing.change",
          setDoc,
          ops.updateNode(getDoc(), selectedId, { stroke: next }),
        );
      } else {
        notify();
      }
    },
    setBrushWidth(next) {
      const value = clampBrushWidth(next);
      setBrushWidth(value);
      const selectedId = getSelectedId();
      const selectedNode = selectedId ? findNode(getDoc(), selectedId) : null;
      if (selectedNode?.kind === NODE_KIND.PATH) {
        commitEditorDocument(
          "editor.drawing.change",
          setDoc,
          ops.updateNode(getDoc(), selectedId, { strokeWidth: value }),
        );
      } else {
        notify();
      }
    },
    setBrushHardness(next) {
      const value = normalizePathHardness(next);
      setBrushHardness(value);
      const selectedId = getSelectedId();
      const selectedNode = selectedId ? findNode(getDoc(), selectedId) : null;
      if (selectedNode?.kind === NODE_KIND.PATH) {
        commitEditorDocument(
          "editor.drawing.change",
          setDoc,
          ops.updateNode(getDoc(), selectedId, { hardness: value }),
        );
      } else {
        notify();
      }
    },
    setBrushOpacity(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      setBrushOpacity(Math.min(1, Math.max(0, value)));
      notify();
    },
    getBrushFlow: () => getBrushFlow(),
    getBrushSmoothing: () => getBrushSmoothing(),
    setBrushFlow(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      setBrushFlow(Math.min(1, Math.max(0, value)));
      notify();
    },
    setBrushSmoothing(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      setBrushSmoothing(Math.min(1, Math.max(0, value)));
      notify();
    },
    getBrushStrength: () => getBrushStrength(),
    setBrushStrength(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      setBrushStrength(Math.min(1, Math.max(0, value)));
      notify();
    },
    getPressureSize: () => getPressureSize(),
    setPressureSize(next) {
      setPressureSize(Boolean(next));
      notify();
    },
    getPressureOpacity: () => getPressureOpacity(),
    setPressureOpacity(next) {
      setPressureOpacity(Boolean(next));
      notify();
    },
    getBrushExposure: () => getBrushExposure(),
    setBrushExposure(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      setBrushExposure(Math.min(1, Math.max(0, value)));
      notify();
    },
    getBrushTonalRange: () => getBrushTonalRange(),
    setBrushTonalRange(next) {
      setBrushTonalRange(
        ["shadows", "midtones", "highlights"].includes(next)
          ? next
          : "midtones",
      );
      notify();
    },
    getBrushProtectLuminosity: () => getBrushProtectLuminosity(),
    setBrushProtectLuminosity(next) {
      setBrushProtectLuminosity(Boolean(next));
      notify();
    },
    getBrushSaturating: () => getBrushSaturating(),
    setBrushSaturating(next) {
      setBrushSaturating(Boolean(next));
      notify();
    },
    getBrushPreset: () => getBrushPreset(),
    setBrushPreset(next) {
      if (typeof next === "string" && next) setBrushPreset(next);
      notify();
    },
    getBrushRoundness: () => getBrushRoundness(),
    setBrushRoundness(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      setBrushRoundness(Math.min(1, Math.max(0.01, value)));
      notify();
    },
    getBrushAngle: () => getBrushAngle(),
    setBrushAngle(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      setBrushAngle(((value % 360) + 360) % 360);
      notify();
    },
    getArrowSize: () => getArrowSize(),
    setArrowSize(next) {
      const value = Number(next);
      setArrowSize(Number.isFinite(value) && value > 0 ? value : null);
      notify();
    },
    getArrowStart: () => getArrowStart(),
    setArrowStart(next) {
      setArrowStart(Boolean(next));
      notify();
    },
    addRectAt: shapes.addRectAt,
    addFrameAt: shapes.addFrameAt,
    addEllipseAt: shapes.addEllipseAt,
    addTextAt: shapes.addTextAt,
    // Text-tool pending style: the right panel edits these before any layer is
    // selected, and interactive text creation reads the same values.
    getTextToolDefaults,
    getDefaultFontFamily: () => getTextToolDefaults().fontFamily,
    setDefaultFontFamily: (value) => {
      if (setTextToolDefault("fontFamily", value)) notify();
    },
    getDefaultFontWeight: () => getTextToolDefaults().fontWeight,
    setDefaultFontWeight: (value) => {
      if (setTextToolDefault("fontWeight", value)) notify();
    },
    getDefaultFontSize: () => getTextToolDefaults().fontSize,
    setDefaultFontSize: (value) => {
      if (setTextToolDefault("fontSize", value)) notify();
    },
    getDefaultItalic: () => getTextToolDefaults().italic,
    setDefaultItalic: (value) => {
      if (setTextToolDefault("italic", value)) notify();
    },
    getDefaultUnderline: () => getTextToolDefaults().underline,
    setDefaultUnderline: (value) => {
      if (setTextToolDefault("underline", value)) notify();
    },
    getDefaultAlign: () => getTextToolDefaults().align,
    setDefaultAlign: (value) => {
      if (setTextToolDefault("align", value)) notify();
    },
    getDefaultLineHeight: () => getTextToolDefaults().lineHeight,
    setDefaultLineHeight: (value) => {
      if (setTextToolDefault("lineHeight", value)) notify();
    },
    getDefaultLetterSpacing: () => getTextToolDefaults().letterSpacing,
    setDefaultLetterSpacing: (value) => {
      if (setTextToolDefault("letterSpacing", value)) notify();
    },
    addPenNode: shapes.addPenNode,
    applyCopyStructure: shapes.applyCopyStructure,
    pathToShape() {
      const id = getSelectedId();
      const node = id ? findNode(getDoc(), id) : null;
      if (!node || node.kind !== NODE_KIND.PATH || node.pen !== true)
        return false;
      commitEditorDocument(
        "editor.drawing.change",
        setDoc,
        ops.updateNode(getDoc(), id, {
          fill: getColor(),
          fillOpacity: 1,
        }),
      );
      requestRender();
      notify();
      return true;
    },
  };
}
