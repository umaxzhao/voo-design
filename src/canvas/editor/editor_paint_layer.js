/** Paint layer bounds, creation, expansion, trimming, and opacity test. */

import * as ops from "./doc_ops.js";
import { createImageNode, findNode, NODE_KIND } from "./scene_model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import { toNodeLocal } from "./scene_geometry.js";

/** The topmost paint layer, or null when the document has none yet. */
export function findPaintLayer(doc) {
  for (let index = doc.nodes.length - 1; index >= 0; index -= 1) {
    const node = doc.nodes[index];
    if (node.kind === NODE_KIND.IMAGE && node.paint === true) return node;
  }
  return null;
}

/** A dab's doc-space box: the diameter centred on the pointer point. */
export function dabRect(point, diameter) {
  return {
    x: point.x - diameter / 2,
    y: point.y - diameter / 2,
    width: diameter,
    height: diameter,
  };
}

/**
 * The rect clamped to the page, snapped to whole pixels — the paint layer
 * keeps a 1:1 doc-to-texel mapping, so integer bounds keep canvas pixels
 * and document pixels the same size. Null when nothing overlaps the page.
 */
export function clampRectToDoc(rect, doc) {
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(doc.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(doc.height, Math.ceil(rect.y + rect.height));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Materialises the paint layer around the stroke's first dab.
 *
 * The layer is born the size of what was painted — a dab-sized box, not a
 * full-page sheet — and grows from there, so the selection frame and the
 * editable range always hug the artwork. The placeholder imageId reaches
 * the store when the stroke persists; the creation itself stays
 * uncommitted and folds into that stroke's history entry. A first dab
 * completely off the page materialises nothing.
 */
export function materialisePaintLayer({ getDoc, setDoc, select, paintCanvases }, rect) {
  const doc = getDoc();
  const existing = findPaintLayer(doc);
  if (existing) return existing;
  const box = clampRectToDoc(rect, doc);
  if (!box) return null;
  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;
  const imageId = `paint-${crypto.randomUUID()}`;
  const node = {
    ...createImageNode({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      imageId,
    }),
    paint: true,
    name: "Paint",
  };
  paintCanvases.set(node.id, {
    canvas,
    imageId,
    version: 0,
    persistedVersion: 0,
  });
  setDoc(ops.addNode(doc, node), { commit: false });
  select(node.id);
  return node;
}

/**
 * Creates a dedicated transparent pixel/paint layer across the entire page,
 * selected and ready for immediate brush drawing without creating new layers.
 */
export function createEmptyPaintLayer(
  { getDoc, setDoc, select, paintCanvases, queuePaintPersist },
  name = null,
) {
  const doc = getDoc();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, doc.width);
  canvas.height = Math.max(1, doc.height);
  const imageId = `paint-${crypto.randomUUID()}`;
  const node = {
    ...createImageNode({
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
      imageId,
    }),
    paint: true,
    name: name || "Layer",
  };
  paintCanvases.set(node.id, {
    canvas,
    imageId,
    version: 0,
    persistedVersion: 0,
  });
  commitEditorDocument("editor.paint.change", setDoc, ops.addNode(doc, node));
  select(node.id);
  void queuePaintPersist(node.id);
  return node;
}

/**
 * Grows the paint layer so `rect` fits inside it: the canvas is re-based
 * onto a larger one with the old pixels at their offset, and the node's
 * box follows. Uncommitted — the growth folds into the stroke's persist
 * entry. Returns the refreshed node, or null when the dab misses the page
 * entirely (nothing to paint).
 */
export function expandPaintLayer(
  { getDoc, setDoc, paintCanvases, releaseBitmap, markPaintDirty },
  node,
  rect,
  allowOutsideDoc = false,
) {
  const doc = getDoc();
  const box = allowOutsideDoc
    ? { x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.ceil(rect.x + rect.width) - Math.floor(rect.x), height: Math.ceil(rect.y + rect.height) - Math.floor(rect.y) }
    : clampRectToDoc(rect, doc);
  if (!box) return null;
  const left = Math.min(node.x, box.x);
  const top = Math.min(node.y, box.y);
  const right = Math.max(node.x + node.width, box.x + box.width);
  const bottom = Math.max(node.y + node.height, box.y + box.height);
  if (
    left === node.x &&
    top === node.y &&
    right === node.x + node.width &&
    bottom === node.y + node.height
  ) {
    return node;
  }
  const entry = paintCanvases.get(node.id);
  if (!entry) return node;
  const canvas = document.createElement("canvas");
  canvas.width = right - left;
  canvas.height = bottom - top;
  canvas
    .getContext("2d")
    .drawImage(entry.canvas, node.x - left, node.y - top);
  releaseBitmap?.(entry.canvas);
  entry.canvas = canvas;
  commitEditorDocument(
    "editor.paint.change",
    setDoc,
    ops.updateNode(doc, node.id, {
      x: left,
      y: top,
      width: canvas.width,
      height: canvas.height,
    }),
    { commit: false },
  );
  markPaintDirty(node.id);
  return findNode(getDoc(), node.id);
}

/**
 * Crops the paint layer to its remaining pixels after an erase stroke, so
 * rubbing content away shrinks the editable range to match. A layer erased
 * flat keeps its box — collapsing it to nothing would make the empty layer
 * impossible to click ever again.
 */
export function trimPaintLayer(
  { getDoc, setDoc, paintCanvases, releaseBitmap, markPaintDirty },
  nodeId,
) {
  const node = findNode(getDoc(), nodeId);
  if (!node || node.kind !== NODE_KIND.IMAGE) return;
  const entry = paintCanvases.get(nodeId);
  if (!entry) return;
  const { width, height } = entry.canvas;
  if (!width || !height) return;
  const { data } = entry.canvas
    .getContext("2d")
    .getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return;
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
    return;
  }
  const scaleX = width / (node.width || width);
  const scaleY = height / (node.height || height);
  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;

  const canvas = document.createElement("canvas");
  canvas.width = croppedWidth;
  canvas.height = croppedHeight;
  canvas.getContext("2d").drawImage(entry.canvas, -minX, -minY);
  releaseBitmap?.(entry.canvas);
  entry.canvas = canvas;
  entry.version += 1;

  commitEditorDocument(
    "editor.paint.change",
    setDoc,
    ops.updateNode(getDoc(), nodeId, {
      x: node.x + minX / scaleX,
      y: node.y + minY / scaleY,
      width: croppedWidth / scaleX,
      height: croppedHeight / scaleY,
    }),
    { commit: false },
  );
  markPaintDirty(nodeId);
}

/**
 * Photoshop's auto-select reads pixels, not boxes: a paint layer is mostly
 * transparent, so a plain rect test would swallow clicks meant for the
 * nodes below it. The pointer routes node hit-tests through here for paint
 * layers — a fully transparent texel lets the click fall through.
 */
export function isPaintOpaqueAt(paintCanvasOf, node, point) {
  if (node?.paint !== true) return true;
  const canvas = paintCanvasOf(node);
  if (!canvas) return true;
  const scaleX = canvas.width / node.width;
  const scaleY = canvas.height / node.height;
  const local = toNodeLocal(node, point);
  const x = Math.floor(local.x * scaleX);
  const y = Math.floor(local.y * scaleY);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
  const { data } = canvas.getContext("2d").getImageData(x, y, 1, 1);
  return data[3] > 0;
}
