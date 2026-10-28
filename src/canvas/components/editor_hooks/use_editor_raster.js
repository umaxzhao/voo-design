/** State and lifecycle for optional image actions; implementations load on use. */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { PERFORMANCE_TIER_KEY, getPerformanceTier } from "../../../shared/model-routes.js";
import { onSettingChange } from "../../../shared/settings.js";
import { nextRetouchFailure, repaintFailureCode, editorTierHintKey } from "./raster-action-helpers.js";
import { INITIAL_RASTER_STATE, rasterActionReducer, rasterStateSetters } from "./raster-action-state.js";

export { nextRetouchFailure, repaintFailureCode, editorTierHintKey, explicitRouteSelection } from "./raster-action-helpers.js";
export { resolveSelectionRepaintRoute, resolveRepaintChain, makeSelectionRepaintPaint } from "./raster-route-helpers.js";

const FEATURES = {
  matting: { load: () => import("./raster-matting-actions.js"), factory: "createMattingActions" },
  selection: { load: () => import("./raster-selection-actions.js"), factory: "createSelectionActions" },
  repaint: { load: () => import("./raster-repaint-actions.js"), factory: "createRepaintActions" },
  outpaint: { load: () => import("./raster-outpaint-action.js"), factory: "createOutpaintAction" },
  image: { load: () => import("./raster-image-actions.js"), factory: "createImageActions" },
};
const ACTIONS = {
  removeBackground: ["matting", "maskBusy"], selectSubject: ["matting", "lassoBusy"],
  runSelectionCutout: ["matting", "lassoBusy"], runLassoCutout: ["matting", "lassoBusy"],
  runRegionCutout: ["matting", "lassoBusy"], runRemoveBrush: ["selection", "lassoBusy"],
  runObjectStroke: ["selection", "lassoBusy"], runRepaint: ["repaint", "repaintBusy"],
  runSelectionRepaint: ["repaint", "selectionRepaintBusy"], runOutpaint: ["outpaint", "repaintBusy"],
  upscaleImage: ["image", "upscaleBusy"], retouchImage: ["image", "retouchBusy"],
};

export function useEditorRaster({ engine, selected, lasso, pendingObjectStroke, sourceWorkflowNodeId, onMaterializeGeneratedOutput }) {
  const [ui, dispatch] = useReducer(rasterActionReducer, null, () => ({
    ...INITIAL_RASTER_STATE, performanceTier: getPerformanceTier(),
  }));
  const stableSetters = useMemo(() => rasterStateSetters(dispatch), [dispatch]);
  const { maskBusy, maskError, maskProgress, mattingDownload, repaintBusy, selectionRepaintBusy,
    lassoBusy, repaintStatus, upscaleBusy, upscaleProgress, retouchBusy, retouchFailure, performanceTier } = ui;
  const { setMaskBusy, setMaskError, setMaskProgress, setMattingDownload, setRepaintBusy,
    setSelectionRepaintBusy, setLassoBusy, setRepaintStatus, setUpscaleBusy, setUpscaleProgress,
    setRetouchBusy, setRetouchFailure, setPerformanceTier } = stableSetters;
  useEffect(() => onSettingChange(PERFORMANCE_TIER_KEY, () => setPerformanceTier(getPerformanceTier())), [setPerformanceTier]);
  const reportRetouchError = useCallback((code) => {
    setRetouchFailure((current) => nextRetouchFailure(current, code));
  }, [setRetouchFailure]);

  const inFlightAbortRef = useRef(null);
  const epochRef = useRef(0);
  const downloadEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const engineRef = useRef(engine);
  const busyGroupsRef = useRef(new Map());
  engineRef.current = engine;

  const cancelAiGeneration = useCallback(() => {
    epochRef.current += 1;
    busyGroupsRef.current.clear();
    inFlightAbortRef.current?.abort();
    inFlightAbortRef.current = null;
    setRepaintBusy(false); setSelectionRepaintBusy(false);
    setUpscaleBusy(false); setMaskBusy(false); setLassoBusy(false); setRetouchBusy(false);
    setRepaintStatus(null); setUpscaleProgress(null); setMaskProgress(null);
  }, [setRepaintBusy, setSelectionRepaintBusy, setUpscaleBusy, setMaskBusy, setLassoBusy,
    setRetouchBusy, setRepaintStatus, setUpscaleProgress, setMaskProgress]);

  useEffect(() => {
    mountedRef.current = true;
    cancelAiGeneration();
    return () => {
      mountedRef.current = false;
      epochRef.current += 1;
      downloadEpochRef.current += 1;
      busyGroupsRef.current.clear();
      inFlightAbortRef.current?.abort();
      inFlightAbortRef.current = null;
    };
  }, [engine, cancelAiGeneration]);

  const downloadMattingModel = async () => {
    const pending = mattingDownload;
    if (!pending || !["required", "failed"].includes(pending.phase)) return false;
    const downloadEpoch = ++downloadEpochRef.current;
    const current = () => mountedRef.current && downloadEpoch === downloadEpochRef.current;
    setMattingDownload({ ...pending, phase: "downloading", progress: 0 });
    try {
      const { downloadModel } = await import("../../editor/local_matting.js");
      if (!current()) return false;
      await downloadModel(null, { onProgress: ({ phase, loaded, total }) => {
        if (!current() || phase !== "downloading") return;
        const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
        setMattingDownload((value) => value ? { ...value, phase: "downloading", progress } : value);
      } });
      if (!current()) return false;
      setMattingDownload({ ...pending, phase: "running", progress: 100 });
      const completed = await pending.resume();
      if (!current()) return false;
      setMattingDownload(completed === false ? { ...pending, phase: "failed", progress: 0 } : null);
      return completed !== false;
    } catch (error) {
      if (!current()) return false;
      console.error("Local matting model download failed", error);
      setMattingDownload({ ...pending, phase: "failed", progress: 0 });
      return false;
    }
  };
  const cancelMattingModelDownload = () => {
    downloadEpochRef.current += 1;
    setMattingDownload(null);
  };

  const state = { maskBusy, lassoBusy, repaintBusy, selectionRepaintBusy, upscaleBusy, retouchBusy };
  const setters = { setMaskBusy, setMaskError, setMaskProgress, setLassoBusy, setRepaintBusy,
    setRepaintStatus, setSelectionRepaintBusy, setUpscaleBusy, setUpscaleProgress, setRetouchBusy,
    setRetouchFailure, setMattingDownload, reportRetouchError };

  const invoke = async (name, args) => {
    const [featureId, busyName] = ACTIONS[name];
    if (!engine || state[busyName] || busyGroupsRef.current.has(busyName)) return false;
    const epoch = epochRef.current;
    const token = {};
    const isCurrent = () => mountedRef.current && engineRef.current === engine && epochRef.current === epoch;
    const setBusy = setters[`set${busyName[0].toUpperCase()}${busyName.slice(1)}`];
    busyGroupsRef.current.set(busyName, token);
    setBusy(true);
    // Capture the target and workflow sink at click time, before a cold import.
    const context = { engine, selected, lasso, pendingObjectStroke, ...state,
      onMaterializeGeneratedOutput, inFlightAbortRef, isCurrent,
      ...Object.fromEntries(Object.entries(setters).map(([key, setter]) => [key, (...values) => {
        if (isCurrent()) setter(...values);
      }])),
      ensureMattingModel: async (resume) => {
        const { isModelCached } = await import("../../editor/local_matting.js");
        if (!isCurrent()) return false;
        if (await isModelCached()) return isCurrent();
        if (isCurrent()) setMattingDownload({ phase: "required", progress: 0, resume });
        return false;
      },
      emitGeneratedOutput: async (payload, outputSink) => {
        if (!isCurrent()) return null;
        if (typeof outputSink !== "function") throw new Error("generatedOutputSinkMissing");
        const { createEditorGeneratedOutput } = await import("../../editor/editor_generated_output.js");
        if (!isCurrent()) return null;
        const result = createEditorGeneratedOutput({ ...payload, sourceWorkflowNodeId });
        const materialized = await outputSink(result);
        if (!materialized || typeof materialized !== "object") throw new Error("generatedOutputSinkMissing");
        return result;
      },
    };
    try {
      const feature = FEATURES[featureId];
      const implementation = await feature.load();
      if (!isCurrent()) return false;
      return await implementation[feature.factory](context)[name](...args);
    } catch (error) {
      if (!isCurrent()) return false;
      console.error(`Raster action ${name} failed`, error);
      if (name === "retouchImage") reportRetouchError(error?.code ?? "failed");
      else setMaskError(repaintFailureCode(error));
      return false;
    } finally {
      if (busyGroupsRef.current.get(busyName) === token) {
        busyGroupsRef.current.delete(busyName);
        if (isCurrent()) setBusy(false);
      }
    }
  };
  const actions = Object.fromEntries(Object.keys(ACTIONS).map((name) => [name, (...args) => invoke(name, args)]));

  // A finished engine stroke is a one-shot event. Effects can re-run when the
  // current callbacks change; identity consumption prevents duplicate commits.
  const consumedStrokeRef = useRef(null);
  const runObjectStroke = actions.runObjectStroke;
  useEffect(() => {
    if (!pendingObjectStroke) { consumedStrokeRef.current = null; return; }
    if (lassoBusy || busyGroupsRef.current.has("lassoBusy")) return;
    if (consumedStrokeRef.current?.engine === engine && consumedStrokeRef.current.stroke === pendingObjectStroke) return;
    consumedStrokeRef.current = { engine, stroke: pendingObjectStroke };
    engine?.clearPendingObjectStroke?.();
    void runObjectStroke(pendingObjectStroke);
  }, [engine, pendingObjectStroke, runObjectStroke, lassoBusy]);

  const runLasso = async (mode) => {
    if (!engine || lassoBusy) return;
    setLassoBusy(true);
    try { await engine.applyLasso(mode); }
    finally { setLassoBusy(false); }
  };

  return { ...actions, runLasso, maskBusy, maskError, maskProgress, upscaleBusy, upscaleProgress,
    retouchBusy, retouchError: retouchFailure?.code ?? null, retouchErrorSeq: retouchFailure?.seq ?? 0,
    lassoBusy, repaintBusy, repaintStatus, performanceTier,
    performanceTierHintKey: editorTierHintKey(performanceTier.tier), selectionRepaintBusy,
    mattingDownload, downloadMattingModel, cancelMattingModelDownload, cancelAiGeneration };
}
