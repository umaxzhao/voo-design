import { getSetting } from "../../shared/settings.js";
import { runImageJob } from "./image_generation.js";
import { traceBitmapToPaths } from "./image_trace.js";
import { commitAssetExpansion } from "./agent-asset-transaction.js";
import { TOOL_ERROR, SETTING, assetTargetGuard, requireEditor, nodeOf, toolError, invalidArgs, finiteOrNull, transformPathData, groupNodes } from "./canvas-asset-shared.js";
/* ------------------------------------------------------------------ vectorize_image */

export const VECTORIZE_IMAGE_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "vectorize_image",
    description: "Trace a raster layer into editable vector paths (local, no provider needed). Use it for flat logos, " + "marks, icons or posters; photographs trace into many paths. Returns {layerIds, groupId, colors, paths, warnings}.",
    parameters: {
      type: "object",
      properties: {
        layerId: {
          type: "string",
          description: "Image layer to trace."
        },
        colors: {
          type: "number",
          description: "Palette size 2-16 (default 6)."
        },
        minArea: {
          type: "number",
          description: "Drop contours smaller than this pixel area (default 24)."
        },
        width: {
          type: "number",
          description: "Output width (default: source width)."
        },
        height: {
          type: "number",
          description: "Output height (default: keep aspect)."
        },
        x: {
          type: "number",
          description: "Optional canvas x (default: right of source)."
        },
        y: {
          type: "number",
          description: "Optional canvas y."
        },
        name: {
          type: "string"
        }
      },
      required: ["layerId"]
    }
  }
});
function imageSourceOf(node, editor = null) {
  if (!node) return null;
  if (typeof node.src === "string") return node.src;
  const fills = [node.fill, ...(node.fills ?? [])].flat().filter(Boolean);
  for (const fill of fills) {
    if (fill?.type === "image" && typeof fill.url === "string") return fill.url;
  }
  // Imported/pasted projects normally keep bitmap IDs, not public source URLs.
  return node.imageId ? editor?.exportNodePng?.(node.id) ?? null : null;
}
async function decodeImageToBitmap(url) {
  if (typeof createImageBitmap === "function" && typeof fetch === "function" && /^https?:|^blob:|^data:/.test(url)) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(bitmap.width, bitmap.height) : null;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Image decoding canvas unavailable");
          ctx.drawImage(bitmap, 0, 0);
          const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
          return {
            data: imageData.data,
            width: bitmap.width,
            height: bitmap.height
          };
        }
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to the Image element path.
    }
  }
  if (typeof Image === "undefined" || typeof document === "undefined") return null;
  const image = await new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!image) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth ?? image.width;
  canvas.height = image.naturalHeight ?? image.height;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    data: imageData.data,
    width: canvas.width,
    height: canvas.height
  };
}
export async function vectorizeImage(args = {}, context = {}) {
  const editor = requireEditor();
  const assertTarget = assetTargetGuard(editor, context.signal);
  const source = nodeOf(editor, args.layerId);
  if (!source) throw toolError(TOOL_ERROR.NODE_NOT_FOUND, `Unknown layerId: ${args.layerId}`);
  const url = editor.exportNodePng?.(source.id) ?? imageSourceOf(source, editor);
  if (!url) {
    throw toolError(TOOL_ERROR.IMAGE_SOURCE_REQUIRED, "The layer has no raster source; select an image layer.");
  }
  const decoder = context.decodeImage ?? decodeImageToBitmap;
  const bitmap = await decoder(url);
  if (!bitmap?.data?.length) {
    throw toolError(TOOL_ERROR.IMAGE_SOURCE_REQUIRED, "Could not decode the source image (a data URL export may be needed).");
  }
  assertTarget();
  const traced = traceBitmapToPaths(bitmap, {
    maxColors: Math.max(2, Math.min(16, finiteOrNull(args.colors) ?? 6)),
    minArea: Math.max(1, finiteOrNull(args.minArea) ?? 24)
  });
  const targetWidth = Math.max(1, finiteOrNull(args.width) ?? traced.width);
  const targetHeight = Math.max(1, finiteOrNull(args.height) ?? Math.round(traced.height / traced.width * targetWidth));
  const scaleX = targetWidth / traced.width;
  const scaleY = targetHeight / traced.height;
  const origin = {
    x: finiteOrNull(args.x) ?? Math.round((finiteOrNull(source.x) ?? 0) + (finiteOrNull(source.width) ?? 0) + 40),
    y: finiteOrNull(args.y) ?? finiteOrNull(source.y) ?? 0
  };
  return commitAssetExpansion(editor, () => {
    const ids = [];
    for (const layer of traced.layers) {
      for (const path of layer.paths) {
        const d = transformPathData(path.d, {
          x: origin.x,
          y: origin.y,
          scaleX,
          scaleY
        });
        if (!d) continue;
        const result = editor.addPenNode?.({
          svgD: d,
          fill: layer.color
        });
        if (result?.nodeId) {
          editor.updateNode?.(result.nodeId, {
            name: `Vector ${layer.color}`
          });
          ids.push(result.nodeId);
        }
      }
    }
    if (!ids.length) throw toolError(TOOL_ERROR.VECTOR_EMPTY, traced.warnings.join("; ") || "Nothing to trace.");
    const groupId = groupNodes(editor, ids, args.name ?? "Vectorized image");
    return {
      ok: true,
      layerIds: ids,
      groupId,
      colors: traced.palette,
      paths: ids.length,
      warnings: traced.warnings
    };
  }, "AI: Vectorize image");
}

/* ------------------------------------------------------------------ edit_image */

export const EDIT_IMAGE_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "edit_image",
    description: "Edit an existing image layer with the configured image provider: remove-background (cutout) or " + "replace-background (prompt describes the new background). Requires agent.imageProviderId / " + "imageModelId and an http(s) or embedded source image. Places the result as a new image layer next to the source.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["remove-background", "replace-background"]
        },
        layerId: {
          type: "string",
          description: "Source image layer."
        },
        prompt: {
          type: "string",
          description: "Required for replace-background; describes the new background."
        },
        name: {
          type: "string"
        }
      },
      required: ["operation", "layerId"]
    }
  }
});
export async function editImage(args = {}, context = {}) {
  const editor = requireEditor();
  const assertTarget = assetTargetGuard(editor, context.signal);
  const operation = String(args.operation ?? "");
  if (!["remove-background", "replace-background"].includes(operation)) {
    invalidArgs(TOOL_ERROR.INVALID_ARGS, `Unsupported operation: ${operation}`);
  }
  if (operation === "replace-background" && !String(args.prompt ?? "").trim()) {
    invalidArgs(TOOL_ERROR.INVALID_ARGS, "prompt is required for replace-background.");
  }
  const source = nodeOf(editor, args.layerId);
  if (!source) throw toolError(TOOL_ERROR.NODE_NOT_FOUND, `Unknown layerId: ${args.layerId}`);
  const imageUrl = imageSourceOf(source, editor);
  if (!imageUrl || !/^(?:https?:\/\/|data:image\/[^;]+;base64,)/i.test(imageUrl)) {
    throw toolError(TOOL_ERROR.IMAGE_SOURCE_REQUIRED, "An http(s) image URL or embedded image is required for provider edits.");
  }
  const providerId = getSetting(SETTING.IMAGE_PROVIDER_ID);
  const modelId = getSetting(SETTING.IMAGE_MODEL_ID);
  if (!providerId || !modelId) throw toolError(TOOL_ERROR.NO_IMAGE_MODEL);
  const prompt = operation === "remove-background" ? "Remove the background completely. Keep only the main subject with clean edges on a transparent background." : String(args.prompt ?? "").trim();
  const result = await runImageJob({
    providerId,
    request: {
      model: modelId,
      prompt,
      images: [imageUrl],
      n: 1,
      output_format: "png",
      background: operation === "remove-background" ? "transparent" : undefined
    },
    signal: context.signal
  });
  const url = result.urls?.[0];
  if (!url) throw toolError(TOOL_ERROR.NO_IMAGE_MODEL, "The provider returned no edited image.");
  assertTarget();
  const patch = {
    x: (finiteOrNull(source.x) ?? 0) + (finiteOrNull(source.width) ?? 0) + 40,
    y: finiteOrNull(source.y) ?? 0,
    ...(finiteOrNull(source.width) ? {
      width: source.width
    } : {}),
    ...(finiteOrNull(source.height) ? {
      height: source.height
    } : {}),
    ...(args.name ? {
      name: args.name
    } : {
      name: `${operation} ${source.name ?? ""}`.trim()
    })
  };
  let node;
  if (editor.prepareImageInsertion && editor.insertPreparedImages) {
    const prepared = await editor.prepareImageInsertion(url);
    assertTarget();
    [node] = editor.insertPreparedImages([{
      prepared,
      patch
    }], "AI: Edit image");
  } else {
    node = await editor.insertImage?.(url);
    if (node?.id) editor.updateNode?.(node.id, patch);
    editor.commitEditorDocument?.({
      message: "AI: Edit image"
    });
  }
  if (!node?.id) throw toolError(TOOL_ERROR.INVALID_ARGS, "Could not place the edited image.");
  return {
    ok: true,
    layerId: node.id,
    operation,
    sourceLayerId: source.id
  };
}
