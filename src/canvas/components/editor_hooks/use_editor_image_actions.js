import { useCallback, useEffect, useReducer, useRef } from "react";
import { readImageRgba } from "../bitmap_pixels.js";
import { captureError } from "../../../shared/error_collector.js";

/** Resolve actions against their page and defer optional pixel planners until use. */
export function useEditorImageActions({
  engine, enginesRef, snapshotsRef, retouchImage, setImageActionError,
}) {
  const mounted = useRef(false);
  const pending = useRef(new Map());
  const latestEngine = useRef(engine);
  latestEngine.current = engine;
  const [, refresh] = useReducer((revision) => revision + 1, 0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current.clear(); };
  }, []);

  const imageTargetFor = useCallback((nodeId) => {
    const pageEngine = enginesRef.current.get(nodeId)?.engine || engine;
    const doc = pageEngine?.getDocument?.() || snapshotsRef.current.get(nodeId)?.doc;
    return { pageEngine, doc, target: pageEngine?.getSelected?.() ||
      doc?.nodes?.find((node) => node.kind === "image") || null };
  }, [engine, enginesRef, snapshotsRef]);

  /** Capture document identity before awaiting; selection alone does not change the target. */
  const runDeferred = useCallback((pageEngine, { nodeId, guard = () => true, load, apply, errorKey }) => {
    if (!pageEngine || !mounted.current) return Promise.resolve(false);
    if (pending.current.has(pageEngine)) return pending.current.get(pageEngine).promise;
    const doc = pageEngine.getDocument?.();
    const ownerId = nodeId != null && enginesRef.current.get(nodeId)?.engine === pageEngine ? nodeId
      : [...enginesRef.current].find(([, entry]) => entry.engine === pageEngine)?.[0];
    const registered = ownerId != null;
    const ticket = {};
    const current = () => mounted.current && pending.current.get(pageEngine) === ticket &&
      (registered ? enginesRef.current.get(ownerId)?.engine === pageEngine : latestEngine.current === pageEngine) &&
      pageEngine.getDocument?.() === doc && guard();
    pending.current.set(pageEngine, ticket);
    setImageActionError(null);
    refresh();
    ticket.promise = (async () => {
      try {
        const implementation = await load();
        if (!current()) return false;
        apply(implementation);
        return true;
      } catch (error) {
        captureError({ error, message: "optional-image-action", source: "image-action-loader" });
        if (current()) setImageActionError(errorKey);
        return false;
      } finally {
        if (pending.current.get(pageEngine) === ticket) {
          pending.current.delete(pageEngine);
          if (mounted.current) refresh();
        }
      }
    })();
    return ticket.promise;
  }, [enginesRef, setImageActionError]);

  const runAutoEnhance = useCallback((nodeId) => {
    const { pageEngine, target } = imageTargetFor(nodeId);
    if (!pageEngine) return Promise.resolve(false);
    if (!target || target.kind !== "image") {
      setImageActionError("editor.imageAction.noImage");
      return Promise.resolve(false);
    }
    return runDeferred(pageEngine, {
      nodeId, errorKey: "editor.enhance.failed",
      load: () => import("../../editor/auto_enhance_apply.js"),
      apply: ({ ENHANCE_SAMPLE_EDGE, planOneTapEnhance, mergeEnhanceAdjustments }) => {
        const bitmap = pageEngine.getNodeBitmap?.(target);
        if (!bitmap) throw new Error("bitmapMissing");
        const { rgba } = readImageRgba(bitmap, { maxEdge: ENHANCE_SAMPLE_EDGE });
        const plan = planOneTapEnhance(rgba);
        // updateNode owns the entire edit/history entry; no extra commit.
        pageEngine.updateNode(target.id, {
          adjustments: mergeEnhanceAdjustments(target.adjustments, plan),
        });
      },
    });
  }, [imageTargetFor, runDeferred, setImageActionError]);

  const runSmartCrop = useCallback(() => {
    const pageEngine = engine;
    const ratio = pageEngine?.getCropRatio?.();
    if (!(ratio > 0) || pageEngine?.getTool?.() !== "crop") return Promise.resolve(false);
    const crop = JSON.stringify(pageEngine.getCropRect?.());
    return runDeferred(pageEngine, {
      errorKey: "editor.applyError",
      guard: () => pageEngine.getTool?.() === "crop" && pageEngine.getCropRatio?.() === ratio &&
        JSON.stringify(pageEngine.getCropRect?.()) === crop,
      load: () => import("../../editor/auto_crop_page.js"),
      apply: ({ applySmartCrop }) => applySmartCrop(pageEngine, { readRgba: readImageRgba }),
    });
  }, [engine, runDeferred]);

  const runPortraitRetouch = useCallback((nodeId, strengths) => {
    const { pageEngine } = imageTargetFor(nodeId);
    if (!pageEngine || pageEngine !== engine) return;
    void retouchImage(strengths);
  }, [engine, imageTargetFor, retouchImage]);

  return { runAutoEnhance, runSmartCrop, runPortraitRetouch,
    imageActionPending: pending.current.size > 0 };
}
