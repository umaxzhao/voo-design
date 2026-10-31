import { drawImagePaint } from "./image-paint-layout.js";
import { MIN_DOC_SIZE } from "./scene_model_core.js";
import { commitEditorDocument } from "../undo-action-contracts.js";

/** Source-pixel crop helpers for image layers. */

export function normalizeImageCrop(node, sourceWidth, sourceHeight) {
  const width = Number(sourceWidth);
  const height = Number(sourceHeight);
  const full = {
    x: 0,
    y: 0,
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0,
  };
  const crop = node?.kind === "image" ? node.crop : null;
  if (
    !crop ||
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    full.width <= 0 ||
    full.height <= 0
  ) {
    return full;
  }
  const x = Math.max(0, Math.min(full.width, crop.x));
  const y = Math.max(0, Math.min(full.height, crop.y));
  const right = Math.max(x, Math.min(full.width, crop.x + crop.width));
  const bottom = Math.max(y, Math.min(full.height, crop.y + crop.height));
  if (right <= x || bottom <= y) return full;
  return { x, y, width: right - x, height: bottom - y };
}

export function normalizeStoredImageCrop(crop) {
  if (
    !crop ||
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    return null;
  }
  return {
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
  };
}

/** Map a source-space crop to its matching document-space box. */
export function imageCropDisplayBox(node, crop, sourceWidth, sourceHeight) {
  const source = normalizeImageCrop(node, sourceWidth, sourceHeight);
  const rect = crop ?? source;
  const scaleX = node.width / source.width;
  const scaleY = node.height / source.height;
  return {
    x: node.x + (rect.x - source.x) * scaleX,
    y: node.y + (rect.y - source.y) * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

/** Return normalized source coordinates as a 0..1 viewBox for vector backends. */
export function imageCropViewBox(node, sourceWidth, sourceHeight) {
  const crop = normalizeImageCrop(node, sourceWidth, sourceHeight);
  if (!sourceWidth || !sourceHeight) return { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: crop.x / sourceWidth,
    y: crop.y / sourceHeight,
    width: crop.width / sourceWidth,
    height: crop.height / sourceHeight,
  };
}

export function croppedImageSource(image, node, bitmap) {
  if (!node.crop) return image;
  const sourceWidth = bitmap.naturalWidth ?? bitmap.width;
  const sourceHeight = bitmap.naturalHeight ?? bitmap.height;
  const crop = normalizeImageCrop(node, sourceWidth, sourceHeight);
  if (
    crop.x === 0 && crop.y === 0 &&
    crop.width === sourceWidth && crop.height === sourceHeight
  ) return image;
  const scaleX = image.width / sourceWidth;
  const scaleY = image.height / sourceHeight;
  const width = Math.max(1, Math.ceil(crop.width * scaleX));
  const height = Math.max(1, Math.ceil(crop.height * scaleY));
  const canvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    width,
    height,
  );
  return canvas;
}

export function drawImageCrop(ctx, image, node, bitmap) {
  if (!node.crop) {
    if (node.imageTransform || ["fill", "fit", "tile"].includes(node.imageScaleMode)) drawImagePaint(ctx, image, node, bitmap);
    else ctx.drawImage(image, node.x, node.y, node.width, node.height);
    return;
  }
  const sourceWidth = bitmap.naturalWidth ?? bitmap.width;
  const sourceHeight = bitmap.naturalHeight ?? bitmap.height;
  const crop = normalizeImageCrop(node, sourceWidth, sourceHeight);
  const scaleX = image.width / sourceWidth;
  const scaleY = image.height / sourceHeight;
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    node.x,
    node.y,
    node.width,
    node.height,
  );
}

export function createImageLayerCrop({
  getDoc,
  setDoc,
  selection,
  cache,
  requestRender,
  notify,
}) {
  let state = null;
  let rect = null;

  function selectedImage() {
    const id = selection?.getId?.();
    return getDoc()?.nodes?.find((node) => node.id === id && node.kind === "image") ?? null;
  }

  function geometryOf(node) {
    const bitmap = node && cache?.get?.(node);
    if (!bitmap) return null;
    const sourceWidth = bitmap.naturalWidth ?? bitmap.width;
    const sourceHeight = bitmap.naturalHeight ?? bitmap.height;
    const crop = normalizeImageCrop(node, sourceWidth, sourceHeight);
    const scaleX = node.width / crop.width;
    const scaleY = node.height / crop.height;
    return {
      node,
      sourceWidth,
      sourceHeight,
      crop,
      scaleX,
      scaleY,
      originalRotation: node.rotation,
      originalShear: node.shear,
      full: {
        x: node.x - crop.x * scaleX,
        y: node.y - crop.y * scaleY,
        width: sourceWidth * scaleX,
        height: sourceHeight * scaleY,
      },
    };
  }

  function begin() {
    const image = selectedImage();
    if (!image) return false;
    const geometry = geometryOf(image);
    if (!geometry) return false;
    state = geometry;
    rect = { x: image.x, y: image.y, width: image.width, height: image.height };
    requestRender();
    notify();
    return true;
  }

  function apply() {
    if (!state || !rect) return false;
    const doc = getDoc();
    const image = doc.nodes.find((node) => node.id === state.node.id);
    const current = state;
    const frame = rect;
    state = null;
    rect = null;
    if (!image) return false;
    const crop = {
      x: Math.max(0, Math.min(current.sourceWidth, (frame.x - current.full.x) / current.scaleX)),
      y: Math.max(0, Math.min(current.sourceHeight, (frame.y - current.full.y) / current.scaleY)),
      width: 0,
      height: 0,
    };
    crop.width = Math.max(0, Math.min(current.sourceWidth - crop.x, frame.width / current.scaleX));
    crop.height = Math.max(0, Math.min(current.sourceHeight - crop.y, frame.height / current.scaleY));
    if (crop.width <= 0 || crop.height <= 0) return false;
    const fullSource = crop.x === 0 && crop.y === 0 &&
      crop.width === current.sourceWidth && crop.height === current.sourceHeight;

    const oldCenterX = image.x + image.width / 2;
    const oldCenterY = image.y + image.height / 2;
    const newCenterX = frame.x + frame.width / 2;
    const newCenterY = frame.y + frame.height / 2;
    const dx = newCenterX - oldCenterX;
    const dy = newCenterY - oldCenterY;
    const rotation = current.originalRotation ?? 0;
    const shear = current.originalShear ?? 0;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const tan = Math.tan((shear * Math.PI) / 180);
    const dxSheared = dx + tan * dy;
    const dxRot = dxSheared * cos - dy * sin;
    const dyRot = dxSheared * sin + dy * cos;
    const targetWorldCenterX = oldCenterX + dxRot;
    const targetWorldCenterY = oldCenterY + dyRot;
    const nextX = targetWorldCenterX - frame.width / 2;
    const nextY = targetWorldCenterY - frame.height / 2;

    const nextNode = {
      ...image,
      x: nextX,
      y: nextY,
      width: frame.width,
      height: frame.height,
    };
    if (current.originalRotation !== undefined) {
      nextNode.rotation = current.originalRotation;
    }
    if (current.originalShear !== undefined) {
      nextNode.shear = current.originalShear;
    }
    if (fullSource) delete nextNode.crop;
    else nextNode.crop = crop;
    if (
      image.x === nextNode.x && image.y === nextNode.y &&
      image.width === nextNode.width && image.height === nextNode.height &&
      image.rotation === nextNode.rotation &&
      image.shear === nextNode.shear &&
      JSON.stringify(normalizeStoredImageCrop(image.crop)) === JSON.stringify(normalizeStoredImageCrop(nextNode.crop))
    ) {
      requestRender();
      notify();
      return false;
    }
    commitEditorDocument("editor.crop.change", setDoc, {
      ...doc,
      nodes: doc.nodes.map((node) => node.id === image.id ? nextNode : node),
    });
    return true;
  }

  function reset() {
    const image = selectedImage();
    if (!image) return null;
    if (!image.crop) return null;
    const geometry = geometryOf(image);
    if (!geometry) return false;
    const doc = getDoc();
    const oldCenterX = image.x + image.width / 2;
    const oldCenterY = image.y + image.height / 2;
    const newCenterX = geometry.full.x + geometry.full.width / 2;
    const newCenterY = geometry.full.y + geometry.full.height / 2;
    const dx = newCenterX - oldCenterX;
    const dy = newCenterY - oldCenterY;
    const rotation = image.rotation ?? 0;
    const shear = image.shear ?? 0;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const tan = Math.tan((shear * Math.PI) / 180);
    const dxSheared = dx + tan * dy;
    const dxRot = dxSheared * cos - dy * sin;
    const dyRot = dxSheared * sin + dy * cos;
    const targetWorldCenterX = oldCenterX + dxRot;
    const targetWorldCenterY = oldCenterY + dyRot;
    const nextX = targetWorldCenterX - geometry.full.width / 2;
    const nextY = targetWorldCenterY - geometry.full.height / 2;
    const nextNode = {
      ...image,
      ...geometry.full,
      x: nextX,
      y: nextY,
    };
    delete nextNode.crop;
    commitEditorDocument("editor.crop.change", setDoc, {
      ...doc,
      nodes: doc.nodes.map((node) => node.id === image.id ? nextNode : node),
    });
    state = null;
    rect = null;
    requestRender();
    notify();
    return true;
  }

  function setRect(nextRect) {
    if (!state) return false;
    const bounds = state.full;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const x = Math.max(bounds.x, Math.min(nextRect.x, right - MIN_DOC_SIZE));
    const y = Math.max(bounds.y, Math.min(nextRect.y, bottom - MIN_DOC_SIZE));
    rect = {
      x,
      y,
      width: Math.max(MIN_DOC_SIZE, Math.min(nextRect.width, right - x)),
      height: Math.max(MIN_DOC_SIZE, Math.min(nextRect.height, bottom - y)),
    };
    requestRender();
    return true;
  }

  return {
    begin,
    apply,
    reset,
    setRect,
    getRect: () => rect,
    getFullBounds: () => (state ? state.full : null),
    isActive: () => Boolean(state),
    previewNode: () => {
      if (!state) return null;
      const preview = { ...state.node, ...state.full, crop: undefined };
      if (state.originalRotation !== undefined) {
        preview.rotation = 0;
      }
      if (state.originalShear !== undefined) {
        preview.shear = 0;
      }
      return preview;
    },
    cancel: () => { state = null; rect = null; },
  };
}
