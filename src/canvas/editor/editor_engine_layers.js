/**
 * Layer creation, adjustment layers, image insertion, and mask attachment controller.
 *
 * Extracted from editor_engine.js to isolate layer provisioning, rasterization,
 * and mask baking workflows.
 */

import {
  decodeBlob,
  decodeBlobToBitmap,
  decodeImageSource,
} from "./bitmap_cache.js";
import { workPreviewSize } from "./workspace_cap.js";
import { blurMask, contoursToMask } from "./pixel_selection.js";
import {
  createAdjustmentNode,
  createImageNode,
  findNode,
  isGroupNode,
  NODE_KIND,
} from "./scene_model.js";
import { drawNode, ensureImagePyramid } from "./scene_renderer.js";
import { TOOL } from "./editor_constants.js";
import { dataUrlToBlob, getImageBlobMap, putImage } from "../store/db.js";
import { toNodeLocal } from "./scene_geometry.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";
import { nodesToSvg } from "./editor_svg.js";

/**
 * Stores an inserted image so it survives a reload. Storage can be missing
 * (private browsing, a full quota): the layer still shows from its src, it
 * just stays unpersisted instead of failing the whole insert.
 */
async function persistInsertedImage(source) {
  const imageId = `img-${crypto.randomUUID()}`;
  try {
    await putImage(imageId, source);
    return imageId;
  } catch (error) {
    console.warn("inserted image not persisted", error);
    return null;
  }
}

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

  async function insertImage(fileOrUrl, point) {
    const doc = getDoc();
    let imageId = null;
    let bitmap;
    if (typeof fileOrUrl === "string") {
      bitmap = await decodeImageSource(fileOrUrl);
      let blob = null;
      if (fileOrUrl.startsWith("data:")) {
        try {
          blob = dataUrlToBlob(fileOrUrl);
        } catch {
          blob = fileOrUrl;
        }
      } else if (
        typeof fetch === "function" &&
        (fileOrUrl.startsWith("blob:") ||
          fileOrUrl.startsWith("http:") ||
          fileOrUrl.startsWith("https:"))
      ) {
        try {
          const res = await fetch(fileOrUrl);
          if (res.ok) {
            blob = await res.blob();
          }
        } catch {
          // Network or CORS failure
        }
      }
      if (!blob && bitmap && typeof document !== "undefined") {
        try {
          const canvas = document.createElement("canvas");
          const bw = bitmap.naturalWidth ?? bitmap.width ?? 1;
          const bh = bitmap.naturalHeight ?? bitmap.height ?? 1;
          canvas.width = bw;
          canvas.height = bh;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          if (typeof canvas.toBlob === "function") {
            blob = await new Promise((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );
          } else if (typeof canvas.toDataURL === "function") {
            blob = dataUrlToBlob(canvas.toDataURL("image/png"));
          }
        } catch {
          // Canvas tainted
        }
      }
      if (blob) imageId = await persistInsertedImage(blob);
    } else {
      bitmap = await decodeImageSource(fileOrUrl);
      imageId = await persistInsertedImage(fileOrUrl);
    }

    const node = ops.makeCentredImageNode(doc, bitmap, {
      imageId,
      src: fileOrUrl,
    });
    if (point) {
      node.x = point.x - node.width / 2;
      node.y = point.y - node.height / 2;
    }
    const preview = workPreviewSize(
      bitmap.naturalWidth ?? bitmap.width,
      bitmap.naturalHeight ?? bitmap.height,
    );
    let workBitmap = bitmap;
    if (preview.capped) {
      const canvas = document.createElement("canvas");
      canvas.width = preview.width;
      canvas.height = preview.height;
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, preview.width, preview.height);
      workBitmap = canvas;
      node.reducedPreview = true;
    }
    cache.put(node, workBitmap);
    ensureImagePyramid(workBitmap);
    commitEditorDocument("editor.layer.add", setDoc, ops.addNode(doc, node));
    select(node.id);
    return node;
  }

  /**
   * Adds pictures the editor was not opened with to the live document.
   *
   * This is the editor's half of the ingestion contract. The store writes a
   * finished generation onto the receiving node's `editorDoc`
   * (workflow_node_ingestion_actions.js), but an OPEN document is the engine's
   * live state — `buildEditorSource` reads the node once per activation — so
   * without this the layer would stay invisible until the editor was closed
   * and reopened, and an apply would flatten the document without it.
   *
   * Additive on purpose: nothing the user has drawn is discarded and no
   * existing layer is touched, so folding in an external result can never cost
   * work in progress. Every layer that could not be placed is reported back
   * rather than dropped silently.
   *
   * @param {Array<{imageId: string, src?: string|null}>} layers
   * @returns {Promise<{added: string[], skipped: Array<{imageId: string, reason: string}>}>}
   */
  async function appendImageLayers(layers = []) {
    const doc = getDoc();
    const known = new Set(
      doc.nodes.filter((node) => node.imageId).map((node) => node.imageId),
    );
    const fresh = [];
    const skipped = [];
    for (const layer of layers) {
      const imageId = layer?.imageId;
      if (!imageId) continue;
      if (known.has(imageId)) {
        skipped.push({ imageId, reason: "alreadyPresent" });
        continue;
      }
      known.add(imageId);
      fresh.push({ imageId, src: layer.src ?? null });
    }
    if (fresh.length === 0) return { added: [], skipped };

    // Decode everything before touching the document: a picture that fails to
    // load must leave the open document exactly as it was rather than
    // half-ingested, and its reason is reported instead of swallowed.
    const decoded = [];
    for (const layer of fresh) {
      let src = layer.src;
      let createdUrl = null;
      try {
        if (!src) {
          const blobs = await getImageBlobMap([layer.imageId]);
          const blob = blobs.get(layer.imageId);
          if (!blob) {
            skipped.push({ imageId: layer.imageId, reason: "assetMissing" });
            continue;
          }
          createdUrl = URL.createObjectURL(blob);
          src = createdUrl;
        }
        const bitmap = await decodeImageSource(src);
        decoded.push({ imageId: layer.imageId, src, bitmap });
      } catch (error) {
        skipped.push({
          imageId: layer.imageId,
          reason: error?.message ?? "decodeFailed",
        });
      } finally {
        // The decoded bitmap and its pyramid are what the document draws from,
        // so the object URL this call minted has done its job. `open()` treats
        // the connected layers it loads the same way; holding the URL would pin
        // every ingested picture in memory for the life of the page.
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      }
    }

    if (decoded.length === 0) return { added: [], skipped };

    let next = getDoc();
    const added = [];
    for (const item of decoded) {
      const preview = workPreviewSize(
        item.bitmap.naturalWidth ?? item.bitmap.width,
        item.bitmap.naturalHeight ?? item.bitmap.height,
      );
      let workBitmap = item.bitmap;
      if (preview.capped) {
        const canvas = document.createElement("canvas");
        canvas.width = preview.width;
        canvas.height = preview.height;
        canvas
          .getContext("2d")
          .drawImage(item.bitmap, 0, 0, preview.width, preview.height);
        workBitmap = canvas;
      }
      const node = ops.makeCentredImageNode(next, item.bitmap, {
        imageId: item.imageId,
        src: item.src,
      });
      if (preview.capped) node.reducedPreview = true;
      cache.put(node, workBitmap);
      ensureImagePyramid(workBitmap);
      next = ops.addNode(next, node);
      added.push(item.imageId);
    }

    commitEditorDocument("editor.layer.add", setDoc, next, {
      name: "editor.history.entry.addLayer",
    });
    return { added, skipped };
  }

  async function insertSvg(svgString, point) {
    const doc = getDoc();
    const { parseSvgStringToNodes } = await import("./editor_svg_import.js");
    const { nodes: parsedNodes, bounds } = parseSvgStringToNodes(svgString);
    if (!parsedNodes || parsedNodes.length === 0) {
      throw new Error("No renderable shapes found in SVG");
    }

    const page = doc;
    const targetX = point ? point.x : (page.width || 800) / 2;
    const targetY = point ? point.y : (page.height || 600) / 2;

    const boundsCenterX = bounds.x + bounds.width / 2;
    const boundsCenterY = bounds.y + bounds.height / 2;
    const offsetX = targetX - boundsCenterX;
    const offsetY = targetY - boundsCenterY;

    const positionedNodes = parsedNodes.map((node) => {
      if (node.kind === NODE_KIND.GROUP) {
        return {
          ...node,
          x: node.x != null ? node.x + offsetX : node.x,
          y: node.y != null ? node.y + offsetY : node.y,
        };
      }
      return {
        ...node,
        x: node.x + offsetX,
        y: node.y + offsetY,
      };
    });

    let nextDoc = doc;
    for (const n of positionedNodes) {
      nextDoc = ops.addNode(nextDoc, n);
    }
    commitEditorDocument("editor.layer.add", setDoc, nextDoc);

    const nonGroup = positionedNodes.filter((n) => n.kind !== NODE_KIND.GROUP);
    if (selectExactly && nonGroup.length > 1) {
      selectExactly(nonGroup.map((n) => n.id));
    } else if (positionedNodes.length > 0) {
      select(positionedNodes[0].id);
    }

    return positionedNodes;
  }

  async function updateNodeFromSvg(nodeId, svgString) {
    const doc = getDoc();
    const targetNode = doc.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const { parseSvgStringToNodes } = await import("./editor_svg_import.js");
    const { nodes: parsedNodes, bounds } = parseSvgStringToNodes(svgString);
    if (!parsedNodes || parsedNodes.length === 0) return;

    const offsetX = targetNode.x - bounds.x;
    const offsetY = targetNode.y - bounds.y;

    const shifted = parsedNodes.map((n) => ({
      ...n,
      x: n.x != null ? n.x + offsetX : n.x,
      y: n.y != null ? n.y + offsetY : n.y,
    }));

    let nextDoc;
    if (shifted.length === 1 && targetNode.kind !== NODE_KIND.GROUP) {
      const updated = {
        ...shifted[0],
        id: targetNode.id,
        parentId: targetNode.parentId,
      };
      nextDoc = ops.updateNode(doc, targetNode.id, updated);
      commitEditorDocument("editor.layer.settings", setDoc, nextDoc);
      select(targetNode.id);
      return updated;
    }

    const targetIdx = doc.nodes.findIndex((n) => n.id === nodeId);
    const newNodes = [...doc.nodes];
    newNodes.splice(targetIdx, 1, ...shifted);
    nextDoc = { ...doc, nodes: newNodes };
    commitEditorDocument("editor.layer.settings", setDoc, nextDoc);
    if (selectExactly) {
      selectExactly(shifted.map((n) => n.id));
    } else {
      select(shifted[0].id);
    }
    return shifted;
  }

  function getNodeSvg(nodeId) {
    const doc = getDoc();
    const targetId = nodeId ?? selection.getId();
    if (!targetId) return "";
    const setIds = ops.moveAffectedIds(doc, [targetId]);
    const set = new Set(setIds);
    const nodes = doc.nodes
      .filter((n) => set.has(n.id))
      .map((n) => JSON.parse(JSON.stringify(n)));
    return nodesToSvg(nodes);
  }

  return {
    addAdjustmentLayer,
    addNewLayer,
    addMaskToSelected,
    insertImage,
    appendImageLayers,
    insertSvg,
    updateNodeFromSvg,
    getNodeSvg,
  };
}
