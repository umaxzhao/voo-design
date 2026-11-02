import { callHost, getEnvironment } from "../../rpc.js";
import { RPC } from "../../../shared/messages.js";
import { PLATFORM_TARGET } from "../../generation_routes.js";
import { compositePlan } from "../../editor/outpaint_geometry.js";
import { protectRectForSaliency } from "../../editor/outpaint_direction.js";
import { computeSaliencyMap, SALIENCY_ANALYSIS_MAX_EDGE } from "../../editor/saliency_map.js";
import { DEFAULT_OUTPAINT_PRIME_MODE, DEFAULT_OUTPAINT_SEAM, compositeOutpaintResult, primeOutpaintMargin } from "../../editor/outpaint_composite.js";
import { decodeImageSource } from "../../editor/bitmap_cache.js";
import { readImageRgba, rgbaToPngDataUrl } from "../bitmap_pixels.js";
import { useDesignStore } from "../../../store/design_store.js";
import { MODEL_ROUTE_ID } from "../../../shared/model-routes.js";
import { onLocalBackendStarting } from "../../../shared/local_backend_events.js";
import { resolveRepaintRoute } from "../../editor/repaint_route.js";
import { createOutpaintScenePatch, EDITOR_GENERATED_OPERATION } from "../../editor/editor_generated_output.js";
import { editorRouteChain } from "./raster-route-helpers.js";
import { repaintFailureCode } from "./raster-action-helpers.js";
import { reportRasterFallback } from "./raster-fallback-diagnostics.js";

const OUTPAINT_INSTRUCTION =
  "Outpaint this image: the attached canvas has the original picture surrounded " +
  "by a coarse edge-extension of it, which is only a placeholder. Replace that " +
  "placeholder border with a seamless continuation of the scene, matching the " +
  "original lighting, perspective, texture and colour palette so the join is " +
  "invisible. Do not move, crop, restyle or repaint the original pixels. " +
  "Return one fully painted image at the same canvas size.";

function readImageRgbaAt(bitmap, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

function readBitmapSaliency(bitmap) {
  if (!bitmap) return null;
  try {
    const { rgba, width, height } = readImageRgba(bitmap, {
      maxEdge: SALIENCY_ANALYSIS_MAX_EDGE,
    });
    return computeSaliencyMap({ rgba, width, height });
  } catch (error) {
    reportRasterFallback("outpaint-saliency-unavailable", error);
    return null;
  }
}

function protectOutpaintRect(bitmap, node, rect) {
  const saliency = readBitmapSaliency(bitmap);
  if (!saliency) return rect;
  return protectRectForSaliency(rect, saliency, {
    frameX: node?.x ?? 0,
    frameY: node?.y ?? 0,
    frameWidth: node?.width,
    frameHeight: node?.height,
  });
}

/** Optional raster action implementation, loaded only from an explicit action. */
export function createOutpaintAction(context) {
  const { engine, repaintBusy, setMaskError, setRepaintBusy, setRepaintStatus, emitGeneratedOutput, onMaterializeGeneratedOutput, inFlightAbortRef, isCurrent } = context;
const runOutpaint = async (node, rect, prompt) => {
    if (!isCurrent()) return false;
    if (!engine || !node || !rect || repaintBusy) return;
    setRepaintBusy(true);
    setMaskError(false);
    setRepaintStatus(null);
    const stopBackendWatch = onLocalBackendStarting(() =>
      setRepaintStatus({ phase: "starting" }),
    );
    let abortController = null;
    try {
      const source = engine.exportNodePng(node.id) ?? node.dataUrl ?? node.src;
      if (!source) throw new Error("bitmapMissing");
      const sourceSnapshot = engine.serialise?.();

      const bitmap = await decodeImageSource(source);
      // Saliency can only widen the user's rect: if the subject would be cut
      // or pinched, grow the rect around it (plus the minimum margin) before
      // planning. No usable map -> `effectiveRect` is the submitted rect and
      // every downstream byte is exactly what it was before saliency existed.
      const effectiveRect = protectOutpaintRect(bitmap, node, rect);
      const plan = compositePlan(
        {
          ...node,
          bitmapWidth: bitmap.naturalWidth ?? bitmap.width,
          bitmapHeight: bitmap.naturalHeight ?? bitmap.height,
        },
        effectiveRect,
      );
      // Read the source at the plan's own resolution: the output cap may have
      // scaled the original down, and a natural-size read of a large photo is a
      // many-hundred-megabyte buffer for what is at most a 2048px request.
      const sourceRgba = readImageRgbaAt(
        bitmap,
        plan.drawWidth,
        plan.drawHeight,
      );
      // Send the grown margin primed with a continuation of the picture instead
      // of empty: the model refines a scene that is already there rather than
      // inventing one for a hole, which is what the colour shift at the join
      // and the "pasted-on" look came from.
      const composite = rgbaToPngDataUrl(
        primeOutpaintMargin(sourceRgba, {
          sourceWidth: plan.drawWidth,
          sourceHeight: plan.drawHeight,
          plan,
          mode: DEFAULT_OUTPAINT_PRIME_MODE,
        }),
        plan.width,
        plan.height,
      );

      // No per-action picker on this path, so the shared route decides: a
      // stored choice locks the chain, the built-in local default does not.
      const chain = await editorRouteChain(MODEL_ROUTE_ID.OUTPAINT);
      const primary = chain[0] ?? null;

      // Readiness answers for the whole chain, so a stopped local engine
      // degrades to a configured cloud candidate instead of refusing the edit.
      const hasApiProvider = chain.length > 0;
      const route = resolveRepaintRoute({
        hasApiProvider,
        environment: getEnvironment(),
        platform: PLATFORM_TARGET.CHATGPT,
        providerId: primary?.providerId,
        modelId: primary?.modelId,
        // Inherit the shared API default without overriding saved model routes.
        executionMode: undefined,
      });

      const instruction = prompt?.trim()
        ? `${OUTPAINT_INSTRUCTION}\n\n${prompt.trim()}`
        : OUTPAINT_INSTRUCTION;
      abortController = new AbortController();
      inFlightAbortRef.current = abortController;

      let painted;
      let usedProvider = primary;
      if (route.route === "api") {
        const { repaintLayer } = await import("../../editor/layer_repaint.js");
        if (!isCurrent()) return false;
      painted = await repaintLayer({
          dataUrl: composite,
          prompt: instruction,
          providers: chain,
          routeId: MODEL_ROUTE_ID.OUTPAINT,
          shouldStop: () => abortController.signal.aborted,
          onStatus: (state) => {
            if (state?.providerId) {
              usedProvider = {
                providerId: state.providerId,
                modelId: state.modelId,
              };
            }
            setRepaintStatus(state ?? null);
          },
        });
      } else if (route.route === "chat") {
        const settings = useDesignStore.getState().settings;
        if (!isCurrent()) return false;
      const result = await callHost(
          RPC.GENERATE,
          {
            nodeId: node.id,
            prompt: instruction,
            images: [composite],
            timeoutMs: settings.timeoutMs,
            settleMs: settings.settleMs,
            autoScroll: settings.autoScroll,
          },
          { timeout: settings.timeoutMs + 30000, platform: route.platform },
        );
        painted = result?.images?.[0];
      } else {
        setMaskError("noRepaintRouteAvailable");
        return;
      }

      if (!painted) throw new Error("noResult");

      const paintedBitmap = await decodeImageSource(painted);
      if (!paintedBitmap) throw new Error("noResult");

      // The answer only supplies the grown margin: the region the user did not
      // ask to regenerate is written back from the original bytes, and the join
      // is feathered, so the model's own re-render of that region cannot show up
      // as a tone line across the boundary.
      const finalComposite = rgbaToPngDataUrl(
        compositeOutpaintResult(
          readImageRgbaAt(paintedBitmap, plan.width, plan.height),
          sourceRgba,
          {
            plan,
            seam: DEFAULT_OUTPAINT_SEAM,
            sourceWidth: plan.drawWidth,
            sourceHeight: plan.drawHeight,
          },
        ),
        plan.width,
        plan.height,
      );
      return await emitGeneratedOutput(
        {
          dataUrl: finalComposite,
          operation: EDITOR_GENERATED_OPERATION.OUTPAINT,
          parameters: {
            prompt: prompt?.trim() ?? "",
            platform: route.platform ?? PLATFORM_TARGET.CHATGPT,
            providerId: usedProvider?.providerId,
            modelId: usedProvider?.modelId,
          },
          scenePatch: createOutpaintScenePatch(sourceSnapshot, effectiveRect),
          sourceSceneNodeId: node.id,
          sourceSnapshot,
        },
        onMaterializeGeneratedOutput,
      );
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("layer outpaint failed", err);
      setMaskError(repaintFailureCode(err));
    } finally {
      if (inFlightAbortRef.current === abortController) {
        inFlightAbortRef.current = null;
      }
      stopBackendWatch();
      setRepaintStatus(null);
      setRepaintBusy(false);
    }
  };
  return { runOutpaint };
}
