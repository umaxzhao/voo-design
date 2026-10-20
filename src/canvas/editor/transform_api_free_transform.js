/**
 * Marquee selection Free Transform API.
 *
 * Implements entering, adjusting, cancelling, and committing interactive
 * bounding-box free transforms on a raster marquee selection.
 */

import { clampContoursToRect } from "./pixel_selection.js";
import { contourBounds } from "./mask_contour.js";
import { NODE_KIND, findNode, nodeRect } from "./scene_model.js";
import { drawImageNode } from "./scene_renderer.js";

export function createSelectionTransformApi({
  getDoc,
  getPixelSelection,
  setPixelSelection,
  getSelectionTransform,
  setSelectionTransform,
  setRegionHint,
  cache,
  maskTools,
  syncAnts,
  requestRender,
  notify,
  cancelPolygonLasso,
  trackTransform,
  replaceNodeBitmap,
}) {
  /** Keeps a raster selection inside the bounds of the image it edits. */
  function clampPixelSelection(next) {
    if (!next?.nodeId || !next.contours?.length) return next ?? null;
    const node = findNode(getDoc(), next.nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return next;
    const contours = clampContoursToRect(next.contours, nodeRect(node));
    return {
      ...next,
      contours,
      bounds: contourBounds(contours),
    };
  }

  /** Enter "transform selection" mode around the current pixel selection. */
  function beginSelectionTransform() {
    const pixelSelection = getPixelSelection();
    if (!pixelSelection?.bounds || !pixelSelection?.nodeId) return false;
    const active = findNode(getDoc(), pixelSelection.nodeId);
    if (!active) return false;
    const bitmap = cache.get(active);
    if (!bitmap) return false;

    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    if (!(width > 0) || !(height > 0)) return false;

    const scaleX = width / (active.width || width);
    const scaleY = height / (active.height || height);

    // Extract the selected pixels into an isolated canvas snapshot
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sCtx = sourceCanvas.getContext("2d");

    const hasDeform =
      (active.warpMesh && Array.isArray(active.warpMesh.points)) ||
      (active.perspectiveCorners && active.perspectiveCorners.length === 4) ||
      (active.perspectiveQuad && active.perspectiveQuad.length === 4) ||
      active.adjustments;

    if (hasDeform) {
      sCtx.save();
      sCtx.scale(scaleX, scaleY);
      sCtx.translate(-active.x, -active.y);
      drawImageNode(
        sCtx,
        active,
        bitmap,
        maskTools.maskSourceOf(active),
        null,
        false,
      );
      sCtx.restore();
    } else {
      sCtx.drawImage(bitmap, 0, 0);
    }

    sCtx.globalCompositeOperation = "destination-in";
    sCtx.beginPath();
    for (const ring of pixelSelection.contours) {
      ring.forEach(([x, y], index) => {
        const pixelX = (x - active.x) * scaleX;
        const pixelY = (y - active.y) * scaleY;
        if (index === 0) sCtx.moveTo(pixelX, pixelY);
        else sCtx.lineTo(pixelX, pixelY);
      });
      sCtx.closePath();
    }
    sCtx.fill();

    // Clean up in-flight drafts / gestures so no dangling drafts exist concurrently
    maskTools.api.cancelLasso();
    cancelPolygonLasso();
    setRegionHint(null);

    const baseSelection = pixelSelection;
    setSelectionTransform({
      rect: { ...baseSelection.bounds },
      initialRect: { ...baseSelection.bounds },
      rotation: 0,
      nodeId: active.id,
      node: {
        x: active.x,
        y: active.y,
        width: active.width,
        height: active.height,
      },
      extractedCanvas: sourceCanvas,
      sourceContours: baseSelection.contours,
      basePixelSelection: baseSelection,
      scaleX,
      scaleY,
    });

    // Park pixel selection so it does not co-exist with the transform box
    setPixelSelection(null);
    syncAnts();

    requestRender();
    // The Apply/Cancel bar is React: entering the mode must repaint the
    // panels, not just the stage canvas.
    notify();
    return true;
  }

  function setTransformBox(patch) {
    const selectionTransform = getSelectionTransform();
    if (!selectionTransform) return;
    if (patch?.rect) {
      const next = { ...selectionTransform.rect, ...patch.rect };
      if (next.width > 0 && next.height > 0) {
        selectionTransform.rect = next;
      }
    }
    if (Number.isFinite(patch?.rotation)) {
      selectionTransform.rotation = patch.rotation;
    }
    requestRender();
    notify();
  }

  function cancelSelectionTransform() {
    const selectionTransform = getSelectionTransform();
    if (selectionTransform?.basePixelSelection) {
      setPixelSelection(selectionTransform.basePixelSelection);
    }
    setSelectionTransform(null);
    syncAnts();
    requestRender();
    notify();
  }

  /** Applies the dragged box to the pixel selection and commits modified bitmap (Photoshop's ✓). */
  async function applySelectionTransform() {
    const selectionTransform = getSelectionTransform();
    if (!selectionTransform) return false;
    return trackTransform(
      (async () => {
        const baseSelection =
          selectionTransform.basePixelSelection || getPixelSelection();
        const active = findNode(
          getDoc(),
          selectionTransform.nodeId || baseSelection?.nodeId,
        );
        if (!active) {
          setSelectionTransform(null);
          return false;
        }
        const bitmap = cache.get(active);
        if (!bitmap) {
          setSelectionTransform(null);
          return false;
        }

        const width = bitmap.naturalWidth ?? bitmap.width;
        const height = bitmap.naturalHeight ?? bitmap.height;
        if (!(width > 0) || !(height > 0)) {
          setSelectionTransform(null);
          return false;
        }

        const scaleX = width / (active.width || width);
        const scaleY = height / (active.height || height);
        const {
          rect,
          initialRect,
          rotation = 0,
          sourceContours,
        } = selectionTransform;

        // Calculate transformed piece bounds in document space
        const initialCx = initialRect.x + initialRect.width / 2;
        const initialCy = initialRect.y + initialRect.height / 2;
        const newCx = rect.x + rect.width / 2;
        const newCy = rect.y + rect.height / 2;
        const sX = rect.width / Math.max(initialRect.width, 1);
        const sY = rect.height / Math.max(initialRect.height, 1);
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        const corners = [
          { x: initialRect.x, y: initialRect.y },
          { x: initialRect.x + initialRect.width, y: initialRect.y },
          {
            x: initialRect.x + initialRect.width,
            y: initialRect.y + initialRect.height,
          },
          { x: initialRect.x, y: initialRect.y + initialRect.height },
        ];

        let pieceMinX = Infinity;
        let pieceMinY = Infinity;
        let pieceMaxX = -Infinity;
        let pieceMaxY = -Infinity;

        for (const c of corners) {
          const dx = (c.x - initialCx) * sX;
          const dy = (c.y - initialCy) * sY;
          const rotX = dx * cos - dy * sin;
          const rotY = dx * sin + dy * cos;
          const tx = newCx + rotX;
          const ty = newCy + rotY;
          if (tx < pieceMinX) pieceMinX = tx;
          if (ty < pieceMinY) pieceMinY = ty;
          if (tx > pieceMaxX) pieceMaxX = tx;
          if (ty > pieceMaxY) pieceMaxY = ty;
        }

        // Expanded document bounds enclosing both the original layer and the moved piece
        const newDocX = Math.min(active.x, pieceMinX);
        const newDocY = Math.min(active.y, pieceMinY);
        const newDocMaxX = Math.max(active.x + active.width, pieceMaxX);
        const newDocMaxY = Math.max(active.y + active.height, pieceMaxY);

        const newDocWidth = newDocMaxX - newDocX;
        const newDocHeight = newDocMaxY - newDocY;

        // Expanded canvas pixel dimensions
        const newCanvasWidth = Math.max(1, Math.round(newDocWidth * scaleX));
        const newCanvasHeight = Math.max(
          1,
          Math.round(newDocHeight * scaleY),
        );

        const canvas = document.createElement("canvas");
        canvas.width = newCanvasWidth;
        canvas.height = newCanvasHeight;
        const ctx = canvas.getContext("2d");

        const hasDeform =
          (active.warpMesh && Array.isArray(active.warpMesh.points)) ||
          (active.perspectiveCorners &&
            active.perspectiveCorners.length === 4) ||
          (active.perspectiveQuad && active.perspectiveQuad.length === 4) ||
          active.adjustments;

        // Offset of the original layer inside the new expanded canvas
        const offsetX = Math.round((active.x - newDocX) * scaleX);
        const offsetY = Math.round((active.y - newDocY) * scaleY);

        // 1. Draw original layer at its offset inside the expanded canvas
        ctx.save();
        if (hasDeform) {
          ctx.translate(offsetX, offsetY);
          ctx.scale(scaleX, scaleY);
          ctx.translate(-active.x, -active.y);
          drawImageNode(
            ctx,
            active,
            bitmap,
            maskTools.maskSourceOf(active),
            null,
            false,
          );
        } else {
          ctx.drawImage(bitmap, offsetX, offsetY);
        }
        ctx.restore();

        // Erase the selection's old footprint from the original layer
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        const contoursToErase =
          sourceContours || baseSelection?.contours || [];
        for (const ring of contoursToErase) {
          ring.forEach(([x, y], index) => {
            const pixelX = (x - newDocX) * scaleX;
            const pixelY = (y - newDocY) * scaleY;
            if (index === 0) ctx.moveTo(pixelX, pixelY);
            else ctx.lineTo(pixelX, pixelY);
          });
          ctx.closePath();
        }
        ctx.fill();

        // 2. Draw transformed pixels onto the expanded canvas
        ctx.globalCompositeOperation = "source-over";
        if (selectionTransform.extractedCanvas) {
          const oldExtractedCx =
            (initialRect.x + initialRect.width / 2 - active.x) * scaleX;
          const oldExtractedCy =
            (initialRect.y + initialRect.height / 2 - active.y) * scaleY;
          const newPixelCx = (newCx - newDocX) * scaleX;
          const newPixelCy = (newCy - newDocY) * scaleY;

          ctx.save();
          ctx.translate(newPixelCx, newPixelCy);
          ctx.rotate(rotation);
          ctx.scale(sX, sY);
          ctx.translate(-oldExtractedCx, -oldExtractedCy);
          ctx.drawImage(selectionTransform.extractedCanvas, 0, 0);
          ctx.restore();
        }

        // 3. Update pixel selection boundary contours before committing bitmap
        // so that the single history snapshot captures both the modified document
        // and the transformed selection atomically.
        const updatedNode = {
          ...active,
          x: newDocX,
          y: newDocY,
          width: newDocWidth,
          height: newDocHeight,
        };

        if (baseSelection) {
          const { transformSelection } = await import("./pixel_selection.js");
          const next = transformSelection(
            canvas,
            baseSelection,
            updatedNode,
            {
              ...rect,
              rotation,
            },
          );
          if (next) {
            setPixelSelection(clampPixelSelection(next));
          }
        }
        setSelectionTransform(null);

        const deformPatch = hasDeform
          ? {
              warpMesh: null,
              puppetPins: null,
              perspectiveCorners: null,
              perspectiveQuad: null,
            }
          : {};

        // 4. Replace layer bitmap and update node geometry in a single history commit
        await replaceNodeBitmap(active.id, canvas.toDataURL("image/png"), {
          patch: {
            x: newDocX,
            y: newDocY,
            width: newDocWidth,
            height: newDocHeight,
            ...deformPatch,
          },
        });

        syncAnts();
        requestRender();
        notify();
        return true;
      })(),
    );
  }

  return {
    beginSelectionTransform,
    getSelectionTransform: () => getSelectionTransform(),
    setSelectionTransform: setTransformBox,
    cancelSelectionTransform,
    applySelectionTransform,
  };
}
