/**
 * Local repair/stamp tools: Spot Healing (Telea), AI Repair (local LaMa),
 * the Patch Tool, and the Clone Stamp.
 *
 * Every stroke rasterizes a mask from the pointer path, clips it to the
 * active pixel selection (a hard boundary for every pixel tool here), then
 * hands source+mask to the matching pure algorithm in local_inpaint.js /
 * local_ai_repair.js. Every tool commits its result as an ordinary local bitmap edit.
 */
import { findNode, NODE_KIND } from "./scene_model.js";
import { clipMaskToSelection } from "./pixel_selection.js";
import { createRepairHealingTools } from "./repair_tools_healing.js";
import { toNodeLocal } from "./scene_geometry.js";

export { createRepairHealingTools };

export function createRepairTools({
  getDoc,
  cache,
  getPixelSelection,
  getAiRepairDownload,
  setAiRepairDownload,
  setBitmapPreview,
  replaceNodeBitmap,
  isDisposed,
  requestRender,
  notify,
}) {
  /**
   * Pure local Fast Marching / Telea Inpainting (Spot Healing Brush).
   * Repairs blemish area instantly on the layer bitmap in 10-30ms with zero AI/network dependency.
   */
  async function inpaintLocalStroke(
    nodeId,
    docPoints,
    diameter = 24,
    options = {},
  ) {
    const doc = getDoc();
    const node = findNode(doc, nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;

    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    if (!bWidth || !bHeight) return false;

    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    // Create source image canvas
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = bWidth;
    srcCanvas.height = bHeight;
    const srcCtx = srcCanvas.getContext("2d");
    srcCtx.drawImage(bitmap, 0, 0);

    // Create mask canvas
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = bWidth;
    maskCanvas.height = bHeight;
    const maskCtx = maskCanvas.getContext("2d");
    maskCtx.lineWidth = Math.max(2, diameter * scaleX);
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.strokeStyle = "#ffffff";
    maskCtx.fillStyle = "#ffffff";

    const localPoints = docPoints.map((pt) => {
      const local = toNodeLocal(node, pt);
      return {
        x: (local.x / (node.width || bWidth)) * bWidth,
        y: (local.y / (node.height || bHeight)) * bHeight,
      };
    });

    if (localPoints.length === 1) {
      maskCtx.beginPath();
      maskCtx.arc(
        localPoints[0].x,
        localPoints[0].y,
        Math.max(1, (diameter * scaleX) / 2),
        0,
        Math.PI * 2,
      );
      maskCtx.fill();
    } else if (options.patch && localPoints.length > 2) {
      // Patch Tool: fill closed lasso area + expand boundary slightly
      maskCtx.beginPath();
      localPoints.forEach((pt, idx) => {
        if (idx === 0) maskCtx.moveTo(pt.x, pt.y);
        else maskCtx.lineTo(pt.x, pt.y);
      });
      maskCtx.closePath();
      maskCtx.fill();
      maskCtx.stroke();
    } else {
      maskCtx.beginPath();
      localPoints.forEach((pt, idx) => {
        if (idx === 0) maskCtx.moveTo(pt.x, pt.y);
        else maskCtx.lineTo(pt.x, pt.y);
      });
      maskCtx.stroke();
    }

    // A selection is a boundary for every pixel tool, not just the patch.
    const clipped = clipMaskToSelection(
      getPixelSelection(),
      maskCtx,
      node,
      scaleX,
      scaleY,
    );

    const { inpaintLocalImage, anyMaskedPixel } =
      await import("./local_inpaint.js");
    // Cut away to nothing means the stroke fell outside the selection. Saying
    // so beats healing nothing and charging the user an undo step for it.
    if (clipped) {
      const marked = maskCtx.getImageData?.(0, 0, bWidth, bHeight)?.data;
      if (marked && !anyMaskedPixel(marked)) return false;
    }
    const healedDataUrl = inpaintLocalImage(
      srcCanvas,
      maskCanvas,
      Math.max(4, Math.round(diameter / 2)),
    );
    if (!healedDataUrl) return false;

    return await replaceNodeBitmap(nodeId, healedDataUrl);
  }

  /**
   * Local semantic inpainting for AI Repair. Unlike Spot's fast diffusion,
   * LaMa receives a bounded crop plus the painted mask and can reconstruct
   * texture and larger structures from surrounding context. It never sends
   * the artwork over the network after the optional one-time model download.
   */
  async function inpaintAiRepairStroke(nodeId, docPoints, diameter = 24) {
    const doc = getDoc();
    const node = findNode(doc, nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;

    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    if (!width || !height) return false;
    const scaleX = width / (node.width || width);
    const scaleY = height / (node.height || height);
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext("2d");
    if (!sourceContext || !maskContext) return false;
    sourceContext.drawImage(bitmap, 0, 0);
    maskContext.lineWidth = Math.max(2, diameter * Math.max(scaleX, scaleY));
    maskContext.lineCap = "round";
    maskContext.lineJoin = "round";
    maskContext.strokeStyle = "#ffffff";
    maskContext.fillStyle = "#ffffff";
    const points = docPoints.map((point) => {
      const local = toNodeLocal(node, point);
      return {
        x: (local.x / (node.width || width)) * width,
        y: (local.y / (node.height || height)) * height,
      };
    });
    maskContext.beginPath();
    if (points.length === 1) {
      maskContext.arc(
        points[0].x,
        points[0].y,
        maskContext.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      maskContext.fill();
    } else {
      points.forEach((point, index) => {
        if (index === 0) maskContext.moveTo(point.x, point.y);
        else maskContext.lineTo(point.x, point.y);
      });
      maskContext.stroke();
    }

    const localAiRepair = await import("./local_ai_repair.js");
    // Same boundary as the other repair tools.
    if (
      clipMaskToSelection(
        getPixelSelection(),
        maskContext,
        node,
        scaleX,
        scaleY,
      )
    ) {
      const { anyMaskedPixel } = await import("./local_inpaint.js");
      const marked = maskContext.getImageData?.(0, 0, width, height)?.data;
      if (marked && !anyMaskedPixel(marked)) return false;
    }
    if (!(await localAiRepair.isAiRepairModelCached())) {
      setAiRepairDownload({
        phase: "required",
        nodeId,
        points: docPoints,
        diameter,
        progress: 0,
      });
      notify();
      return false;
    }

    let repairedDataUrl = null;
    try {
      repairedDataUrl = await localAiRepair.inpaintWithLocalAi(
        sourceCanvas,
        maskCanvas,
      );
    } catch (error) {
      // Do not silently turn an AI Repair stroke into Spot. The two tools have
      // different promises, and a cached-but-unrunnable model needs a visible
      // recovery path rather than an invisible behavioural downgrade.
      console.warn("AI Repair inference failed", error);
      setAiRepairDownload({
        phase: "runFailed",
        nodeId,
        points: docPoints,
        diameter,
        progress: 0,
      });
      notify();
      return false;
    }
    if (!repairedDataUrl) return false;

    // Write back in place, like Spot. The generated-output sink is a no-op in the
    // design store, so routing the result there silently discarded the repair.
    return await replaceNodeBitmap(nodeId, repairedDataUrl);
  }

  /** Downloads AI Repair on explicit user confirmation, then resumes its stroke. */
  async function downloadAiRepairModel() {
    const pending = getAiRepairDownload();
    if (
      !pending ||
      !["required", "failed", "runFailed"].includes(pending.phase)
    )
      return false;
    setAiRepairDownload({ ...pending, phase: "downloading", progress: 0 });
    notify();
    try {
      const localAiRepair = await import("./local_ai_repair.js");
      if (pending.phase === "runFailed")
        await localAiRepair.deleteAiRepairModel();
      await localAiRepair.downloadAiRepairModel({
        onProgress: (progress) => {
          if (progress.phase !== "downloading" || !progress.total) return;
          setAiRepairDownload({
            ...pending,
            phase: "downloading",
            progress: Math.round((progress.loaded / progress.total) * 100),
          });
          notify();
        },
      });
      setAiRepairDownload({ ...pending, phase: "running", progress: 100 });
      notify();
      const completed = await inpaintAiRepairStroke(
        pending.nodeId,
        pending.points,
        pending.diameter,
      );
      if (completed) {
        setAiRepairDownload(null);
        notify();
      }
      return completed;
    } catch (error) {
      console.warn("AI Repair model download failed", error);
      setAiRepairDownload({ ...pending, phase: "failed", progress: 0 });
      notify();
      return false;
    }
  }

  const healing = createRepairHealingTools({
    getDoc,
    cache,
    getPixelSelection,
    replaceNodeBitmap,
    setBitmapPreview,
    isDisposed,
    requestRender,
    notify,
  });

  return {
    inpaintLocalStroke,
    inpaintAiRepairStroke,
    downloadAiRepairModel,
    patchBlendStroke: healing.patchBlendStroke,
    cloneStampStroke: healing.cloneStampStroke,
  };
}
