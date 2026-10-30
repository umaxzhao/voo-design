/**
 * Layer creation, adjustment layers, image insertion, and mask attachment controller.
 *
 * Extracted from editor_engine.js to isolate layer provisioning, rasterization,
 * and mask baking workflows.
 */

import {
  decodeBlob,
  decodeBlobToBitmap,
} from "./bitmap_cache.js";
import { blurMask, contoursToMask } from "./pixel_selection.js";
import {
  createAdjustmentNode,
  createImageNode,
  findNode,
  isGroupNode,
  NODE_KIND,
} from "./scene_model.js";
import { drawNode } from "./scene_renderer.js";
import { TOOL } from "./editor_constants.js";
import { putImage } from "../store/db.js";
import { toNodeLocal } from "./scene_geometry.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";
import { createImageInsertionController } from "./image-insertion.js";
import { createSvgLayerActions } from "./svg-layer-actions.js";

export function createEngineLayersController({
  getDoc,
  setDoc,
  cache,
  selection,
  select,
  selectExactly,
  maskTools,
  paintTools,
  getPixelSelection,
  clearPixelSelection,
  setTool,
}) {
  async function addAdjustmentLayer(kind, adjustments = null, name = null) {
    const doc = getDoc();
    const pendingLasso = maskTools.api.getLasso?.();
    const hasPendingLasso = Boolean(
      pendingLasso?.pending && pendingLasso.points?.length >= 3,
    );
    const pixelSelection = getPixelSelection();
    const contours = pixelSelection?.contours?.length
      ? pixelSelection.contours
      : hasPendingLasso
        ? [pendingLasso.points]
        : null;

    let maskId = null;
    if (contours) {
      const width = Math.max(1, Math.round(doc.width));
      const height = Math.max(1, Math.round(doc.height));
      let alphaMap = contoursToMask(
        contours,
        { x: 0, y: 0, width, height },
        width,
        height,
      );
      const feather = pixelSelection?.feather ?? 0;
      if (alphaMap && feather > 0) {
        alphaMap = blurMask(alphaMap, width, height, feather);
      }
      if (alphaMap) {
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = width;
        maskCanvas.height = height;
        const mCtx = maskCanvas.getContext("2d");
        if (mCtx) {
          const image = mCtx.createImageData(width, height);
          for (let i = 0; i < alphaMap.length; i += 1) {
            image.data[i * 4] = 255;
            image.data[i * 4 + 1] = 255;
            image.data[i * 4 + 2] = 255;
            image.data[i * 4 + 3] = Math.round(alphaMap[i] * 255);
          }
          mCtx.putImageData(image, 0, 0);
          const maskBlob = await new Promise((resolve) =>
            maskCanvas.toBlob(resolve, "image/png"),
          );
          if (maskBlob) {
            maskId = `mask-${crypto.randomUUID()}`;
            await putImage(maskId, maskBlob);
            const maskBitmap = await decodeBlobToBitmap(maskBlob);
            if (maskBitmap) cache.putMask(maskId, maskBitmap);
          }
        }
      }
    }

    const node = {
      ...createAdjustmentNode({
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
        adjustmentKind: kind ?? null,
        adjustments: adjustments ?? undefined,
        name: name ?? undefined,
      }),
      ...(maskId ? { maskId } : {}),
    };
    commitEditorDocument("editor.layer.add", setDoc, ops.addNode(doc, node));
    selectExactly([node.id]);
    return node;
  }

  function addNewLayer(name = null) {
    return paintTools.api.createEmptyPaintLayer(name);
  }

  async function addMaskToSelected() {
    const doc = getDoc();
    const activeId = selection.getId();
    const active = activeId ? findNode(doc, activeId) : null;
    if (
      !active ||
      active.kind === NODE_KIND.REGION ||
      active.kind === NODE_KIND.ADJUSTMENT ||
      isGroupNode(active)
    ) {
      return;
    }

    const pendingLasso = maskTools.api.getLasso?.();
    const hasPendingLasso = Boolean(
      pendingLasso?.pending &&
      pendingLasso.points?.length >= 3 &&
      (!pendingLasso.nodeId || pendingLasso.nodeId === active.id),
    );
    const pixelSelection = getPixelSelection();
    const contours = pixelSelection?.contours?.length
      ? pixelSelection.contours
      : hasPendingLasso
        ? [pendingLasso.points]
        : null;

    if (contours?.length && active.kind === NODE_KIND.IMAGE) {
      const bitmap = cache.get(active);
      if (!bitmap) return;
      const width = bitmap.naturalWidth ?? bitmap.width;
      const height = bitmap.naturalHeight ?? bitmap.height;
      const scaleX = width / (active.width || width);
      const scaleY = height / (active.height || height);

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = width;
      maskCanvas.height = height;
      const mCtx = maskCanvas.getContext("2d");
      if (mCtx) {
        mCtx.clearRect(0, 0, width, height);
        const alphaMap =
          (pixelSelection?.feather ?? 0) > 0
            ? blurMask(
                contoursToMask(contours, active, width, height),
                width,
                height,
                pixelSelection.feather,
              )
            : null;
        if (alphaMap) {
          const image = mCtx.createImageData(width, height);
          for (let i = 0; i < alphaMap.length; i += 1) {
            const val = Math.round(alphaMap[i] * 255);
            image.data[i * 4] = 255;
            image.data[i * 4 + 1] = 255;
            image.data[i * 4 + 2] = 255;
            image.data[i * 4 + 3] = val;
          }
          mCtx.putImageData(image, 0, 0);
        } else {
          mCtx.fillStyle = "#ffffff";
          mCtx.beginPath();
          for (const ring of contours) {
            ring.forEach(([x, y], index) => {
              const local = toNodeLocal(active, { x, y });
              const px = local.x * scaleX;
              const py = local.y * scaleY;
              if (index === 0) mCtx.moveTo(px, py);
              else mCtx.lineTo(px, py);
            });
            mCtx.closePath();
          }
          mCtx.fill();
        }
      }

      const maskBlob = await new Promise((resolve) =>
        maskCanvas.toBlob(resolve, "image/png"),
      );

      if (maskBlob) {
        const maskId = `mask-${crypto.randomUUID()}`;
        await putImage(maskId, maskBlob);
        const maskBitmap = await decodeBlob(maskBlob);
        if (maskBitmap) {
          cache.putMask(maskId, maskBitmap);
        }

        commitEditorDocument(
          "editor.mask.attach",
          setDoc,
          ops.updateNode(getDoc(), active.id, { maskId }),
        );
        if (hasPendingLasso) {
          maskTools.api.cancelLasso();
        }
        clearPixelSelection();
        return;
      }
    }

    let targetNode = active;
    if (active.kind !== NODE_KIND.IMAGE) {
      const canvasW = Math.max(1, Math.round(active.width || 100));
      const canvasH = Math.max(1, Math.round(active.height || 100));
      const offCanvas = document.createElement("canvas");
      offCanvas.width = canvasW;
      offCanvas.height = canvasH;
      const offCtx = offCanvas.getContext("2d");
      if (offCtx) {
        offCtx.save();
        offCtx.translate(-active.x, -active.y);
        drawNode(
          offCtx,
          active,
          (n) => cache.get(n),
          maskTools.maskSourceOf,
          null,
          false,
        );
        offCtx.restore();
      }
      const rasterBlob = await new Promise((resolve) =>
        offCanvas.toBlob(resolve, "image/png"),
      );
      if (!rasterBlob) return;
      const rasterImageId = `img-${crypto.randomUUID()}`;
      await putImage(rasterImageId, rasterBlob);
      const rasterBitmap = await decodeBlob(rasterBlob);
      if (rasterBitmap) {
        cache.put({ imageId: rasterImageId }, rasterBitmap);
      }
      const convertedNode = {
        ...createImageNode({
          x: active.x,
          y: active.y,
          width: active.width,
          height: active.height,
          imageId: rasterImageId,
        }),
        id: active.id,
        name: active.name || "Layer",
        opacity: active.opacity ?? 1,
        blendMode: active.blendMode ?? "normal",
        visible: active.visible !== false,
      };
      commitEditorDocument(
        "editor.mask.attach",
        setDoc,
        ops.updateNode(getDoc(), active.id, convertedNode),
      );
      targetNode = convertedNode;
    }

    if (targetNode.maskId) {
      if (maskTools.api.getMaskEdit()?.nodeId === targetNode.id) {
        maskTools.api.endMaskEdit();
      } else {
        maskTools.api.beginMaskEdit(targetNode.id);
        setTool(TOOL.BRUSH);
      }
    } else {
      await maskTools.api.createEmptyMask(targetNode.id);
      setTool(TOOL.BRUSH);
    }
  }

  const { insertImage, prepareImageInsertion, insertPreparedImages, appendImageLayers } = createImageInsertionController({
    getDoc, setDoc, cache, select, selectExactly,
  });

  const { insertSvg, updateNodeFromSvg, getNodeSvg } = createSvgLayerActions({
    getDoc, setDoc, cache, maskTools, selection, select, selectExactly,
  });

  return {
    addAdjustmentLayer,
    addNewLayer,
    addMaskToSelected,
    insertImage,
    prepareImageInsertion,
    insertPreparedImages,
    appendImageLayers,
    insertSvg,
    updateNodeFromSvg,
    getNodeSvg,
  };
}
