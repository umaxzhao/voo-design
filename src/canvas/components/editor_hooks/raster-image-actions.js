import { decodeImageSource } from "../../editor/bitmap_cache.js";
import { readBitmapSize, readImageRgba, rgbaToPngDataUrl } from "../bitmap_pixels.js";
import { hasRetouchWork, retouchBudgetError, retouchOptions } from "../../editor/portrait_retouch_plan.js";
import { EDITOR_GENERATED_OPERATION, EDITOR_SCENE_PATCH } from "../../editor/editor_generated_output.js";
import { repaintFailureCode } from "./raster-action-helpers.js";

function nextPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/** Optional raster action implementation, loaded only from an explicit action. */
export function createImageActions(context) {
  const { engine, selected, upscaleBusy, retouchBusy, setMaskError, setUpscaleBusy, setUpscaleProgress, setRetouchBusy, setRetouchFailure, reportRetouchError, emitGeneratedOutput, onMaterializeGeneratedOutput, inFlightAbortRef, isCurrent } = context;
const upscaleImage = async (scaleOrOptions = 2) => {
    if (!isCurrent()) return false;
    let scale = 2;
    let modelId = null;
    if (typeof scaleOrOptions === "number") {
      scale = scaleOrOptions;
    } else if (typeof scaleOrOptions === "string") {
      modelId = scaleOrOptions;
      scale = scaleOrOptions.includes("4x") ? 4 : 2;
    } else if (typeof scaleOrOptions === "object" && scaleOrOptions !== null) {
      scale = typeof scaleOrOptions.scale === "number" ? scaleOrOptions.scale : 2;
      modelId = scaleOrOptions.modelId ?? null;
    }

    const target =
      selected ||
      engine?.getSelected?.() ||
      engine?.getDocument?.()?.nodes?.find((n) => n.kind === "image");
    if (!engine || upscaleBusy || !target) return;
    setUpscaleBusy(true);
    setUpscaleProgress(null);
    const abortController = new AbortController();
    inFlightAbortRef.current = abortController;
    try {
      const sourceSnapshot = engine.serialise?.();
      let image = engine.exportNodePng?.(target.id);
      if (!image && target.dataUrl) image = target.dataUrl;
      if (!image && target.src) image = target.src;
      if (!image && target.imageId) {
        const bmp = engine.getNodeBitmap?.(target);
        if (bmp) image = bmp;
      }
      if (!image) throw new Error("bitmapMissing");

      const bitmap =
        image instanceof HTMLImageElement ||
        image instanceof HTMLCanvasElement ||
        (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
          ? image
          : await decodeImageSource(image);
      if (!bitmap) throw new Error("bitmapDecodeFailed");

      const { runLocalUpscale } = await import("../../editor/local_upscale.js");
      if (!isCurrent()) return false;
      const blob = await runLocalUpscale(bitmap, {
        scale,
        modelId,
        onProgress: (p) => setUpscaleProgress(p),
        shouldStop: () => abortController.signal.aborted,
      });

      if (!blob) throw new Error("upscaleFailed");
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      return await emitGeneratedOutput(
        {
          dataUrl,
          operation: EDITOR_GENERATED_OPERATION.UPSCALE,
          parameters: { scale, modelId },
          scenePatch: { type: EDITOR_SCENE_PATCH.REPLACE_BITMAP },
          sourceSceneNodeId: target.id,
          sourceSnapshot,
        },
        onMaterializeGeneratedOutput,
      );
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("upscaleImage error:", err);
      setMaskError(repaintFailureCode(err));
    } finally {
      if (inFlightAbortRef.current === abortController) {
        inFlightAbortRef.current = null;
      }
      setUpscaleProgress(null);
      setUpscaleBusy(false);
    }
  };

const retouchImage = async (strengths) => {
    if (!isCurrent()) return false;
    const target =
      selected ||
      engine?.getSelected?.() ||
      engine?.getDocument?.()?.nodes?.find((n) => n.kind === "image");
    if (!engine || retouchBusy) return null;
    if (!target) {
      reportRetouchError("noImage");
      return null;
    }
    // Every step at zero would return an untouched copy and a candidate node
    // that looks identical: refuse rather than write a no-op into history.
    if (!hasRetouchWork(strengths)) return null;

    setRetouchBusy(true);
    setRetouchFailure(null);
    try {
      // Let the busy state paint before the synchronous block below, or the
      // click has no feedback at all while it runs.
      await nextPaint();
      // Built inside the guard: a strength the panel could not produce (an
      // out-of-range percent, an unknown step) must come out as the toast
      // below, not as an unhandled rejection — the caller is `void
      // retouchImage(...)`.
      const options = retouchOptions(strengths);
      const bitmap = engine.getNodeBitmap?.(target);
      if (!bitmap) throw new Error("bitmapMissing");
      const source = readBitmapSize(bitmap);
      const tooLarge = retouchBudgetError(source.width, source.height);
      if (tooLarge) {
        reportRetouchError(tooLarge);
        return null;
      }

      const sourceSnapshot = engine.serialise?.();
      const { rgba, width, height } = readImageRgba(bitmap);
      const { applyPortraitRetouch } =
        await import("../../editor/portrait_retouch.js");
      if (!isCurrent()) return false;
      const retouched = applyPortraitRetouch(rgba, width, height, options);
      return await emitGeneratedOutput(
        {
          dataUrl: rgbaToPngDataUrl(retouched, width, height),
          operation: EDITOR_GENERATED_OPERATION.AI_REPAIR,
          parameters: { portraitRetouch: options },
          scenePatch: { type: EDITOR_SCENE_PATCH.REPLACE_BITMAP },
          sourceSceneNodeId: target.id,
          sourceSnapshot,
        },
        onMaterializeGeneratedOutput,
      );
    } catch (err) {
      if (!isCurrent()) return false;
      // PortraitRetouchError carries a RETOUCH_ERRORS code; anything else is a
      // missing bitmap or a failed encode. Both are visible: a retouch that
      // silently did nothing reads as a broken button.
      console.error("retouchImage error:", err);
      reportRetouchError(err?.code ?? "failed");
      return null;
    } finally {
      setRetouchBusy(false);
    }
  };
  return { upscaleImage, retouchImage };
}
