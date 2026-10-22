import { drawNode } from "./render_nodes.js";
import { NODE_KIND } from "./scene_model.js";
import {
  RENDERABLE_KINDS,
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
      (RENDERABLE_KINDS.has(node.kind) ||
        node.kind === NODE_KIND.CANVAS_INSTANCE) &&
      selectionBounds([node]),
  );
}

export function renderSelectionPng(
  doc,
  nodes,
  bounds,
  options,
  { bitmapSourceOf, cache, maskSourceOf, glRenderer },
) {
  if (!bounds) return null;
  const originX = Math.floor(bounds.x);
  const originY = Math.floor(bounds.y);
  const scale =
    Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  const width = Math.max(1, Math.ceil(bounds.x + bounds.width) - originX);
  const height = Math.max(1, Math.ceil(bounds.y + bounds.height) - originY);
  const output = document.createElement("canvas");
  output.width = Math.round(width * scale);
  output.height = Math.round(height * scale);
  const ctx = output.getContext("2d");
  if (!ctx) return null;
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.translate(-originX, -originY);
  for (const node of nodes) {
    const bitmap = bitmapSourceOf ? bitmapSourceOf(node) : cache.get(node);
    if (node.kind === NODE_KIND.IMAGE && !bitmap) continue;
    drawNode(
      ctx,
      node,
      () => bitmap ?? null,
      maskSourceOf,
      glRenderer ? { renderer: glRenderer } : null,
      false,
    );
  }
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
