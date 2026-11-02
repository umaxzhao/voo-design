/**
 * Moving pixel selections and pixels: preview drag and commit move.
 */

import { NODE_KIND, findNode, nodeRect } from "./scene_model.js";
import { BAKED_BITMAP_DEFORMATION_PATCH } from "./editor_deformation_patch.js";
import { contourBounds } from "./mask_contour.js";
import { clampContoursToRect } from "./pixel_selection.js";
import { drawImageNode } from "./scene_renderer.js";

export function createSelectionApiMove({
  getDoc,
  getPixelSelection,
  setPixelSelection,
  cache,
  maskTools,
  syncAnts,
  requestRender,
  notify,
  trackTransform,
  replaceNodeBitmap,
  commitMovePixels,
}) {
  return {
    /**
     * Drag preview for a selection move: re-places the ants at the total
     * displacement from the press-time snapshot (never accumulating), which
     * is what keeps the outline glued to the pixels being moved.
     */
    movePixelSelectionPreview(dx, dy, base) {
      if (!base?.contours?.length) return false;
      if (dx === 0 && dy === 0) return true;
      const contours = base.contours.map((ring) =>
        ring.map(([x, y]) => [x + dx, y + dy]),
      );
      const next = {
        ...base,
        contours,
        bounds: contourBounds(contours),
      };
      // Preview only — the ants may travel outside the image while dragging.
      // clampPixelSelection runs when the move is committed, not here.
      setPixelSelection(next);
      syncAnts();
      requestRender();
      notify();
      return true;
    },
    /**
     * Moves the selected pixels themselves (Photoshop's Move tool with an
     * active selection): the selection's pixels are lifted out of the layer,
     * the void left behind, and the pixels are stamped back at the offset —
     * one undo step, like a feathered delete. The outline travels with them.
     *
     * The drag preview already relocated the ants by (dx, dy), so the current
     * selection is where the pixels should end up; the source region is that
     * same shape shifted back by the delta.
     */
    async movePixelSelection(dx, dy, base = null) {
      return trackTransform(
        (async () => {
          const current = getPixelSelection();
          if (!current?.nodeId || !current.contours?.length) return false;
          const node = findNode(getDoc(), current.nodeId);
          if (!node || node.kind !== NODE_KIND.IMAGE) return false;
          const source = base?.nodeId === current.nodeId ? base : current;
          const movedContours = source.contours.map((ring) =>
            ring.map(([x, y]) => [x + dx, y + dy]),
          );
          const clampedContours = clampContoursToRect(
            movedContours,
            nodeRect(node),
          );
          const actualBounds = contourBounds(clampedContours);
          const sourceBounds = source.bounds ?? contourBounds(source.contours);
          const actualDx = actualBounds.x - sourceBounds.x;
          const actualDy = actualBounds.y - sourceBounds.y;
          const bitmap = cache.get(node);
          if (!bitmap) return false;
          const width = bitmap.naturalWidth ?? bitmap.width;
          const height = bitmap.naturalHeight ?? bitmap.height;
          if (!(width > 0) || !(height > 0)) return false;
          const scaleX = width / (node.width || width);
          const scaleY = height / (node.height || height);
          const deltaX = Math.round(actualDx * scaleX);
          const deltaY = Math.round(actualDy * scaleY);
          if (deltaX === 0 && deltaY === 0) return false;
          const sourceContours = source.contours;
          setPixelSelection({
            ...current,
            contours: clampedContours,
            bounds: actualBounds,
          });

          // 1. Snapshot the layer and lift the selection's pixels into a mask.
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          const hasDeform =
            (node.warpMesh && Array.isArray(node.warpMesh.points)) ||
            (node.perspectiveCorners && node.perspectiveCorners.length === 4) ||
            (node.perspectiveQuad && node.perspectiveQuad.length === 4);

          if (hasDeform) {
            ctx.save();
            ctx.scale(scaleX, scaleY);
            ctx.translate(-node.x, -node.y);
            drawImageNode(
              ctx,
              node,
              bitmap,
              maskTools.maskSourceOf(node),
              null,
              true,
            );
            ctx.restore();
          } else {
            ctx.drawImage(bitmap, 0, 0);
          }

          // Selected pixels only: destination-in keeps them, everything else drops.
          const selected = document.createElement("canvas");
          selected.width = width;
          selected.height = height;
          const sCtx = selected.getContext("2d");
          if (hasDeform) {
            sCtx.save();
            sCtx.scale(scaleX, scaleY);
            sCtx.translate(-node.x, -node.y);
            drawImageNode(
              sCtx,
              node,
              bitmap,
              maskTools.maskSourceOf(node),
              null,
              true,
            );
            sCtx.restore();
          } else {
            sCtx.drawImage(bitmap, 0, 0);
          }
          sCtx.globalCompositeOperation = "destination-in";
          sCtx.beginPath();
          for (const ring of sourceContours) {
            ring.forEach(([x, y], index) => {
              const pixelX = (x - node.x) * scaleX;
              const pixelY = (y - node.y) * scaleY;
              if (index === 0) sCtx.moveTo(pixelX, pixelY);
              else sCtx.lineTo(pixelX, pixelY);
            });
            sCtx.closePath();
          }
          sCtx.fill();

          // 2. Erase the selection's old footprint from the snapshot.
          ctx.globalCompositeOperation = "destination-out";
          ctx.beginPath();
          for (const ring of sourceContours) {
            ring.forEach(([x, y], index) => {
              const pixelX = (x - node.x) * scaleX;
              const pixelY = (y - node.y) * scaleY;
              if (index === 0) ctx.moveTo(pixelX, pixelY);
              else ctx.lineTo(pixelX, pixelY);
            });
            ctx.closePath();
          }
          ctx.fill();

          // 3. Stamp the lifted pixels back at the offset (the ants already sit
          // where they land, so no contour change is needed here).
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(selected, deltaX, deltaY);

          const replaced = await commitMovePixels(() =>
            replaceNodeBitmap(current.nodeId, canvas.toDataURL("image/png"), {
              patch: hasDeform ? BAKED_BITMAP_DEFORMATION_PATCH : null,
            }),
          );
          if (replaced) {
            syncAnts();
            requestRender();
            notify();
          }
          return replaced;
        })(),
      );
    },
  };
}
