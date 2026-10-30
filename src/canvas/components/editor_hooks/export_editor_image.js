import { exportFilename, exportTargetName } from "../../editor/export_filename.js";
import { selectedExportNodes } from "../../editor/editor_export_selection.js";
import { exportBackdropDocument } from "../../editor/editor_export_bounds.js";
import { documentToSvg, nodesToSvg } from "../../editor/editor_svg.js";
import { saveMediaExport } from "../../media_export.js";
import { effectivePage } from "../../editor/scene_model_geometry.js";
import { getCanvasType } from "../../editor/canvas-composition-model.js";
import { expandInstancesForRaster } from "../../editor/editor_export_instances.js";
import { createSvgRasterResolver } from "../../editor/svg-raster-effects.js";
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

  const rasterOf = createSvgRasterResolver({
    bitmapOf: node => engine.getNodeBitmap?.(node),
    maskOf: node => engine.getNodeMask?.(node),
  });
  return { bitmapOf, bitmapSizeOf, maskOf, rasterOf };
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
  transparent,
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
  if (range === "slices") {
    if (!["png", "jpeg", "jpg", "webp"].includes(format))
      throw new Error("EXPORT_FORMAT_UNSUPPORTED");
    const regions = (editorDocument.nodes ?? []).filter(
      (node) => node.kind === "region" && node.visible !== false,
    );
    if (regions.length === 0) {
      throw new Error("EXPORT_SELECTION_EMPTY");
    }
    const fullPagePng = await exportRaster(engine, {
      type: "image/png",
      scale,
      resolveCanvas,
      transparent,
    });
    if (!fullPagePng) throw new Error("EXPORT_TOO_LARGE");

    const fullImg = typeof Image !== "undefined" ? new Image() : null;
    if (fullImg) {
      await new Promise((resolve, reject) => {
        fullImg.onload = resolve;
        fullImg.onerror = reject;
        fullImg.src = fullPagePng;
      });
    }

    const page = effectivePage(editorDocument);
    const exportScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const slices = [];

    for (const region of regions) {
      const rx = (region.x - page.x) * exportScale;
      const ry = (region.y - page.y) * exportScale;
      const rw = Math.max(1, Math.round(region.width * exportScale));
      const rh = Math.max(1, Math.round(region.height * exportScale));

      let sliceDataUrl = fullPagePng;
      if (typeof document !== "undefined") {
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = rw;
        sliceCanvas.height = rh;
        const sctx = sliceCanvas.getContext("2d");
        if (sctx && mime === "image/jpeg") {
          sctx.fillStyle = editorDocument.backgroundColor && editorDocument.backgroundColor !== "transparent" ? editorDocument.backgroundColor : "#ffffff";
          sctx.fillRect(0, 0, rw, rh);
        }
        if (sctx && fullImg) {
          sctx.drawImage(fullImg, rx, ry, rw, rh, 0, 0, rw, rh);
        }
        sliceDataUrl = sliceCanvas.toDataURL(
          mime,
          mime === "image/png" ? undefined : quality,
        );
      }
      const sliceName = (region.label || region.name || `slice-${region.id}`)
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_");
      slices.push({
        id: region.id,
        name: `${name}-${sliceName}`,
        dataUrl: sliceDataUrl,
      });
    }

    for (const slice of slices) {
      await saveMediaExport({
        dataUrl: slice.dataUrl,
        name: exportFilename(slice.name, format, scale),
        format,
        title,
        signal,
      });
    }

    return {
      path: slices.map((s) => s.name).join(", "),
      slices,
    };
  } else if (
    range === "selection" &&
    Array.isArray(selectedIds) &&
    selectedIds.length > 0
  ) {
    if (format === "svg") {
      const selectedNodes = selectedExportNodes(editorDocument, selectedIds);
      const { bitmapOf, bitmapSizeOf, maskOf, rasterOf } = createSvgAssetResolvers(
        editorDocument,
        engine,
      );
      const expanded = expandInstancesForRaster(
        { ...editorDocument, nodes: selectedNodes },
        resolveCanvas,
      );
      const svg = nodesToSvg(expanded.nodes, {
        backgroundColor: exportBackdropDocument(editorDocument, transparent !== false).backgroundColor,
        bitmapOf,
        bitmapSizeOf,
        maskOf,
        rasterOf,
        measureCtx: document.createElement("canvas").getContext("2d"),
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
        transparent,
        resolveCanvas,
      });
      if (!exported?.dataUrl) {
        throw new Error("EXPORT_SELECTION_EMPTY");
      }
      signal?.throwIfAborted();
      const { jpegPageToPdf } = await import("./export_editor_pdf.js");
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
        transparent,
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
      transparent,
    });
    signal?.throwIfAborted();
    const { jpegPageToPdf } = await import("./export_editor_pdf.js");
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
    const { bitmapOf, bitmapSizeOf, maskOf, rasterOf } = createSvgAssetResolvers(
      editorDocument,
      engine,
    );
    const expanded = expandInstancesForRaster(editorDocument, resolveCanvas);
    const svg = documentToSvg(exportBackdropDocument(expanded, transparent), {
      bitmapOf,
      bitmapSizeOf,
      maskOf,
      rasterOf,
      transparent,
      measureCtx: document.createElement("canvas").getContext("2d"),
    });
    dataUrl = bytesToDataUrl(new TextEncoder().encode(svg), "image/svg+xml");
  } else {
    dataUrl = await exportRaster(engine, {
      type: mime,
      quality: mime === "image/png" ? undefined : quality,
      scale,
      resolveCanvas,
      transparent,
    });
  }
  if (!dataUrl || dataUrl.length <= "data:,".length)
    throw new Error("EXPORT_TOO_LARGE");
  signal?.throwIfAborted();
  return saveMediaExport({
    dataUrl,
    name: exportFilename(exportTargetName(name, range, editorDocument.nodes, selectedIds), format, scale),
    format, title, signal,
  });
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

/**
 * Renders the live engine's focused page as an SVG string, with the same bitmap
 * and mask resolvers the export dialog uses, so raster content is embedded.
 */
export function renderEngineSvg(engine) {
  const editorDocument = assertExportableDocument(engine.getDocument?.());
  const { bitmapOf, bitmapSizeOf, maskOf, rasterOf } = createSvgAssetResolvers(
    editorDocument,
    engine,
  );
  const expanded = expandInstancesForRaster(editorDocument, null);
  return documentToSvg(expanded, { bitmapOf, bitmapSizeOf, maskOf, rasterOf });
}
