/**
 * Painting, stroking, gradient, and path-to-selection effects for active selections.
 */

import {
  findNode,
  NODE_KIND,
} from "./scene_model.js";
import { drawImageNode } from "./scene_renderer.js";
import { blurMask, contoursToMask } from "./pixel_selection.js";
import { penContourRing } from "./editor_pen.js";
import { contourBounds } from "./mask_contour.js";
import * as ops from "./doc_ops.js";
import { BAKED_BITMAP_DEFORMATION_PATCH } from "./editor_deformation_patch.js";

export function createSelectionPaintEffects({
  getDoc,
  cache,
  maskTools,
  getColor,
  getBackgroundColor,
  selection,
  getPixelSelection,
  setPixelSelection,
  replaceNodeBitmap,
  syncAnts,
  requestRender,
  notify,
  commitPaintBucket,
  commitSelectionEffect,
}) {
  /**
   * Strokes the selection's outline onto the layer with the current colour
   * (Photoshop's Edit → Stroke): a band of `width` doc px along the rings.
   */
  async function strokeSelection(width = 4) {
    const doc = getDoc();
    const current = getPixelSelection();
    if (!current?.nodeId || !current.contours?.length) return false;
    const node = findNode(doc, current.nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;
    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const canvas = document.createElement("canvas");
    canvas.width = bWidth;
    canvas.height = bHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    ctx.strokeStyle = getColor();
    ctx.lineWidth = Math.max(1, width * scaleX);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const ring of current.contours) {
      ring.forEach(([x, y], index) => {
        const pixelX = (x - node.x) * scaleX;
        const pixelY = (y - node.y) * scaleY;
        if (index === 0) ctx.moveTo(pixelX, pixelY);
        else ctx.lineTo(pixelX, pixelY);
      });
      ctx.closePath();
    }
    ctx.stroke();

    await replaceNodeBitmap(current.nodeId, canvas.toDataURL("image/png"), {
      patch: null,
    });
    requestRender();
    notify();
    return true;
  }

  /**
   * Fills the active selection (or layer) with the specified colour (Photoshop's Edit → Fill).
   */
  async function fillSelection(fillColor = getColor()) {
    const doc = getDoc();
    const current = getPixelSelection();
    const selectedId = selection.getId();
    let node = current?.nodeId
      ? findNode(doc, current.nodeId)
      : selectedId
        ? findNode(doc, selectedId)
        : null;

    if (!node && doc.nodes?.length) {
      node =
        doc.nodes.find((n) => n.kind === NODE_KIND.IMAGE) ||
        doc.nodes[doc.nodes.length - 1];
    }

    if (!node) return false;
    if (node.locked || node.lockImagePixels) return false;

    // If it's a vector / shape node: fill its vector color
    if (node.kind !== NODE_KIND.IMAGE) {
      if ("fill" in node) {
        commitSelectionEffect(ops.updateNode(doc, node.id, { fill: fillColor }));
        requestRender();
        notify();
        return true;
      }
      if ("stroke" in node) {
        commitSelectionEffect(ops.updateNode(doc, node.id, { stroke: fillColor }));
        requestRender();
        notify();
        return true;
      }
      return false;
    }

    const bitmap = cache.get(node);
    if (!bitmap) return false;
    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const canvas = document.createElement("canvas");
    canvas.width = bWidth;
    canvas.height = bHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    // A deform worth baking in is one that exists; a node's `adjustments`
    // field is ALWAYS a non-null default object, so counting the object
    // itself would call every plain image deformed.
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

    if (current?.contours?.length) {
      const alphaMap =
        current.feather > 0
          ? blurMask(
              contoursToMask(current.contours, node, bWidth, bHeight),
              bWidth,
              bHeight,
              current.feather,
            )
          : null;

      if (alphaMap) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tCtx = tempCanvas.getContext("2d");
        tCtx.fillStyle = fillColor;
        tCtx.fillRect(0, 0, 1, 1);
        const [fr, fg, fb, fa] = tCtx.getImageData(0, 0, 1, 1).data;

        const image = ctx.getImageData(0, 0, bWidth, bHeight);
        for (let i = 0; i < alphaMap.length; i += 1) {
          const a = alphaMap[i] * (fa / 255);
          if (a <= 0) continue;
          const idx = i * 4;
          const origA = image.data[idx + 3] / 255;
          const outA = a + origA * (1 - a);
          if (outA > 0) {
            image.data[idx] = Math.round(
              (fr * a + image.data[idx] * origA * (1 - a)) / outA,
            );
            image.data[idx + 1] = Math.round(
              (fg * a + image.data[idx + 1] * origA * (1 - a)) / outA,
            );
            image.data[idx + 2] = Math.round(
              (fb * a + image.data[idx + 2] * origA * (1 - a)) / outA,
            );
            image.data[idx + 3] = Math.round(outA * 255);
          }
        }
        ctx.putImageData(image, 0, 0);
      } else {
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        for (const ring of current.contours) {
          ring.forEach(([x, y], index) => {
            const pixelX = (x - node.x) * scaleX;
            const pixelY = (y - node.y) * scaleY;
            if (index === 0) ctx.moveTo(pixelX, pixelY);
            else ctx.lineTo(pixelX, pixelY);
          });
          ctx.closePath();
        }
        ctx.fill();
      }
    } else {
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, bWidth, bHeight);
    }

    // One user action is one history entry: when a deform was baked into the
    // new pixels, its cleanup rides the bitmap swap's own commit (patch)
    // instead of a second setDoc that undoes to a visually identical state.
    await commitPaintBucket(() =>
      replaceNodeBitmap(node.id, canvas.toDataURL("image/png"), {
        patch: hasDeform ? BAKED_BITMAP_DEFORMATION_PATCH : null,
      }),
    );

    requestRender();
    notify();
    return true;
  }

  /**
   * Applies a linear gradient between two points to the active selection or image layer.
   */
  async function applyGradientSelection(
    startDocPt,
    endDocPt,
    startColor = getColor(),
    endColor = getBackgroundColor(),
  ) {
    const doc = getDoc();
    const current = getPixelSelection();
    const selectedId = selection.getId();
    let node = current?.nodeId
      ? findNode(doc, current.nodeId)
      : selectedId
        ? findNode(doc, selectedId)
        : null;

    if (!node && doc.nodes?.length) {
      node =
        doc.nodes.find((n) => n.kind === NODE_KIND.IMAGE) ||
        doc.nodes[doc.nodes.length - 1];
    }

    if (!node || node.locked || node.lockImagePixels) return false;
    if (node.kind !== NODE_KIND.IMAGE) return false;

    const bitmap = cache.get(node);
    if (!bitmap) return false;
    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const canvas = document.createElement("canvas");
    canvas.width = bWidth;
    canvas.height = bHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.drawImage(bitmap, 0, 0);

    const p0x = (startDocPt.x - node.x) * scaleX;
    const p0y = (startDocPt.y - node.y) * scaleY;
    const p1x = (endDocPt.x - node.x) * scaleX;
    const p1y = (endDocPt.y - node.y) * scaleY;

    const grad = ctx.createLinearGradient(p0x, p0y, p1x, p1y);
    grad.addColorStop(0, startColor);
    grad.addColorStop(1, endColor);

    if (current?.contours?.length) {
      ctx.save();
      ctx.beginPath();
      for (const ring of current.contours) {
        ring.forEach(([x, y], index) => {
          const pixelX = (x - node.x) * scaleX;
          const pixelY = (y - node.y) * scaleY;
          if (index === 0) ctx.moveTo(pixelX, pixelY);
          else ctx.lineTo(pixelX, pixelY);
        });
        ctx.closePath();
      }
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, bWidth, bHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, bWidth, bHeight);
    }

    await replaceNodeBitmap(node.id, canvas.toDataURL("image/png"), {
      patch: null,
    });
    requestRender();
    notify();
    return true;
  }

  /**
   * Converts the selected pen path into a pixel selection (Photoshop's Load
   * Path as Selection, minus the dialog): the outline is sampled into a
   * document-space ring and installed on the image node underneath. The pen
   * path itself is left in place.
   */
  function pathToSelection() {
    const doc = getDoc();
    const id = selection.getId();
    const node = id ? findNode(doc, id) : null;
    if (!node || node.kind !== NODE_KIND.PATH || node.pen !== true)
      return false;
    const ring = penContourRing(node);
    if (ring.length < 3) return false;
    // The host image is the one under the path's centre: a selection must
    // belong to a layer whose pixels it can cut from.
    const centre = contourBounds([ring]);
    const host = ops.imageNodeUnder(doc, {
      x: centre.x + centre.width / 2,
      y: centre.y + centre.height / 2,
    });
    if (!host) return false;
    setPixelSelection({
      nodeId: host.id,
      contours: [ring],
      bounds: centre,
    });
    syncAnts();
    requestRender();
    notify();
    return true;
  }

  return {
    strokeSelection,
    fillSelection,
    applyGradientSelection,
    pathToSelection,
  };
}
