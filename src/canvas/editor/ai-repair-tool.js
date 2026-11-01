import { findNode, NODE_KIND } from "./scene_model.js";
import { clipMaskToSelection } from "./pixel_selection.js";
import { toNodeLocal } from "./scene_geometry.js";

/** One cancellable AI edit, with source identity retained through download and inference. */
export function createAiRepairTool({
  getDoc, cache, getPixelSelection, getAiRepairDownload,
  setAiRepairDownload, replaceNodeBitmap, isDisposed, notify,
}) {
  let activeController = null;
  const begin = () => {
    activeController?.abort();
    activeController = new AbortController();
    return activeController;
  };

  async function inpaintAiRepairStroke(nodeId, docPoints, diameter = 24) {
    const node = findNode(getDoc(), nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE || node.locked || node.lockImagePixels) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;
    const controller = begin();
    const { signal } = controller;
    const abort = controller.abort.bind(controller);
    const pending = { nodeId, points: docPoints, diameter, sourceImageId: node.imageId, abort, progress: 0 };
    const ownsState = () => getAiRepairDownload()?.abort === abort;
    const current = () => !signal.aborted && !isDisposed?.() && findNode(getDoc(), nodeId) === node && ownsState();
    setAiRepairDownload({ ...pending, phase: "running" });
    notify();
    // Closing an editor or replacing its source must also stop expensive worker work.
    const watcher = setInterval(() => { if (!current()) controller.abort(); }, 50);
    try {
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
      if (!current()) return false;
      if (clipMaskToSelection(getPixelSelection(), maskContext, node, scaleX, scaleY)) {
        const { anyMaskedPixel } = await import("./local_inpaint.js");
        if (!anyMaskedPixel(maskContext.getImageData(0, 0, width, height).data)) return false;
      }
      pending.model = await localAiRepair.prepareAiRepairModel();
      if (!(await localAiRepair.isAiRepairModelCached(pending.model))) {
        if (current()) {
          setAiRepairDownload({ ...pending, phase: "required" });
          notify();
        }
        return false;
      }
      signal.throwIfAborted();
      const repaired = await localAiRepair.inpaintWithLocalAi(sourceCanvas, maskCanvas, { signal });
      if (!repaired || !current()) return false;
      return await replaceNodeBitmap(nodeId, repaired, { shouldApply: current });
    } catch (error) {
      if (error.name === "AbortError" || signal.aborted) return false;
      console.warn("AI Repair inference failed", error);
      if (ownsState() && !isDisposed?.()) {
        setAiRepairDownload({ ...pending, phase: "runFailed" });
        notify();
      }
      return false;
    } finally {
      clearInterval(watcher);
      if (ownsState() && getAiRepairDownload()?.phase === "running") {
        setAiRepairDownload(null);
        notify();
      }
      if (activeController === controller) activeController = null;
    }
  }

  async function downloadAiRepairModel() {
    const pending = getAiRepairDownload();
    if (!pending || !["required", "failed", "runFailed"].includes(pending.phase)) return false;
    const node = findNode(getDoc(), pending.nodeId);
    if (!node || node.imageId !== pending.sourceImageId) {
      setAiRepairDownload(null);
      notify();
      return false;
    }
    const controller = begin();
    const { signal } = controller;
    const abort = controller.abort.bind(controller);
    const current = () => !signal.aborted && !isDisposed?.() && findNode(getDoc(), node.id) === node && getAiRepairDownload()?.abort === abort;
    setAiRepairDownload({ ...pending, abort, phase: "downloading", progress: 0 });
    notify();
    const watcher = setInterval(() => { if (!current()) controller.abort(); }, 50);
    try {
      const localAiRepair = await import("./local_ai_repair.js");
      if (pending.phase === "runFailed") await localAiRepair.deleteAiRepairModel(pending.model);
      signal.throwIfAborted();
      // A failed GPU session can select INT8 on retry; download that model,
      // not the failed model retained only for cache cleanup.
      const model = await localAiRepair.prepareAiRepairModel();
      await localAiRepair.downloadAiRepairModel({ model, signal, onProgress: progress => {
        if (!current() || progress.phase !== "downloading" || !progress.total) return;
        setAiRepairDownload({ ...pending, abort, phase: "downloading",
          progress: Math.round(progress.loaded / progress.total * 100) });
        notify();
      } });
      if (!current()) return false;
      clearInterval(watcher);
      return await inpaintAiRepairStroke(pending.nodeId, pending.points, pending.diameter);
    } catch (error) {
      if (error.name === "AbortError" || signal.aborted) return false;
      console.warn("AI Repair model download failed", error);
      if (getAiRepairDownload()?.abort === abort && !isDisposed?.()) {
        setAiRepairDownload({ ...pending, abort, phase: "failed", progress: 0 });
        notify();
      }
      return false;
    } finally {
      clearInterval(watcher);
      if (activeController === controller) activeController = null;
      if (signal.aborted && getAiRepairDownload()?.abort === abort) {
        setAiRepairDownload(null);
        notify();
      }
    }
  }

  return { inpaintAiRepairStroke, downloadAiRepairModel };
}
