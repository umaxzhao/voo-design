import { dataUrlToBlob } from "../../store/db.js";
import { regionHost } from "../../editor/doc_ops_regions.js";
import { repaintFailureCode } from "./raster-action-helpers.js";

async function matteFor(imageDataUrl, onProgress, isCurrent) {
  try {
    const { isLocalMattingSupported, runLocalMatting } =
      await import("../../editor/local_matting.js");
    if (isLocalMattingSupported()) {
      const blob = dataUrlToBlob(imageDataUrl);
      const bitmap = await createImageBitmap(blob);
      try {
        if (!isCurrent()) throw new Error("stopped");
        return await runLocalMatting(bitmap, { onProgress });
      } finally {
        bitmap.close?.();
      }
    }
  } catch (err) {
    if (!isCurrent()) throw err;
    console.warn("Local matting failed:", err);
  }
  throw new Error("matting:localUnsupported");
}

export function reportRefinementSkipped(engine, refinement, tooLargeCode) {
  if (refinement?.reason !== tooLargeCode) return;
  engine?.setRegionHint?.("editor.matting.refineSkipped");
}

/** Optional raster action implementation, loaded only from an explicit action. */
export function createMattingActions(context) {
  const { engine, selected, lasso, maskBusy, lassoBusy, ensureMattingModel, setMaskBusy, setMaskError, setMaskProgress, setLassoBusy, isCurrent } = context;
const removeBackground = async (modelReady = false) => {
    if (!isCurrent()) return false;
    if (!engine || maskBusy) return false;
    if (!selected) {
      // Auto Mask is a one-click tool: without a layer to cut out it has
      // nothing to act on, so say so instead of swallowing the click.
      engine.setRegionHint?.("editor.region.needImage");
      return false;
    }
    if (
      !modelReady &&
      !(await ensureMattingModel(() => removeBackground(true)))
    )
      return false;
    setMaskBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    try {
      const { MATTE_REFINE_TOO_LARGE } =
        await import("../../editor/local_matting.js");
      let image = engine.exportNodePng(selected.id);
      if (!image && selected.dataUrl) image = selected.dataUrl;
      if (!image && selected.src) image = selected.src;
      if (!image) throw new Error("bitmapMissing");

      if (!isCurrent()) return false;
      const { blob, refinement } = await matteFor(image, setMaskProgress, isCurrent);
      if (!isCurrent()) return false;
      const applied = await engine.applyMask(selected.id, blob);
      if (!applied) throw new Error("maskDiscarded");
      reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      return true;
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("removeBackground error:", err);
      setMaskError(repaintFailureCode(err));
      return false;
    } finally {
      setMaskProgress(null);
      setMaskBusy(false);
    }
  };

const selectSubject = async (node, modelReady = false) => {
    if (!isCurrent()) return false;
    if (!engine) return;
    const targetNode =
      node?.kind === "image"
        ? node
        : engine.getSelected()?.kind === "image"
          ? engine.getSelected()
          : engine.getDocument()?.nodes?.find((n) => n.kind === "image");
    if (!targetNode) {
      engine.setRegionHint?.("editor.region.needImage");
      return;
    }
    if (
      !modelReady &&
      !(await ensureMattingModel(() => selectSubject(targetNode, true)))
    )
      return;
    setLassoBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    engine.setRegionHint?.("editor.objectSelect.working");
    try {
      const source =
        engine.exportNodePng(targetNode.id) ??
        targetNode.dataUrl ??
        targetNode.src;
      if (!source) throw new Error("bitmapMissing");
      const bitmap = await createImageBitmap(dataUrlToBlob(source));
      try {
        const { runLocalMatting, MATTE_REFINE_TOO_LARGE } =
          await import("../../editor/local_matting.js");
        if (!isCurrent()) return false;
      const { blob: matte, refinement } = await runLocalMatting(bitmap, {
          onProgress: setMaskProgress,
        });
        const { selectionFromMatte } =
          await import("../../editor/pixel_selection.js");
        const selection = await selectionFromMatte(matte, targetNode);
        if (!selection) {
          engine.setRegionHint?.("editor.objectSelect.nothing");
          return;
        }
        if (!isCurrent()) return false;
      engine.setPixelSelection(selection);
        engine.setRegionHint?.(null);
        reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("select subject failed", err);
      engine.setRegionHint?.("editor.objectSelect.failed");
      setMaskError(repaintFailureCode(err));
    } finally {
      setMaskProgress(null);
      setLassoBusy(false);
    }
  };

const runSelectionCutout = async (
    node,
    toLayerSelection,
    onDone,
    modelReady = false,
  ) => {
    if (!isCurrent()) return false;
    if (!engine || !node || lassoBusy) return;
    if (!modelReady) {
      const resume = () =>
        runSelectionCutout(node, toLayerSelection, onDone, true);
      if (!(await ensureMattingModel(resume))) return;
    }
    setLassoBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    try {
      const source = engine.exportNodePng(node.id) ?? node.dataUrl ?? node.src;
      if (!source) throw new Error("bitmapMissing");
      const bitmap = await createImageBitmap(dataUrlToBlob(source));
      try {
        const scaleX = bitmap.width / node.width;
        const scaleY = bitmap.height / node.height;
        const selection = toLayerSelection({ node, scaleX, scaleY });

        const { runRegionMatting, MATTE_REFINE_TOO_LARGE } =
          await import("../../editor/local_matting.js");
        if (!isCurrent()) return false;
      const { blob: matte, refinement } = await runRegionMatting(
          bitmap,
          selection,
          { onProgress: setMaskProgress },
        );
        onDone?.();
        if (!isCurrent()) return false;
      const applied = await engine.applyMask(node.id, matte);
        if (!applied) throw new Error("maskDiscarded");
        reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("selection cutout failed", err);
      setMaskError(repaintFailureCode(err));
    } finally {
      setMaskProgress(null);
      setLassoBusy(false);
    }
  };

const runLassoCutout = async () => {
    if (!isCurrent()) return false;
    if (!lasso?.pending) return;
    const node = engine
      ?.getDocument()
      ?.nodes.find((n) => n.id === lasso.nodeId);
    await runSelectionCutout(
      node,
      ({ scaleX, scaleY }) => ({
        points: lasso.points.map(([x, y]) => ({
          x: (x - node.x) * scaleX,
          y: (y - node.y) * scaleY,
        })),
      }),
      () => engine?.cancelLasso(),
    );
  };

const runRegionCutout = async (region) => {
    if (!isCurrent()) return false;
    const doc = engine?.getDocument();
    if (!doc || !region) return;
    // A region names its host image outright — no reverse lookup needed —
    // and its box is already in that image's pixels.
    const host = regionHost(doc, region);
    if (!host) {
      engine?.setRegionHint?.("editor.region.needImage");
      return;
    }
    await runSelectionCutout(host, ({ scaleX, scaleY }) => {
      if (Array.isArray(region.points) && region.points.length > 0) {
        return {
          points: region.points.map((point) => ({
            x: point.x * scaleX,
            y: point.y * scaleY,
          })),
        };
      }
      return {
        x: region.x * scaleX,
        y: region.y * scaleY,
        width: region.width * scaleX,
        height: region.height * scaleY,
      };
    });
  };
  return { removeBackground, selectSubject, runSelectionCutout, runLassoCutout, runRegionCutout };
}
