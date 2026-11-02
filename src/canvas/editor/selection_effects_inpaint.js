/**
 * Inpainting and generative AI repaint effects for active pixel selections.
 *
 * Contract for both entry points: they answer with a bare `true` / `false`.
 * Every refusal looks identical to the caller — a missing target layer, a
 * non-image layer, a locked layer, an unloaded bitmap, a provider that painted
 * nothing, a result that will not decode — which is why the agent-facing
 * commands re-check the causes they can name from public engine state before
 * calling in: see `assertRepaintableTarget` in command_table/helpers.js.
 * Adding a refusal here that a caller could act on means naming it there too,
 * or the model is told "BITMAP_MISSING" and retries the same call.
 */

import { findNode, NODE_KIND } from "./scene_model.js";
import {
  blurMask,
  contoursToMask,
  selectionCropRect,
} from "./pixel_selection.js";
import { decodeImageSource } from "./bitmap_cache.js";
import { PROVIDER_ID } from "../../shared/providers.js";
import {
  getPerformanceTier,
  localRequestBudget,
} from "../../shared/model-routes.js";
import { PERFORMANCE_TIER } from "../../shared/performance-tier.js";

/**
 * The long-edge cap the crop travelling to the local engine must respect, or
 * `null` when this request is not going there.
 *
 * A missing `providerId` is the chain case: the editor's chain starts at the
 * local route, so the crop it hands over is the one that has to fit the budget.
 * An explicit cloud pick is left at its own size — the cloud has no such cap,
 * and shrinking the crop there would only cost detail. The numbers come from
 * the shared tier policy; A is defined as today's behaviour, while the middle
 * tier, an unmeasurable machine and a low-tier user who pinned local all run
 * through the middle tier's caps (§2.2 step 7, §3.2).
 *
 * @param {string} [providerId]
 * @returns {number|null}
 */
export function localCropMaxEdge(providerId) {
  if (providerId && providerId !== PROVIDER_ID.LOCAL) return null;
  const { tier } = getPerformanceTier();
  if (tier === PERFORMANCE_TIER.HIGH) return null;
  return localRequestBudget(PERFORMANCE_TIER.MID)?.maxEdgePx ?? null;
}

/**
 * The size a crop is downsampled to before it is sent, or `null` when it
 * already fits the cap.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} maxEdgePx
 * @returns {{ width: number, height: number }|null}
 */
export function localCropBudgetSize(width, height, maxEdgePx) {
  if (!(maxEdgePx > 0) || !(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (!(longest > maxEdgePx)) return null;
  const scale = maxEdgePx / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function createSelectionInpaintEffects({
  getDoc,
  cache,
  getPixelSelection,
  setPixelSelection,
  replaceNodeBitmap,
  syncAnts,
  requestRender,
  notify,
}) {
  /**
   * Content-aware fill for the pixel selection (Photoshop's Edit → Fill →
   * Content-Aware, local edition): the selected pixels are regenerated from
   * the surrounding content by the on-device Telea inpainter — no model, no
   * network, no provider key. The result lands as a normal bitmap replace,
   * so undo covers it.
   */
  async function fillPixelSelection() {
    const doc = getDoc();
    const current = getPixelSelection();
    if (!current?.nodeId || !current.contours?.length) return false;
    const node = findNode(doc, current.nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    // A fully locked or pixel-locked layer refuses to change its bitmap.
    if (node.locked || node.lockImagePixels) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;

    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) return false;
    sourceCtx.drawImage(bitmap, 0, 0);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return false;
    // Transparent background — the inpainter reads the mask's alpha, and an
    // opaque black fill would mark the whole layer as "to fill" (a no-op).
    maskCtx.clearRect(0, 0, width, height);
    const scaleX = width / (node.width || width);
    const scaleY = height / (node.height || height);
    const alphaMap =
      (current.feather ?? 0) > 0
        ? blurMask(
            contoursToMask(current.contours, node, width, height),
            width,
            height,
            current.feather,
          )
        : null;
    if (alphaMap) {
      const image = maskCtx.createImageData(width, height);
      for (let i = 0; i < alphaMap.length; i += 1) {
        const val = Math.round(alphaMap[i] * 255);
        image.data[i * 4] = 255;
        image.data[i * 4 + 1] = 255;
        image.data[i * 4 + 2] = 255;
        image.data[i * 4 + 3] = val;
      }
      maskCtx.putImageData(image, 0, 0);
    } else {
      maskCtx.fillStyle = "#fff";
      maskCtx.beginPath();
      for (const ring of current.contours) {
        ring.forEach(([x, y], index) => {
          const pixelX = (x - node.x) * scaleX;
          const pixelY = (y - node.y) * scaleY;
          if (index === 0) maskCtx.moveTo(pixelX, pixelY);
          else maskCtx.lineTo(pixelX, pixelY);
        });
        maskCtx.closePath();
      }
      maskCtx.fill();
    }

    const { inpaintLocalImage } = await import("./local_inpaint.js");
    const dataUrl = inpaintLocalImage(sourceCanvas, maskCanvas, 8);
    if (!dataUrl) return false;
    const replaced = await replaceNodeBitmap(node.id, dataUrl);
    if (replaced) {
      setPixelSelection(null);
      syncAnts();
      requestRender();
      notify();
    }
    return replaced;
  }

  /**
   * AI repaint of the pixel selection: the selection's bounding box is
   * cropped, the result is composited back onto the layer, clipped to the
   * selection's own outline so nothing outside the selection changes.
   *
   * The caller may inject how the pixels are painted:
   *   paint: async ({ dataUrl, maskDataUrl, width, height, prompt }) => paintedDataUrl | null
   * The engine keeps the editor-only work here (crop, mask, composite).
   * When `paint` is omitted the engine keeps its legacy behavior: it calls
   * the configured image API through repaintLayer, so direct callers such as
   * editor_command_bridge still work unchanged.
   */
  async function aiRepaintPixelSelection({
    prompt,
    providerId,
    modelId,
    paint,
  }) {
    const instruction = prompt?.trim();
    if (!instruction) return false;
    const doc = getDoc();
    const current = getPixelSelection();
    if (!current?.nodeId || !current.contours?.length) return false;
    const node = findNode(doc, current.nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    // A fully locked or pixel-locked layer refuses to change its bitmap.
    if (node.locked || node.lockImagePixels) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;
    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    if (!(width > 0) || !(height > 0)) return false;
    const crop = selectionCropRect(node, current, width, height, 8);
    if (!crop) return false;
    // `selectionCropRect` answers in its own names — {x, y, width, height} —
    // while this block (and the mask, budget and write-back below) speaks in
    // bitmap-pixel sx/sy/sw/sh. Renaming on the way in is what keeps those two
    // vocabularies apart; reading the field names directly made all four
    // undefined, i.e. a 0×0 crop and a silent no-op (F-T16).
    const { x: sx, y: sy, width: sw, height: sh } = crop;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return false;
    cropCtx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    // Build the exact selection mask before inference. The legacy repaintLayer
    // path sends this crop mask to the provider; in every path the same
    // full-resolution mask clips the returned pixels below, so nothing outside
    // the selection outline can leak into the final composite.
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return false;
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.fillStyle = "#fff";
    const scaleX = width / (node.width || width);
    const scaleY = height / (node.height || height);
    maskCtx.beginPath();
    for (const ring of current.contours) {
      ring.forEach(([x, y], index) => {
        const px = (x - node.x) * scaleX;
        const py = (y - node.y) * scaleY;
        if (index === 0) maskCtx.moveTo(px, py);
        else maskCtx.lineTo(px, py);
      });
      maskCtx.closePath();
    }
    maskCtx.fill();

    const cropMaskCanvas = document.createElement("canvas");
    cropMaskCanvas.width = sw;
    cropMaskCanvas.height = sh;
    const cropMaskCtx = cropMaskCanvas.getContext("2d");
    if (!cropMaskCtx) return false;
    cropMaskCtx.drawImage(maskCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const cropDataUrl = cropCanvas.toDataURL("image/png");
    const cropMaskDataUrl = cropMaskCanvas.toDataURL("image/png");

    // The middle tier's local budget caps what travels to the engine (§3.2).
    // The crop and its mask are downsampled together so they stay aligned, and
    // only the request is affected: the composite below still writes the answer
    // back at this crop's own rect (`sx, sy, sw, sh`), so the document region,
    // its size and every pixel outside the model's answer are unchanged.
    const maxEdgePx = localCropMaxEdge(providerId);
    const budgeted = localCropBudgetSize(sw, sh, maxEdgePx);
    let submitted = {
      dataUrl: cropDataUrl,
      maskDataUrl: cropMaskDataUrl,
      width: sw,
      height: sh,
    };
    if (budgeted) {
      // Reuses the editor's one downsampler rather than a second copy of it.
      const { downscaleDataUrl } = await import(
        "./command_table/helpers.js"
      );
      submitted = {
        dataUrl: await downscaleDataUrl(cropDataUrl, maxEdgePx),
        maskDataUrl: await downscaleDataUrl(cropMaskDataUrl, maxEdgePx),
        width: budgeted.width,
        height: budgeted.height,
      };
    }

    let painted;
    if (paint) {
      // UI callbacks must receive the same aligned crop contract as direct API calls.
      painted = await paint({ ...submitted, prompt: instruction });
    } else {
      const { repaintLayer } = await import("./layer_repaint.js");
      painted = await repaintLayer({
        dataUrl: submitted.dataUrl,
        maskDataUrl: submitted.maskDataUrl,
        width: submitted.width,
        height: submitted.height,
        prompt: instruction,
        providerId,
        modelId,
      });
    }
    if (!painted) return false;
    const repainted = await decodeImageSource(painted);
    if (!repainted) return false;

    // Selection mask at bitmap resolution: white inside the outline. The
    // background is transparent — the repaint composites with
    // destination-in, which keys on the mask's alpha, so an opaque black
    // fill would keep the whole crop box instead of just the selection.
    // Repaint layer clipped to the selection, composited over the original.
    const repaintLayerCanvas = document.createElement("canvas");
    repaintLayerCanvas.width = width;
    repaintLayerCanvas.height = height;
    const repaintCtx = repaintLayerCanvas.getContext("2d");
    repaintCtx.drawImage(repainted, sx, sy, sw, sh);
    repaintCtx.globalCompositeOperation = "destination-in";
    repaintCtx.drawImage(maskCanvas, 0, 0);

    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext("2d");
    resultCtx.drawImage(bitmap, 0, 0);
    resultCtx.drawImage(repaintLayerCanvas, 0, 0);

    const replaced = await replaceNodeBitmap(
      node.id,
      resultCanvas.toDataURL("image/png"),
    );
    if (replaced) {
      setPixelSelection(null);
      syncAnts();
      requestRender();
      notify();
    }
    return replaced;
  }

  return {
    fillPixelSelection,
    aiRepaintPixelSelection,
  };
}
