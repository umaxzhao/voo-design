/**
 * PSD → `.voo` envelope: reads a Photoshop file and rebuilds it as an editor
 * design document, so opening a PSD goes through the same hydrate-and-load
 * path as opening a saved `.voo`.
 *
 * Mapping:
 *  - each pixel layer becomes an image node placed at its document position;
 *    its pixels travel as a PNG data URL in `images`, keyed by the node's imageId;
 *  - layer folders become group nodes whose members point back via `parentId`;
 *  - hidden flags, opacity and blend modes carry over.
 *
 * Not rebuilt yet: adjustment layers, layer effects, masks and text editability.
 * Text and smart-object layers arrive as the pixels Photoshop rendered for them.
 *
 * Layer order: ag-psd keeps the file's layer records, which this codebase's PSD
 * export writes topmost-first, so the walk below reverses them into the editor's
 * bottom-first `doc.nodes` order.
 */

import { readPsd } from "ag-psd";
import {
  createDocument,
  createImageNode,
  getBaseDefaults,
} from "../editor/scene_doc_factory.js";
import { createGroupNode } from "../editor/scene_model_groups.js";
import { BLEND_MODE_TO_PSD } from "../editor/psd_export.js";
import { VOO_FILE_FORMAT } from "../../../electron/voo_format.js";

const PSD_TO_BLEND_MODE = Object.fromEntries(
  Object.entries(BLEND_MODE_TO_PSD).map(([mode, psdName]) => [psdName, mode]),
);

/** Pixel layers without a bitmap are skipped rather than placed as empty boxes. */
function hasPixels(layer) {
  const pixels = layer.imageData;
  return Boolean(pixels && pixels.width > 0 && pixels.height > 0);
}

/** PNG data URL from ag-psd pixel data. Needs a DOM canvas, as the editor does. */
export function pixelsToPngDataUrl({ width, height, data }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("psd-canvas-unavailable");
  context.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

function baseLayerFields(layer) {
  return {
    ...getBaseDefaults(),
    visible: !layer.hidden,
    opacity: typeof layer.opacity === "number" ? layer.opacity : 1,
    blendMode: PSD_TO_BLEND_MODE[layer.blendMode] ?? getBaseDefaults().blendMode,
  };
}

/**
 * Turns one layer (and, for folders, its children) into flat editor nodes.
 * `out` collects nodes in topmost-first pre-order; `assets` collects PNGs.
 * Returns the bounding box of what was produced, or null if nothing was.
 */
function collectLayer(layer, parentId, out, assets) {
  const name = layer.name || "Layer";

  if (Array.isArray(layer.children)) {
    const groupIndex = out.length;
    const group = {
      ...createGroupNode({ x: 0, y: 0, width: 0, height: 0, parentId }),
      ...baseLayerFields(layer),
      name,
    };
    out.push(group);
    const bounds = collectLayers(layer.children, group.id, out, assets);
    if (!bounds) {
      out.splice(groupIndex, 1);
      return null;
    }
    Object.assign(group, bounds);
    return bounds;
  }

  if (!hasPixels(layer)) return null;

  const { width, height } = layer.imageData;
  const imageId = `img-${crypto.randomUUID()}`;
  assets[imageId] = pixelsToPngDataUrl(layer.imageData);
  const node = {
    ...createImageNode({
      x: layer.left ?? 0,
      y: layer.top ?? 0,
      width,
      height,
      imageId,
      name,
    }),
    ...baseLayerFields(layer),
    ...(parentId ? { parentId } : {}),
  };
  out.push(node);
  return { x: node.x, y: node.y, width, height };
}

/**
 * Walks a layer list and returns the union box of everything it produced.
 * Groups use the same box (`x/y/width/height`) so the layers panel can show them.
 */
function collectLayers(layers, parentId, out, assets) {
  let box = null;
  for (const layer of layers) {
    const childBox = collectLayer(layer, parentId, out, assets);
    if (!childBox) continue;
    box = box ? unionBox(box, childBox) : childBox;
  }
  return box;
}

function unionBox(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Parses PSD bytes into a v1 `.voo` envelope (`images` map, single design document).
 *
 * Throws when the bytes are not a readable PSD: a failed parse must surface to the
 * user rather than produce an empty canvas.
 */
export function psdBytesToVooFile(bytes) {
  const psd = readPsd(bytes, {
    useImageData: true,
    skipThumbnail: true,
  });
  if (!psd || !Number.isFinite(psd.width) || !Number.isFinite(psd.height)) {
    throw new Error("invalid-psd-file");
  }

  const topmostFirst = [];
  const images = {};
  collectLayers(psd.children ?? [], null, topmostFirst, images);

  const doc = createDocument(psd.width, psd.height, "transparent");
  // Reversing the whole pre-order list keeps every sibling set in bottom-first
  // order, and a group's members still resolve through their parentId.
  doc.nodes = topmostFirst.reverse();

  return {
    format: VOO_FILE_FORMAT,
    version: 1,
    document: doc,
    images,
  };
}
