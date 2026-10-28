import { useCallback } from "react";
import { readImageRgba } from "../bitmap_pixels.js";
import {
  ENHANCE_SAMPLE_EDGE,
  mergeEnhanceAdjustments,
  planOneTapEnhance,
} from "../../editor/auto_enhance_apply.js";

/** Resolve each image action against its page rather than the focused sibling. */
export function useEditorImageActions({
  engine,
  enginesRef,
  snapshotsRef,
  retouchImage,
  setImageActionError,
}) {
  /**
   * The page's own engine and the image a taskbar action should act on — the
   * same resolution the adjustment and preset handlers use, so a click on a
   * background page is not routed to the focused one.
   */
  const imageTargetFor = useCallback(
    (nodeId) => {
      const pageEngine = enginesRef.current.get(nodeId)?.engine || engine;
      const pageDoc =
        pageEngine?.getDocument?.() || snapshotsRef.current.get(nodeId)?.doc;
      return {
        pageEngine,
        target:
          pageEngine?.getSelected?.() ||
          pageDoc?.nodes?.find((n) => n.kind === "image") ||
          null,
      };
    },
    [engine, enginesRef, snapshotsRef],
  );

  /**
   * One-tap auto enhance: measure the layer's own pixels, plan the correction,
   * and write the plan into the node's adjustments as one undoable edit.
   *
   * The measurement comes from a downscaled copy — statistics do not need
   * resolution, and a click must not walk a full-size layer — while the edit
   * itself stays in adjustment rows, so the picture is never re-encoded.
   */
  const runAutoEnhance = useCallback(
    (nodeId) => {
      const { pageEngine, target } = imageTargetFor(nodeId);
      if (!pageEngine) return;
      if (!target || target.kind !== "image") {
        setImageActionError("editor.imageAction.noImage");
        return;
      }
      try {
        const bitmap = pageEngine.getNodeBitmap?.(target) ?? null;
        if (!bitmap) throw new Error("bitmapMissing");
        const { rgba } = readImageRgba(bitmap, {
          maxEdge: ENHANCE_SAMPLE_EDGE,
        });
        const plan = planOneTapEnhance(rgba);
        // updateNode commits: it goes through commitOrPreviewEditorDocument, so
        // this single call is the whole history entry (there is no separate
        // engine commit step to call).
        pageEngine.updateNode(target.id, {
          adjustments: mergeEnhanceAdjustments(target.adjustments, plan),
        });
      } catch (error) {
        console.error("auto enhance failed", error);
        setImageActionError("editor.enhance.failed");
      }
    },
    [imageTargetFor, setImageActionError],
  );

  /**
   * Portrait retouch of the selected layer. The runner owns the focused page's
   * engine, so a background page is refused here rather than retouched through
   * the wrong one — the same limit the upscale button already has.
   */
  const runPortraitRetouch = useCallback(
    (nodeId, strengths) => {
      const { pageEngine } = imageTargetFor(nodeId);
      if (!pageEngine || pageEngine !== engine) return;
      void retouchImage(strengths);
    },
    [engine, imageTargetFor, retouchImage],
  );

  return { runAutoEnhance, runPortraitRetouch };
}
