import { documentToSvg, nodesToSvg } from "../../editor/editor_svg.js";
import { saveMediaExport } from "../../media_export.js";
import { effectivePage } from "../../editor/scene_model_geometry.js";
import { jpegPageToPdf } from "./export_editor_pdf.js";
import { captureThreeScenePreview } from "./three-scene-preview.js";
import { getCanvasType } from "../../editor/canvas-composition-model.js";
import { expandInstancesForRasterAsync } from "../../editor/editor_export_instances.js";
import {
  bytesToDataUrl,
  mediaExportFormat,
} from "../../../shared/media-export.js";

/** Fail before encoding when a partially hydrated page would export blank. */
export function assertExportableDocument(editorDocument) {
  if (
    !editorDocument ||
    typeof editorDocument !== "object" ||
    !Number.isFinite(editorDocument.width) ||
    !Number.isFinite(editorDocument.height) ||
    editorDocument.width <= 0 ||
    editorDocument.height <= 0 ||
    !Array.isArray(editorDocument.nodes)
  ) {
    throw new Error("EXPORT_DOCUMENT_INVALID");
  }
  return editorDocument;
}

function exportRaster(engine, options) {
  const exportImage = engine.exportImageAsync ?? engine.exportImage;
  if (typeof exportImage !== "function")
    throw new Error("EXPORT_RENDERER_UNAVAILABLE");
  return exportImage.call(engine, options);
}

function createSvgAssetResolvers(editorDocument, engine) {
  const bitmapOf = (imageId) => {
    const node = editorDocument.nodes?.find(
      (entry) => entry.imageId === imageId,
    );
    const bitmap = node ? engine.getNodeBitmap?.(node) : null;
    if (!bitmap) return null;
    if (typeof bitmap === "string" && bitmap.startsWith("data:")) return bitmap;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.naturalWidth ?? bitmap.width;
    canvas.height = bitmap.naturalHeight ?? bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(bitmap, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const bitmapSizeOf = (imageId) => {
    const node = editorDocument.nodes?.find(
      (entry) => entry.imageId === imageId,
    );
    const bitmap = node ? engine.getNodeBitmap?.(node) : null;
    return bitmap
      ? {
          width: bitmap.naturalWidth ?? bitmap.width,
          height: bitmap.naturalHeight ?? bitmap.height,
        }
      : null;
  };

  const maskOf = (maskId) => {
    const node = editorDocument.nodes?.find((entry) => entry.maskId === maskId);
    const mask = node ? engine.getNodeMask?.(node) : null;
    if (!mask) return null;
    if (typeof mask === "string" && mask.startsWith("data:")) return mask;
    const canvas = document.createElement("canvas");
    canvas.width = mask.naturalWidth ?? mask.width;
    canvas.height = mask.naturalHeight ?? mask.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(mask, 0, 0);
      // Matte is an alpha mask. Standard SVG 1.1 masks use luminance by default,
      // so set RGB to white while preserving alpha. This ensures the mask works
      // identically under both luminance and alpha interpretation.
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL("image/png");
  };

  return { bitmapOf, bitmapSizeOf, maskOf };
}

/** Encode the current document, keeping the DOM document distinct from it. */
export async function exportEditorImage({
  engine,
  format,
  quality,
  scale,
  name,
  title,
  signal,
  range = "frame",
  selectedIds = [],
  resolveCanvas = null,
}) {
  signal?.throwIfAborted();
  const { mime } = mediaExportFormat(format);
  if (!mime.startsWith("image/") && format !== "pdf")
    throw new Error("EXPORT_FORMAT_UNSUPPORTED");
  if (engine.getSelectionTransform?.())
    await engine.applySelectionTransform?.();
  signal?.throwIfAborted();
  await engine.flushTransforms?.();
  signal?.throwIfAborted();
  await engine.flushPaints?.();
  signal?.throwIfAborted();
  await engine.flushMasks();
  await engine.prepareFrame?.(engine.getPlaybackState?.().time ?? 0);
  signal?.throwIfAborted();
  const editorDocument = assertExportableDocument(engine.getDocument?.());
  let dataUrl;
  const canCaptureScenePage =
    (mime.startsWith("image/") && format !== "psd") || format === "pdf";
  const scenePageCapture =
    canCaptureScenePage &&
    range !== "selection" &&
    getCanvasType(editorDocument) === "3d";
  if (scenePageCapture) {
    const page = effectivePage(editorDocument);
    const exportScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const preview = captureThreeScenePreview(
      editorDocument.canvasId,
      document,
      Math.max(1, Math.round(page.width * exportScale)),
      Math.max(1, Math.round(page.height * exportScale)),
    );
    if (format === "svg") {
      const page = effectivePage(editorDocument);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}"><image width="${page.width}" height="${page.height}" href="${preview}"/></svg>`;
      dataUrl = bytesToDataUrl(new TextEncoder().encode(svg), "image/svg+xml");
    } else if (format === "pdf") {
      const page = effectivePage(editorDocument);
      dataUrl = await jpegPageToPdf({
        dataUrl: preview,
        width: page.width,
        height: page.height,
      });
    } else if (mime === "image/png" && (scale ?? 1) === 1) {
      dataUrl = preview;
    } else if (mime.startsWith("image/")) {
      dataUrl = await encodeScenePreview({
        preview,
        editorDocument,
        mime,
        quality,
        scale,
      });
    }
  } else if (
    range === "selection" &&
    Array.isArray(selectedIds) &&
    selectedIds.length > 0
  ) {
    if (format === "svg") {
      const wanted = new Set(selectedIds);
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of editorDocument.nodes ?? []) {
          if (
            node.parentId &&
            wanted.has(node.parentId) &&
            !wanted.has(node.id)
          ) {
            wanted.add(node.id);
            changed = true;
          }
        }
      }
      const selectedNodes = (editorDocument.nodes ?? []).filter((node) =>
        wanted.has(node.id),
      );
      const { bitmapOf, bitmapSizeOf, maskOf } = createSvgAssetResolvers(
        editorDocument,
        engine,
      );
      const instanceBitmaps = new Map();
      const expanded = await expandInstancesForRasterAsync(
        { ...editorDocument, nodes: selectedNodes },
        resolveCanvas,
        instanceBitmaps,
        Number.isFinite(scale) && scale > 0 ? scale : 1,
      );
      const svg = nodesToSvg(expanded.nodes, {
        bitmapOf: (imageId) =>
          instanceBitmaps.get(imageId)?.toDataURL("image/png") ??
          bitmapOf(imageId),
        bitmapSizeOf,
        maskOf,
        resolveCanvas,
      });
      if (!svg) {
        throw new Error("EXPORT_SELECTION_EMPTY");
      }
      dataUrl = bytesToDataUrl(new TextEncoder().encode(svg), "image/svg+xml");
    } else if (format === "pdf") {
      const exported = await (
        engine.exportSelectionPngAsync ?? engine.exportSelectionPng
      )?.(selectedIds, {
        type: "image/png",
        scale,
        resolveCanvas,
      });
      if (!exported?.dataUrl) {
        throw new Error("EXPORT_SELECTION_EMPTY");
      }
      signal?.throwIfAborted();
      dataUrl = await jpegPageToPdf({
        dataUrl: exported.dataUrl,
        width: exported.bounds.width,
        height: exported.bounds.height,
      });
    } else {
      const exported = await (
        engine.exportSelectionPngAsync ?? engine.exportSelectionPng
      )?.(selectedIds, {
        type: mime,
        quality: mime === "image/png" ? undefined : quality,
        scale,
        resolveCanvas,
      });
      if (!exported?.dataUrl) {
        throw new Error("EXPORT_SELECTION_EMPTY");
      }
      dataUrl = exported.dataUrl;
    }
  } else if (format === "pdf") {
    const page = effectivePage(editorDocument);
    const png = await exportRaster(engine, {
      type: "image/png",
      scale,
      resolveCanvas,
    });
    signal?.throwIfAborted();
    dataUrl = await jpegPageToPdf({
      dataUrl: png,
      width: page.width,
      height: page.height,
    });
  } else if (format === "psd") {
    const bytes = new Uint8Array(await engine.exportPsd());
    signal?.throwIfAborted();
    dataUrl = bytesToDataUrl(bytes, "image/vnd.adobe.photoshop");
  } else if (format === "svg") {
    const { bitmapOf, bitmapSizeOf, maskOf } = createSvgAssetResolvers(
      editorDocument,
      engine,
    );
    const instanceBitmaps = new Map();
    const expanded = await expandInstancesForRasterAsync(
      editorDocument,
      resolveCanvas,
      instanceBitmaps,
      Number.isFinite(scale) && scale > 0 ? scale : 1,
    );
    const svg = documentToSvg(expanded, {
      bitmapOf: (imageId) =>
        instanceBitmaps.get(imageId)?.toDataURL("image/png") ??
        bitmapOf(imageId),
      bitmapSizeOf,
      maskOf,
    });
    dataUrl = bytesToDataUrl(new TextEncoder().encode(svg), "image/svg+xml");
  } else {
    dataUrl = await exportRaster(engine, {
      type: mime,
      quality: mime === "image/png" ? undefined : quality,
      scale,
      resolveCanvas,
    });
  }
  if (!dataUrl || dataUrl.length <= "data:,".length)
    throw new Error("EXPORT_TOO_LARGE");
  signal?.throwIfAborted();
  return saveMediaExport({ dataUrl, name, format, title, signal });
}

async function encodeScenePreview({
  preview,
  editorDocument,
  mime,
  quality,
  scale,
}) {
  const image = new Image();
  image.src = preview;
  await image.decode();
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const page = effectivePage(editorDocument);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(page.width * effectiveScale));
  canvas.height = Math.max(1, Math.round(page.height * effectiveScale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("EXPORT_CANVAS_UNAVAILABLE");
  if (mime === "image/jpeg") {
    const background = editorDocument.scene3d?.backgroundColor;
    context.fillStyle =
      typeof background === "string" && background !== "transparent"
        ? background
        : editorDocument.backgroundColor &&
            editorDocument.backgroundColor !== "transparent"
          ? editorDocument.backgroundColor
          : "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, quality);
}
