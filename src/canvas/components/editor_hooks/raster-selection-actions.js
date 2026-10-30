import { dataUrlToBlob } from "../../store/db.js";
import { callHost } from "../../rpc.js";
import { RPC } from "../../../shared/messages.js";
import { PLATFORM_TARGET } from "../../generation_routes.js";
import { useDesignStore } from "../../../store/design_store.js";
import { repaintFailureCode } from "./raster-action-helpers.js";
import { reportRefinementSkipped } from "./raster-matting-actions.js";

const REMOVE_FILL_INSTRUCTION =
    "The transparent area has been erased. Reconstruct it from the " +
    "surrounding pixels so the result looks untouched — match the skin, " +
    "texture, lighting and grain around it. Do not add any new object.";

/** Optional raster action implementation, loaded only from an explicit action. */
export function createSelectionActions(context) {
  const { engine, pendingObjectStroke, ensureMattingModel, setMaskError, setMaskProgress, setLassoBusy, isCurrent } = context;
const runRemoveBrush = async (nodeId, bitmap, localPoints, diameter) => {
    if (!isCurrent()) return false;
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const ctx = scratch.getContext("2d");
    if (!ctx) throw new Error("noContext");
    ctx.drawImage(bitmap, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = Math.max(1, diameter);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (localPoints.length === 1) {
      // A tap still has to remove something: give it the brush's footprint.
      ctx.beginPath();
      ctx.arc(
        localPoints[0].x,
        localPoints[0].y,
        Math.max(1, diameter / 2),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      ctx.beginPath();
      localPoints.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }

    const scratchDataUrl = scratch.toDataURL("image/png");
    let painted;
    const settings = useDesignStore.getState().settings;

    // This legacy removal operation sends its prepared pixels to the host chat.
    try {
      if (!isCurrent()) return false;
      const result = await callHost(
        RPC.GENERATE,
        {
          nodeId,
          prompt: REMOVE_FILL_INSTRUCTION,
          images: [scratchDataUrl],
          timeoutMs: settings.timeoutMs,
          settleMs: settings.settleMs,
          autoScroll: settings.autoScroll,
        },
        {
          timeout: settings.timeoutMs + 30000,
          platform: PLATFORM_TARGET.CHATGPT,
        },
      );
      painted = result?.images?.[0];
    } catch (hostErr) {
      if (!isCurrent()) return false;
      console.warn("host generation failed, trying api repaint", hostErr);
      try {
        const { repaintLayer } = await import("../../editor/layer_repaint.js");
        if (!isCurrent()) return false;
      painted = await repaintLayer({
          dataUrl: scratchDataUrl,
          prompt: REMOVE_FILL_INSTRUCTION,
        });
      } catch (repaintErr) {
        if (!isCurrent()) return false;
        console.warn(
          "api repaint failed, falling back to local inpainting",
          repaintErr,
        );
        // Pure local inpaint fallback
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = bitmap.width;
        srcCanvas.height = bitmap.height;
        srcCanvas.getContext("2d").drawImage(bitmap, 0, 0);

        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = bitmap.width;
        maskCanvas.height = bitmap.height;
        const maskCtx = maskCanvas.getContext("2d");
        maskCtx.lineWidth = Math.max(2, diameter);
        maskCtx.lineCap = "round";
        maskCtx.lineJoin = "round";
        maskCtx.strokeStyle = "#ffffff";
        maskCtx.fillStyle = "#ffffff";
        if (localPoints.length === 1) {
          maskCtx.beginPath();
          maskCtx.arc(
            localPoints[0].x,
            localPoints[0].y,
            Math.max(1, diameter / 2),
            0,
            Math.PI * 2,
          );
          maskCtx.fill();
        } else {
          maskCtx.beginPath();
          localPoints.forEach((pt, idx) => {
            if (idx === 0) maskCtx.moveTo(pt.x, pt.y);
            else maskCtx.lineTo(pt.x, pt.y);
          });
          maskCtx.stroke();
        }

        const { inpaintLocalImage } =
          await import("../../editor/local_inpaint.js");
        painted = inpaintLocalImage(
          srcCanvas,
          maskCanvas,
          Math.max(4, Math.round(diameter / 2)),
        );
      }
    }

    if (!painted) throw new Error("removeFailed");
    if (!isCurrent()) return false;
      const replaced = await engine.replaceNodeBitmap(nodeId, painted, {
      resetCrop: true,
    });
    if (!replaced) throw new Error("removeDiscarded");
  };

const runObjectStroke = async ({
    nodeId,
    points,
    intent,
    size,
    modelReady = false,
  }) => {
    if (!isCurrent()) return false;
    const node = engine
      ?.getDocument()
      ?.nodes.find((entry) => entry.id === nodeId);
    if (!engine || !node) return;
    if (intent !== "remove" && !modelReady) {
      const resume = () =>
        runObjectStroke({ nodeId, points, intent, size, modelReady: true });
      if (!(await ensureMattingModel(resume))) return;
    }
    setLassoBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    try {
      const source = engine.exportNodePng(nodeId) ?? node.dataUrl ?? node.src;
      if (!source) throw new Error("bitmapMissing");
      const bitmap = await createImageBitmap(dataUrlToBlob(source));
      try {
        // The stroke was recorded in document units; the model works in the
        // layer's own pixels, and skipping the rebase looks at the wrong part
        // of the picture entirely.
        const scaleX = bitmap.width / (node.width || bitmap.width);
        const scaleY = bitmap.height / (node.height || bitmap.height);
        const local = points.map(([x, y]) => ({
          x: (x - node.x) * scaleX,
          y: (y - node.y) * scaleY,
        }));
        if (intent === "remove") {
          engine.setRegionHint("editor.remove.working");
          await runRemoveBrush(nodeId, bitmap, local, (size ?? 48) * scaleX);
          engine.setRegionHint(null);
          return;
        }
        engine.setRegionHint("editor.objectSelect.working");
        const { runLocalMatting, MATTE_REFINE_TOO_LARGE } =
          await import("../../editor/local_matting.js");
        if (!isCurrent()) return false;
      const { blob: matte, refinement } = await runLocalMatting(
          bitmap,
          { onProgress: setMaskProgress },
        );
        const { matteUnderObjectStroke } = await import("../../editor/object-stroke-mask.js");
        const touchedMatte = await matteUnderObjectStroke(matte, local);
        const { selectionFromMatte } =
          await import("../../editor/pixel_selection.js");
        const selection = await selectionFromMatte(touchedMatte, node);
        if (!selection) {
          // A whole model run that produces no selection is a failure the
          // user must see, not guidance that may fade in a breath.
          engine.setRegionHint("editor.objectSelect.nothing", "error");
          return;
        }
        const mode =
          pendingObjectStroke.mode ?? engine.getSelectionMode?.() ?? "replace";
        const baseSelection =
          pendingObjectStroke.baseSelection ??
          (mode === "replace" ? null : engine.getPixelSelection?.());
        if (mode !== "replace" && baseSelection) {
          if (!isCurrent()) return false;
      engine.combinePixelSelection(baseSelection, selection, mode);
        } else {
          if (!isCurrent()) return false;
      engine.setPixelSelection(selection);
        }
        const feather = engine.getSelectionFeather?.() ?? 0;
        if (feather > 0) {
          engine.featherPixelSelection?.(feather);
        }
        engine.commit?.("editor.history.entry.objectSelection");
        engine.setRegionHint(null);
        reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      if (!isCurrent()) return false;
      // These run for seconds and can fail on model configuration rather than
      // on anything the user did, so the reason goes to the status pill — a
      // line in a panel they may not even have open is not a failure report.
      console.error("object stroke failed", err);
      engine.setRegionHint(
        intent === "remove"
          ? "editor.remove.failed"
          : "editor.objectSelect.failed",
        "error",
      );
      setMaskError(repaintFailureCode(err));
    } finally {
      setMaskProgress(null);
      setLassoBusy(false);
    }
  };
  return { runRemoveBrush, runObjectStroke };
}
