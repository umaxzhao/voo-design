/**
 * Asset-generation tools: vector artwork, bitmap tracing and image edits.
 *
 * These extend the design agent beyond "draw with primitives and place images":
 *
 *   generate_vector   — ask the configured text model for SVG, then land it as
 *                       editable path/rect nodes (Pen's Generate("svg") counterpart)
 *   vectorize_image   — trace a raster layer into editable vector paths locally
 *   edit_image        — background removal / replacement through the configured
 *                       image provider (provider capabilities decide the result)
 *   stock_image       — fetch a CC-licensed photo from Openverse and place it
 *
 * They are registered by canvas_tools.js. None of them silently pretends to
 * work: missing model/provider/network produces an actionable error code.
 */
import { getSetting } from "../../shared/settings.js";
import { runImageJob } from "./image_generation.js";
import { parseSvgToNodes } from "./svg_to_nodes.js";
import { traceBitmapToPaths } from "./image_trace.js";
import { ICONS } from "./html_pipeline/lucide.js";

const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  INVALID_ARGS: "agentInvalidArgs",
  NODE_NOT_FOUND: "agentNodeNotFound",
  NO_IMAGE_MODEL: "agentNoImageModel",
  VECTOR_NEEDS_API_MODEL: "agentVectorNeedsApiModel",
  VECTOR_EMPTY: "agentVectorEmpty",
  IMAGE_SOURCE_REQUIRED: "agentImageSourceRequired",
  STOCK_UNAVAILABLE: "agentStockUnavailable",
});

const SETTING = Object.freeze({
  IMAGE_PROVIDER_ID: "agent.imageProviderId",
  IMAGE_MODEL_ID: "agent.imageModelId",
  STOCK_ACCESS_KEY: "agent.stockAccessKey",
});

const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";

function toolError(code, message) {
  return Object.assign(new Error(message ? `${code}: ${message}` : code), { code });
}

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw toolError(TOOL_ERROR.NO_EDITOR);
  return editor;
}

function invalidArgs(code, message) {
  throw toolError(code, message);
}

function documentOf(editor) {
  const doc = editor.getDoc?.() ?? editor.getDocument?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) invalidArgs(TOOL_ERROR.INVALID_ARGS, "No design document is open.");
  return doc;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nodeOf(editor, layerId) {
  if (typeof layerId !== "string" || !layerId.trim()) return null;
  return documentOf(editor).nodes.find((node) => node.id === layerId) ?? null;
}

/** Default placement for generated art: right of every top-level layer. */
function placementFor(editor, width, height) {
  const doc = documentOf(editor);
  const topLevel = (doc.nodes ?? []).filter((node) => !node.parentId);
  let right = 0;
  for (const node of topLevel) {
    const x = finiteOrNull(node.x);
    const w = finiteOrNull(node.width);
    if (x !== null && w !== null) right = Math.max(right, x + w);
  }
  return { x: topLevel.length ? Math.round(right + 80) : 0, y: 0, width, height };
}

/** Translate/scale an M/L/Z-only path (the tracer's output format). */
export function transformPathData(d, { x = 0, y = 0, scaleX = 1, scaleY = 1 } = {}) {
  if (typeof d !== "string" || !d.trim()) return "";
  // The tracer emits absolute M/L/Z only. Z needs no transform, so rewrite each
  // M/L coordinate pair and leave every other character untouched.
  return d.replace(/([ML])\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)[ ,]+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, (match, letter, rawX, rawY) => {
    const nextX = Number(rawX) * scaleX + x;
    const nextY = Number(rawY) * scaleY + y;
    return `${letter}${round(nextX)},${round(nextY)}`;
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function createVectorNodes(editor, nodes, origin) {
  const created = [];
  for (const spec of nodes) {
    if (spec.kind === "rect") {
      const node = editor.addRectAt?.({ x: origin.x + spec.x, y: origin.y + spec.y });
      if (!node?.id) continue;
      const patch = {
        width: Math.max(1, spec.width),
        height: Math.max(1, spec.height),
        ...(spec.rx ? { cornerRadius: spec.rx } : {}),
        ...(spec.fill ? { fill: spec.fill } : {}),
        ...(spec.stroke ? { stroke: spec.stroke } : {}),
        ...(spec.strokeWidth ? { strokeWidth: spec.strokeWidth } : {}),
        ...(spec.name ? { name: spec.name } : {}),
      };
      editor.updateNode?.(node.id, patch);
      created.push(node.id);
      continue;
    }
    if (spec.kind === "path" && spec.d) {
      const result = editor.addPenNode?.({
        svgD: spec.d,
        x: origin.x,
        y: origin.y,
        ...(spec.fill ? { fill: spec.fill } : {}),
        ...(spec.stroke ? { stroke: spec.stroke } : {}),
        ...(spec.strokeWidth ? { strokeWidth: spec.strokeWidth } : {}),
      });
      if (result?.nodeId) {
        if (spec.name) editor.updateNode?.(result.nodeId, { name: spec.name });
        created.push(result.nodeId);
      }
    }
  }
  return created;
}

function groupNodes(editor, ids, name) {
  if (ids.length < 2) {
    if (ids.length === 1 && name) editor.updateNode?.(ids[0], { name });
    return ids[0] ?? null;
  }
  editor.selectExactly?.(ids);
  const result = editor.groupSelection?.();
  const groupId = typeof result === "string" ? result : result?.id ?? editor.getSelectedId?.() ?? null;
  if (groupId && name) editor.updateNode?.(groupId, { name });
  return groupId;
}

/* ------------------------------------------------------------------ generate_vector */

export const GENERATE_VECTOR_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "generate_vector",
    description:
      "Generate original vector artwork (logo, icon, illustration, abstract mark) for a prompt and " +
      "place it on the canvas as editable paths. Requires an API agent model (local CLI models cannot " +
      "run nested text completions). Returns {layerIds, groupId, width, height, warnings}.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to draw: subject, style, palette, composition." },
        width: { type: "number", description: "Target width in px (default 400)." },
        height: { type: "number", description: "Target height in px (default 400)." },
        x: { type: "number", description: "Optional canvas x for the artwork origin." },
        y: { type: "number", description: "Optional canvas y for the artwork origin." },
        name: { type: "string", description: "Optional group/layer name." },
      },
      required: ["prompt"],
    },
  },
});

const VECTOR_SYSTEM_PROMPT = [
  "You are a vector illustrator. Reply with ONE complete SVG document and nothing else.",
  "Rules:",
  "- Root: <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 W H\">.",
  "- Only <path>, <rect>, <circle>, <ellipse>, <line>, <polygon>, <polyline> and <g> elements.",
  "- Flat vector style, at most 6 colors plus transparent, at most 60 elements.",
  "- No text, no images, no gradients, no filters, no scripts, no external references.",
  "- Geometry must fit inside the viewBox with a small margin.",
].join("\n");

function extractSvg(text) {
  const raw = String(text ?? "").trim();
  const fenced = /```(?:svg|xml)?\s*([\s\S]*?)```/i.exec(raw);
  const source = fenced ? fenced[1] : raw;
  const start = source.indexOf("<svg");
  const end = source.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + 6);
}

export async function generateVector(args = {}, context = {}) {
  const editor = requireEditor();
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) invalidArgs(TOOL_ERROR.INVALID_ARGS, "prompt is required.");
  if (!context.llm?.complete) {
    throw toolError(
      TOOL_ERROR.VECTOR_NEEDS_API_MODEL,
      "Vector generation needs an in-app API agent model. Switch to an API provider, or use build_layout path nodes with SVG d data to create editable vectors from an external MCP client; vectorize_image can trace a flat raster layer.",
    );
  }
  const width = Math.max(16, Math.min(2048, finiteOrNull(args.width) ?? 400));
  const height = Math.max(16, Math.min(2048, finiteOrNull(args.height) ?? 400));
  const text = await context.llm.complete({
    system: VECTOR_SYSTEM_PROMPT,
    user: `Draw this as vector artwork: ${prompt}\nCanvas: ${width}x${height}. Use viewBox="0 0 ${width} ${height}".`,
    signal: context.signal,
  });
  const svg = extractSvg(text);
  if (!svg) throw toolError(TOOL_ERROR.VECTOR_EMPTY, "The model did not return an SVG document.");
  const parsed = parseSvgToNodes(svg, { targetWidth: width, targetHeight: height });
  if (!parsed.nodes.length) throw toolError(TOOL_ERROR.VECTOR_EMPTY, parsed.warnings.join("; ") || "SVG had no drawable elements.");
  const origin = {
    x: finiteOrNull(args.x) ?? placementFor(editor, width, height).x,
    y: finiteOrNull(args.y) ?? 0,
  };
  const layerIds = await createVectorNodes(editor, parsed.nodes, origin);
  if (!layerIds.length) throw toolError(TOOL_ERROR.VECTOR_EMPTY, "Could not create any vector layer.");
  const groupId = groupNodes(editor, layerIds, args.name ?? "Vector art");
  editor.commitEditorDocument?.({ message: "AI: Generate vector" });
  return {
    ok: true,
    layerIds,
    groupId,
    x: origin.x,
    y: origin.y,
    width,
    height,
    warnings: parsed.warnings,
  };
}

/* ------------------------------------------------------------------ vectorize_image */

export const VECTORIZE_IMAGE_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "vectorize_image",
    description:
      "Trace a raster layer into editable vector paths (local, no provider needed). Use it for flat logos, " +
      "marks, icons or posters; photographs trace into many paths. Returns {layerIds, groupId, colors, paths, warnings}.",
    parameters: {
      type: "object",
      properties: {
        layerId: { type: "string", description: "Image layer to trace." },
        colors: { type: "number", description: "Palette size 2-16 (default 6)." },
        minArea: { type: "number", description: "Drop contours smaller than this pixel area (default 24)." },
        width: { type: "number", description: "Output width (default: source width)." },
        height: { type: "number", description: "Output height (default: keep aspect)." },
        x: { type: "number", description: "Optional canvas x (default: right of source)." },
        y: { type: "number", description: "Optional canvas y." },
        name: { type: "string" },
      },
      required: ["layerId"],
    },
  },
});

function imageSourceOf(node) {
  if (!node) return null;
  if (typeof node.src === "string") return node.src;
  const fills = [node.fill, ...(node.fills ?? [])].flat().filter(Boolean);
  for (const fill of fills) {
    if (fill?.type === "image" && typeof fill.url === "string") return fill.url;
  }
  return null;
}

async function decodeImageToBitmap(url) {
  if (typeof createImageBitmap === "function" && typeof fetch === "function" && /^https?:|^blob:|^data:/.test(url)) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(bitmap.width, bitmap.height) : null;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return { data: imageData.data, width: bitmap.width, height: bitmap.height };
      }
    } catch {
      // Fall through to the Image element path.
    }
  }
  if (typeof Image === "undefined" || typeof document === "undefined") return null;
  const image = await new Promise((resolve) => {
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
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

export async function vectorizeImage(args = {}, context = {}) {
  const editor = requireEditor();
  const source = nodeOf(editor, args.layerId);
  if (!source) throw toolError(TOOL_ERROR.NODE_NOT_FOUND, `Unknown layerId: ${args.layerId}`);
  const url = imageSourceOf(source);
  if (!url) {
    throw toolError(TOOL_ERROR.IMAGE_SOURCE_REQUIRED, "The layer has no raster source; select an image layer.");
  }
  const decoder = context.decodeImage ?? decodeImageToBitmap;
  const bitmap = await decoder(url);
  if (!bitmap?.data?.length) {
    throw toolError(TOOL_ERROR.IMAGE_SOURCE_REQUIRED, "Could not decode the source image (a data URL export may be needed).");
  }
  const traced = traceBitmapToPaths(bitmap, {
    maxColors: Math.max(2, Math.min(16, finiteOrNull(args.colors) ?? 6)),
    minArea: Math.max(1, finiteOrNull(args.minArea) ?? 24),
  });
  const targetWidth = Math.max(1, finiteOrNull(args.width) ?? traced.width);
  const targetHeight = Math.max(1, finiteOrNull(args.height) ?? Math.round((traced.height / traced.width) * targetWidth));
  const scaleX = targetWidth / traced.width;
  const scaleY = targetHeight / traced.height;
  const origin = {
    x: finiteOrNull(args.x) ?? Math.round((finiteOrNull(source.x) ?? 0) + (finiteOrNull(source.width) ?? 0) + 40),
    y: finiteOrNull(args.y) ?? finiteOrNull(source.y) ?? 0,
  };
  const ids = [];
  for (const layer of traced.layers) {
    for (const path of layer.paths) {
      const d = transformPathData(path.d, { x: origin.x, y: origin.y, scaleX, scaleY });
      if (!d) continue;
      const result = editor.addPenNode?.({ svgD: d, fill: layer.color });
      if (result?.nodeId) {
        editor.updateNode?.(result.nodeId, { name: `Vector ${layer.color}` });
        ids.push(result.nodeId);
      }
    }
  }
  if (!ids.length) throw toolError(TOOL_ERROR.VECTOR_EMPTY, traced.warnings.join("; ") || "Nothing to trace.");
  const groupId = groupNodes(editor, ids, args.name ?? "Vectorized image");
  editor.commitEditorDocument?.({ message: "AI: Vectorize image" });
  return {
    ok: true,
    layerIds: ids,
    groupId,
    colors: traced.palette,
    paths: ids.length,
    warnings: traced.warnings,
  };
}

/* ------------------------------------------------------------------ edit_image */

export const EDIT_IMAGE_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "edit_image",
    description:
      "Edit an existing image layer with the configured image provider: remove-background (cutout) or " +
      "replace-background (prompt describes the new background). Requires agent.imageProviderId / " +
      "imageModelId and an http(s) source image. Places the result as a new image layer next to the source.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["remove-background", "replace-background"] },
        layerId: { type: "string", description: "Source image layer." },
        prompt: { type: "string", description: "Required for replace-background; describes the new background." },
        name: { type: "string" },
      },
      required: ["operation", "layerId"],
    },
  },
});

export async function editImage(args = {}, context = {}) {
  const editor = requireEditor();
  const operation = String(args.operation ?? "");
  if (!["remove-background", "replace-background"].includes(operation)) {
    invalidArgs(TOOL_ERROR.INVALID_ARGS, `Unsupported operation: ${operation}`);
  }
  if (operation === "replace-background" && !String(args.prompt ?? "").trim()) {
    invalidArgs(TOOL_ERROR.INVALID_ARGS, "prompt is required for replace-background.");
  }
  const source = nodeOf(editor, args.layerId);
  if (!source) throw toolError(TOOL_ERROR.NODE_NOT_FOUND, `Unknown layerId: ${args.layerId}`);
  const imageUrl = imageSourceOf(source);
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    throw toolError(TOOL_ERROR.IMAGE_SOURCE_REQUIRED, "An http(s) image URL is required for provider edits.");
  }
  const providerId = getSetting(SETTING.IMAGE_PROVIDER_ID);
  const modelId = getSetting(SETTING.IMAGE_MODEL_ID);
  if (!providerId || !modelId) throw toolError(TOOL_ERROR.NO_IMAGE_MODEL);
  const prompt =
    operation === "remove-background"
      ? "Remove the background completely. Keep only the main subject with clean edges on a transparent background."
      : String(args.prompt ?? "").trim();
  const result = await runImageJob({
    providerId,
    request: {
      model: modelId,
      prompt,
      images: [imageUrl],
      n: 1,
      output_format: "png",
      background: operation === "remove-background" ? "transparent" : undefined,
    },
    signal: context.signal,
  });
  const url = result.urls?.[0];
  if (!url) throw toolError(TOOL_ERROR.NO_IMAGE_MODEL, "The provider returned no edited image.");
  const node = await editor.insertImage?.(url);
  if (!node?.id) throw toolError(TOOL_ERROR.INVALID_ARGS, "Could not place the edited image.");
  const patch = {
    x: (finiteOrNull(source.x) ?? 0) + (finiteOrNull(source.width) ?? 0) + 40,
    y: finiteOrNull(source.y) ?? 0,
    ...(finiteOrNull(source.width) ? { width: source.width } : {}),
    ...(finiteOrNull(source.height) ? { height: source.height } : {}),
    ...(args.name ? { name: args.name } : { name: `${operation} ${source.name ?? ""}`.trim() }),
  };
  editor.updateNode?.(node.id, patch);
  editor.commitEditorDocument?.({ message: "AI: Edit image" });
  return { ok: true, layerId: node.id, operation, sourceLayerId: source.id };
}

/* ------------------------------------------------------------------ stock_image */

export const STOCK_IMAGE_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "stock_image",
    description:
      "Search Openverse for a CC-licensed photo matching a query and place it on the canvas. Network required. " +
      "Returns {layerIds, attributions}. Query with 1-4 concrete nouns, not abstract concepts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Concrete search terms, e.g. \"fern frond macro\"." },
        count: { type: "number", description: "1-4 images (default 1)." },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["query"],
    },
  },
});

export async function stockImage(args = {}, context = {}) {
  const editor = requireEditor();
  const query = String(args.query ?? "").trim();
  if (!query) invalidArgs(TOOL_ERROR.INVALID_ARGS, "query is required.");
  const count = Math.max(1, Math.min(4, finiteOrNull(args.count) ?? 1));
  const fetchImpl = context.fetch ?? (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) throw toolError(TOOL_ERROR.STOCK_UNAVAILABLE, "fetch is unavailable in this environment.");
  let payload;
  try {
    const response = await fetchImpl(`${OPENVERSE_ENDPOINT}?q=${encodeURIComponent(query)}&page_size=${count}&license_type=all&mature=false`, {
      signal: context.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    throw toolError(TOOL_ERROR.STOCK_UNAVAILABLE, `Openverse search failed: ${error?.message ?? error}`);
  }
  const results = (payload?.results ?? []).filter((item) => item?.url || item?.thumbnail);
  if (!results.length) throw toolError(TOOL_ERROR.STOCK_UNAVAILABLE, `No Openverse results for "${query}".`);
  const layerIds = [];
  const attributions = [];
  const base = {
    x: finiteOrNull(args.x) ?? placementFor(editor, 400, 300).x,
    y: finiteOrNull(args.y) ?? 0,
  };
  for (const [index, item] of results.entries()) {
    const url = item.url ?? item.thumbnail;
    try {
      const node = await editor.insertImage?.(url);
      if (!node?.id) continue;
      const patch = {
        x: base.x + index * ((finiteOrNull(args.width) ?? 400) + 24),
        y: base.y,
        ...(finiteOrNull(args.width) ? { width: args.width } : {}),
        ...(finiteOrNull(args.height) ? { height: args.height } : {}),
        name: item.title?.slice(0, 80) || `Stock: ${query}`,
      };
      editor.updateNode?.(node.id, patch);
      layerIds.push(node.id);
      attributions.push({
        title: item.title ?? "",
        creator: item.creator ?? "",
        license: item.license ?? "",
        source: item.foreign_landing_url ?? item.url ?? "",
      });
    } catch {
      // Skip an unresolvable result rather than failing the whole call.
    }
  }
  if (!layerIds.length) throw toolError(TOOL_ERROR.STOCK_UNAVAILABLE, "Could not download any result image.");
  editor.commitEditorDocument?.({ message: "AI: Place stock image" });
  return { ok: true, layerIds, attributions };
}

/* ------------------------------------------------------------------ create_icon */

export const CREATE_ICON_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "create_icon",
    description:
      "Insert an editable vector icon from the built-in icon set (e.g. 'search', 'settings', 'user', 'bell', 'heart', 'download', 'chevron-right', 'arrow-left', etc.) onto the canvas.",
    parameters: {
      type: "object",
      properties: {
        icon: {
          type: "string",
          description: "Icon name, e.g. 'search', 'home', 'user', 'settings', 'bell', 'mail', 'heart', 'folder', 'plus'.",
        },
        x: { type: "number", description: "Canvas x position (optional; defaults to next available space)." },
        y: { type: "number", description: "Canvas y position (optional; defaults to 0)." },
        size: { type: "number", description: "Icon size in pixels (default 24)." },
        color: { type: "string", description: "Icon stroke color, e.g. '#ffffff' or '#171717'." },
        strokeWidth: { type: "number", description: "Icon stroke width in pixels (default 2)." },
        name: { type: "string", description: "Optional layer name." },
      },
      required: ["icon"],
    },
  },
});

export async function createIcon(args = {}, context = {}) {
  context.signal?.throwIfAborted();
  const iconName = String(args.icon ?? "").toLowerCase().trim();
  const iconData = ICONS[iconName];
  if (!iconData) {
    invalidArgs(
      TOOL_ERROR.INVALID_ARGS,
      `Unknown icon: "${iconName}". Available icons include: ${Object.keys(ICONS).slice(0, 15).join(", ")}...`
    );
  }

  const editor = context.editor ?? requireEditor();

  const size = Math.max(8, Number(args.size) || 24);
  const color = typeof args.color === "string" ? args.color : "#ffffff";
  const strokeWidth = Number.isFinite(Number(args.strokeWidth)) ? Number(args.strokeWidth) : 2;

  const origin =
    Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y))
      ? { x: Number(args.x), y: Number(args.y) }
      : placementFor(editor, size, size);

  const body = iconData.node
    .map(([tag, attrs]) => {
      const attrsStr = Object.entries(attrs)
        .filter(([key]) => key !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${attrsStr}></${tag}>`;
    })
    .join("");

  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const parsed = parseSvgToNodes(svgText, { targetWidth: size, targetHeight: size });
  const layerIds = await createVectorNodes(editor, parsed.nodes, origin);

  if (args.name && layerIds.length > 0) {
    editor.updateNode?.(layerIds[0], { name: args.name });
  }

  editor.commitEditorDocument?.({ message: `AI: Insert icon ${iconName}` });
  return { ok: true, icon: iconName, size, x: origin.x, y: origin.y, layerIds };
}

export const ASSET_TOOL_SCHEMAS = Object.freeze([
  GENERATE_VECTOR_SCHEMA,
  VECTORIZE_IMAGE_SCHEMA,
  EDIT_IMAGE_SCHEMA,
  STOCK_IMAGE_SCHEMA,
  CREATE_ICON_SCHEMA,
]);

export const ASSET_TOOL_EXECUTORS = Object.freeze({
  generate_vector: generateVector,
  vectorize_image: vectorizeImage,
  edit_image: editImage,
  stock_image: stockImage,
  create_icon: createIcon,
});
