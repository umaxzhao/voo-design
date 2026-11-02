import { draw } from "./scene_renderer.js";
import { NODE_KIND, isHiddenByGroup } from "./scene_model.js";
import {
  RENDERABLE_KINDS,
  exportPixelSize,
  exportBackdropDocument,
  encodeCanvas,
  selectionBounds,
} from "./editor_export_bounds.js";

export function selectedExportNodes(doc, ids) {
  const wanted = new Set(ids ?? []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of doc.nodes ?? []) {
      if (node.parentId && wanted.has(node.parentId) && !wanted.has(node.id)) {
        wanted.add(node.id);
        changed = true;
      }
    }
  }
  return (doc.nodes ?? []).filter(
    (node) =>
      wanted.has(node.id) &&
      node.visible !== false &&
      !isHiddenByGroup(doc, node) &&
      (RENDERABLE_KINDS.has(node.kind) ||
        node.kind === NODE_KIND.ADJUSTMENT ||
        node.kind === NODE_KIND.GROUP ||
        node.kind === NODE_KIND.CANVAS_INSTANCE) &&
      (node.kind === NODE_KIND.ADJUSTMENT || selectionBounds([node])),
  );
}

/** Folders and adjustment metadata do not add unpainted export padding. */
export function selectedExportBounds(nodes) {
  return selectionBounds(nodes.filter((node) =>
    !node.maskBase && node.kind !== NODE_KIND.ADJUSTMENT &&
    (node.kind !== NODE_KIND.GROUP || node.isFrame)));
}

export function renderSelectionPng(
  doc,
  nodes,
  bounds,
  options,
  { bitmapSourceOf, cache, maskSourceOf, glRenderer },
) {
  if (!bounds) return null;
  const { x: originX, y: originY, width, height } = bounds;
  const size = exportPixelSize(bounds, options.scale);
  const output = document.createElement("canvas");
  output.width = size.width;
  output.height = size.height;
  const ctx = output.getContext("2d");
  if (!ctx) return null;
  draw(ctx, {
    artworkOnly: true,
    doc: { ...exportBackdropDocument(doc, options.transparent !== false), nodes, crop: bounds },
    viewport: { zoom: size.scale, panX: -originX * size.scale, panY: -originY * size.scale },
    dpr: 1,
    includeRegions: false,
    pageBackground: options.transparent === false,
    bitmapOf: (node) => bitmapSourceOf ? bitmapSourceOf(node) : cache?.get(node),
    maskOf: maskSourceOf,
    glRenderer,
    fullResolution: true,
  });
  let finalCanvas = output;
  if (options.type === "image/jpeg") {
    const flattened = document.createElement("canvas");
    flattened.width = output.width;
    flattened.height = output.height;
    const context = flattened.getContext("2d");
    if (context) {
      const backgroundColor = doc.backgroundColor;
      context.fillStyle =
        backgroundColor && backgroundColor !== "transparent"
          ? backgroundColor
          : "#ffffff";
      context.fillRect(0, 0, flattened.width, flattened.height);
      context.drawImage(output, 0, 0);
      finalCanvas = flattened;
    }
  }
  return {
    dataUrl: options.type
      ? encodeCanvas(finalCanvas, options)
      : output.toDataURL("image/png"),
    width: output.width,
    height: output.height,
    bounds: { x: originX, y: originY, width, height },
  };
}
