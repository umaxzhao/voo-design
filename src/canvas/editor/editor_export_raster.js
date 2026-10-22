/**
 * Full-resolution raster render-outs of the document.
 */

import { hasBlendModes, normalizeCornerRadius } from "./scene_model_core.js";
import {
  DEFAULT_BLEND_MODE,
  effectivePage,
  findNode,
  NODE_KIND,
} from "./scene_model.js";
import { isDeformed } from "./scene_state_contract.js";
import { draw } from "./scene_renderer.js";
import { drawNode } from "./render_nodes.js";
import {
  RENDERABLE_KINDS,
  encodeCanvas,
  selectionBounds,
} from "./editor_export_bounds.js";
import { createRegionExport } from "./editor_export_regions.js";
import { normalizeImageCrop } from "./image_layer_crop.js";
import {
  expandInstancesForRaster,
} from "./editor_export_instances.js";
import {
  renderSelectionPng,
  selectedExportNodes,
} from "./editor_export_selection.js";

export function createExport({
  getDoc,
  cache,
  bitmapSourceOf,
  maskSourceOf,
  glRenderer,
  fullResBitmapOf = null,
  resolveCanvas = null,
}) {
  /**
   * The page rendered at full resolution, as a canvas.
   *
   * Separate from exportPng because two callers want two different things
   * from the same render: one wants a data URL to hand on, and the region
   * sampler wants the pixels themselves. Encoding to PNG only to decode it
   * again would be the same picture, slower.
   */
  function renderPngCanvas(doc, scale) {
    // A non-destructive crop exports the visible page: the output is the crop
    // rect's size, rendered through the same page the stage shows.
    const page = effectivePage(doc);
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(page.width * scale));
    output.height = Math.max(1, Math.round(page.height * scale));
    const outputCtx = output.getContext("2d");
    if (!outputCtx) return null;
    draw(outputCtx, {
      doc,
      // Shift the page origin to the crop's top-left so the cropped content
      // fills the output canvas exactly; `scale` renders at 2×/3× output.
      viewport: { zoom: scale, panX: -page.x * scale, panY: -page.y * scale },
      dpr: 1,
      selectionRect: null,
      cropRect: null,
      hiddenNodeId: null,
      // Regions are instructions about the picture, never part of it.
      includeRegions: false,
      // The white page is on-screen dressing only — eraser, lasso and cutout
      // pixels must survive the export as transparency. The exception is a
      // document with blend modes: those composite against the backdrop, so
      // the export paints the same page the preview showed (draw() fills it
      // with doc.backgroundColor, falling back to the white page) or the
      // blended colours would come out different over transparent black.
      pageBackground: hasBlendModes(doc),
      // The live paint canvas when a stroke is mid-persist, the decoded
      // bitmap otherwise — exactly what the stage composes with.
      bitmapOf: (node) =>
        bitmapSourceOf ? bitmapSourceOf(node) : cache.get(node),
      maskOf: maskSourceOf,
      glRenderer,
      // Never the preview resolution: an export renders every bitmap at its
      // natural size, through the same shader the preview used.
      fullResolution: true,
    });
    return output;
  }

  function exportPngCanvas(scale = 1, canvasResolver = resolveCanvas) {
    const doc = expandInstancesForRaster(getDoc(), canvasResolver);
    return renderPngCanvas(doc, scale);
  }

  function exportPngCanvasAsync(scale = 1, canvasResolver = resolveCanvas) {
    return exportPngCanvas(scale, canvasResolver);
  }

  function exportPng() {
    return exportPngCanvas()?.toDataURL("image/png") ?? null;
  }

  /**
   * The full page rendered at document resolution, encoded in the requested
   * format. PNG stays lossless; JPEG and WebP take a 0..1 quality. `scale`
   * renders at 2×/3× the page size (retina exports). Used by the user-facing
   * export action — internal callers (live previews, model references) keep
   * PNG for fidelity.
   */
  function exportImage(options) {
    const canvas = exportPngCanvas(
      options?.scale ?? 1,
      options?.resolveCanvas ?? resolveCanvas,
    );
    if (!canvas) return null;
    if (options?.type !== "image/jpeg") return encodeCanvas(canvas, options);
    // JPEG has no alpha channel. Composite the rendered page over its visible
    // background before encoding so transparent pixels do not turn black.
    const flattened = document.createElement("canvas");
    flattened.width = canvas.width;
    flattened.height = canvas.height;
    const context = flattened.getContext("2d");
    if (!context) return null;
    const backgroundColor = getDoc().backgroundColor;
    context.fillStyle =
      backgroundColor && backgroundColor !== "transparent"
        ? backgroundColor
        : "#ffffff";
    context.fillRect(0, 0, flattened.width, flattened.height);
    context.drawImage(canvas, 0, 0);
    return encodeCanvas(flattened, options);
  }

  async function exportImageAsync(options) {
    const canvas = await exportPngCanvasAsync(
      options?.scale ?? 1,
      options?.resolveCanvas ?? resolveCanvas,
    );
    if (!canvas) return null;
    if (options?.type !== "image/jpeg") return encodeCanvas(canvas, options);
    const flattened = document.createElement("canvas");
    flattened.width = canvas.width;
    flattened.height = canvas.height;
    const context = flattened.getContext("2d");
    if (!context) return null;
    const backgroundColor = getDoc().backgroundColor;
    context.fillStyle =
      backgroundColor && backgroundColor !== "transparent"
        ? backgroundColor
        : "#ffffff";
    context.fillRect(0, 0, flattened.width, flattened.height);
    context.drawImage(canvas, 0, 0);
    return encodeCanvas(flattened, options);
  }

  /**
   * Renders one image node's bitmap — with any active warp deformation — at
   * natural resolution. This provides the exact visual content that AI object
   * selection, matting, and segment models require.
   */
  function renderIsolatedNodeCanvas(node, bitmap, options = {}) {
    const hasWarp = isDeformed(node);
    const naturalW = bitmap.naturalWidth ?? bitmap.width ?? node.width;
    const naturalH = bitmap.naturalHeight ?? bitmap.height ?? node.height;
    const effectiveCrop = options.uncropped ? null : node.crop;
    const sourceCrop = normalizeImageCrop(
      { ...node, crop: effectiveCrop },
      naturalW,
      naturalH,
    );
    const outputWidth = effectiveCrop ? sourceCrop.width : naturalW;
    const outputHeight = effectiveCrop ? sourceCrop.height : naturalH;
    const w = Math.max(
      1,
      Math.round(hasWarp ? node.width || outputWidth : outputWidth),
    );
    const h = Math.max(
      1,
      Math.round(hasWarp ? node.height || outputHeight : outputHeight),
    );
    const output = document.createElement("canvas");
    output.width = w;
    output.height = h;
    const ctx = output.getContext("2d");
    if (!ctx) return null;
    const scaleX = node.width > 0 ? w / node.width : 1;
    const cornerRadius =
      node.cornerRadius && typeof node.cornerRadius === "object"
        ? normalizeCornerRadius(
            Object.fromEntries(
              ["tl", "tr", "br", "bl"].map((corner) => [
                corner,
                Number.isFinite(node.cornerRadius[corner])
                  ? node.cornerRadius[corner] * scaleX
                  : 0,
              ]),
            ),
          )
        : node.cornerRadius
          ? node.cornerRadius * scaleX
          : 0;
    const isolatedNode = {
      ...node,
      crop: effectiveCrop,
      x: 0,
      y: 0,
      width: w,
      height: h,
      rotation: 0,
      shear: 0,
      flipH: false,
      flipV: false,
      flipX: false,
      flipY: false,
      opacity: 1,
      blendMode: DEFAULT_BLEND_MODE,
      effects: null,
      visible: true,
      cornerRadius,
      ...(hasWarp
        ? null
        : {
            warpMesh: null,
            puppetPins: null,
            perspectiveCorners: null,
          }),
    };
    drawNode(
      ctx,
      isolatedNode,
      () => bitmap,
      maskSourceOf,
      glRenderer
        ? { renderer: glRenderer, fullResolution: true }
        : { fullResolution: true },
      false,
    );
    return output;
  }

  function exportNodePng(id, options = {}) {
    const node = findNode(getDoc(), id);
    if (!node || node.kind !== NODE_KIND.IMAGE) return null;
    const bitmap = bitmapSourceOf ? bitmapSourceOf(node) : cache.get(node);
    if (!bitmap) return null;
    const output = renderIsolatedNodeCanvas(node, bitmap, options);
    return output ? output.toDataURL("image/png") : null;
  }

  /**
   * The selected layers composited onto ONE transparent canvas, cropped to
   * their union bounding box — the raster a system-clipboard copy wants.
   */
  function exportSelectionPng(ids, options = {}) {
    const doc = getDoc();
    const selected = selectedExportNodes(doc, ids);
    const bounds = selectionBounds(selected);
    if (!bounds) return null;
    const expanded = expandInstancesForRaster(
      { ...doc, nodes: selected },
      options.resolveCanvas ?? resolveCanvas,
    );
    const nodes = expanded.nodes.filter((node) =>
      RENDERABLE_KINDS.has(node.kind),
    );
    return renderSelectionPng(doc, nodes, bounds, options, {
      bitmapSourceOf,
      cache,
      maskSourceOf,
      glRenderer,
    });
  }

  async function exportSelectionPngAsync(ids, options = {}) {
    const doc = getDoc();
    const selected = selectedExportNodes(doc, ids);
    const bounds = selectionBounds(selected);
    if (!bounds) return null;
    const expanded = expandInstancesForRaster(
      { ...doc, nodes: selected },
      options.resolveCanvas ?? resolveCanvas,
    );
    const nodes = expanded.nodes.filter((node) =>
      RENDERABLE_KINDS.has(node.kind),
    );
    return renderSelectionPng(doc, nodes, bounds, options, {
      bitmapSourceOf,
      cache,
      maskSourceOf,
      glRenderer,
    });
  }

  /** exportNodePng, but encoded in the requested format (e.g. JPEG for upload). */
  function exportNodeImage(id, options) {
    const node = findNode(getDoc(), id);
    if (!node || node.kind !== NODE_KIND.IMAGE) return null;
    const bitmap = bitmapSourceOf ? bitmapSourceOf(node) : cache.get(node);
    if (!bitmap) return null;
    const output = renderIsolatedNodeCanvas(node, bitmap);
    return output ? encodeCanvas(output, options) : null;
  }

  /**
   * The whole page at the SOURCE resolution, re-decoding the full-resolution
   * original for any node that was opened as a reduced-resolution preview.
   */
  async function exportFullResPng() {
    const doc = getDoc();
    const page = effectivePage(doc);
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(page.width));
    output.height = Math.max(1, Math.round(page.height));
    const outputCtx = output.getContext("2d");
    if (!outputCtx) return null;
    const fullRes = new Map();
    for (const node of doc.nodes ?? []) {
      if (
        node.kind === NODE_KIND.IMAGE &&
        node.reducedPreview &&
        node.imageId
      ) {
        const bitmap = await fullResBitmapOf?.(node);
        if (bitmap) fullRes.set(node.id, bitmap);
      }
    }
    draw(outputCtx, {
      doc,
      viewport: { zoom: 1, panX: -page.x, panY: -page.y },
      dpr: 1,
      selectionRect: null,
      cropRect: null,
      hiddenNodeId: null,
      includeRegions: false,
      pageBackground: hasBlendModes(doc),
      bitmapOf: (node) =>
        fullRes.get(node.id) ?? (bitmapSourceOf ?? ((n) => cache.get(n)))(node),
      maskOf: maskSourceOf,
      glRenderer,
      fullResolution: true,
    });
    return output.toDataURL("image/png");
  }

  const regionExports = createRegionExport({
    getDoc,
    exportPngCanvas,
    exportPngCanvasAsync,
    exportNodePng,
  });

  return {
    exportPng,
    exportImage,
    exportImageAsync,
    exportPngCanvas,
    exportPngCanvasAsync,
    exportFullResPng,
    exportNodePng,
    exportSelectionPng,
    exportSelectionPngAsync,
    exportNodeImage,
    ...regionExports,
  };
}
