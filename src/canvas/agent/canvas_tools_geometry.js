/**
 * Geometry-side canvas tools for the design agent: raw vector paths from SVG,
 * exact-geometry image placement, and canvas capture so the agent can look at
 * its own work. Registered in canvas_tools.js CANVAS_TOOL_SCHEMAS / EXECUTORS.
 */

import { TOOL_ERROR } from "./canvas_tools.js";

const DEFAULT_CAPTURE_MAX_SIZE = 1024;

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  return editor;
}

function invalidArgs(message = TOOL_ERROR.INVALID_ARGS) {
  const full = message === TOOL_ERROR.INVALID_ARGS ? message : `${TOOL_ERROR.INVALID_ARGS}: ${message}`;
  throw Object.assign(new Error(full), { code: TOOL_ERROR.INVALID_ARGS });
}

function nodeNotFound() {
  throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
}

const finiteOrNull = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/**
 * Registers the three geometry tools' schemas; spread-merged at the end of
 * CANVAS_TOOL_SCHEMAS by canvas_tools.js.
 */
export const CANVAS_TOOL_GEOMETRY_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "create_path",
      description:
        "Create a vector path layer from an SVG path 'd' string (pen/bezier tool). " +
        "Optionally position it at x/y and set fill, stroke, strokeWidth, and name.",
      parameters: {
        type: "object",
        properties: {
          d: { type: "string", description: "SVG path data, e.g. 'M 0 0 L 100 40 C ...'." },
          x: { type: "number", description: "Optional target x for the path bounds origin." },
          y: { type: "number", description: "Optional target y for the path bounds origin." },
          fill: { type: "string" },
          stroke: { type: "string" },
          strokeWidth: { type: "number" },
          name: { type: "string" },
        },
        required: ["d"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_image",
      description:
        "Place an image from a URL (or data URL) as a new image layer at exact " +
        "canvas geometry: the layer is inserted, then repositioned/resized to x, y, width, height.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          name: { type: "string" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capture_canvas",
      description:
        "Capture the whole canvas (or one image layer, given layerId) as a PNG data URL, " +
        "downscaled so no side exceeds maxSize (default 1024). Use it to visually verify your edits.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string", description: "Optional image-layer ID to capture instead of the whole page." },
          maxSize: { type: "number", description: "Max width/height in pixels for the returned capture (default 1024)." },
        },
      },
    },
  },
]);

/** Creates a pen (bezier) node from an SVG path string via the drawing API. */
export function createPath(args = {}) {
  const editor = requireEditor();
  const { d, fill, stroke, strokeWidth, name } = args;
  const x = finiteOrNull(args.x);
  const y = finiteOrNull(args.y);
  if (typeof d !== "string" || d.trim() === "") invalidArgs(`Invalid argument "d": expected a non-empty SVG path string, got ${JSON.stringify(d)}`);
  if (x === null && args.x !== undefined) invalidArgs(`Invalid argument "x": expected a finite number, got ${JSON.stringify(args.x)}`);
  if (y === null && args.y !== undefined) invalidArgs(`Invalid argument "y": expected a finite number, got ${JSON.stringify(args.y)}`);
  if (fill !== undefined && typeof fill !== "string") invalidArgs(`Invalid argument "fill": expected a string, got ${JSON.stringify(fill)}`);
  if (stroke !== undefined && typeof stroke !== "string") invalidArgs(`Invalid argument "stroke": expected a string, got ${JSON.stringify(stroke)}`);
  if (strokeWidth !== undefined && !Number.isFinite(Number(strokeWidth))) invalidArgs(`Invalid argument "strokeWidth": expected a finite number, got ${JSON.stringify(strokeWidth)}`);
  if (name !== undefined && typeof name !== "string") invalidArgs(`Invalid argument "name": expected a string, got ${JSON.stringify(name)}`);

  let result;
  try {
    result = editor.addPenNode?.({
      svgD: d,
      ...(x !== null ? { x } : {}),
      ...(y !== null ? { y } : {}),
      ...(stroke !== undefined ? { stroke } : {}),
      ...(strokeWidth !== undefined ? { strokeWidth: Number(strokeWidth) } : {}),
      ...(fill !== undefined ? { fill } : {}),
    });
  } catch (error) {
    invalidArgs(`Invalid argument "d": expected valid SVG path data, got ${JSON.stringify(d)} (${error?.message || "parse failed"})`);
  }
  if (!result?.nodeId) nodeNotFound();

  if (name !== undefined) editor.updateNode?.(result.nodeId, { name });
  editor.commitEditorDocument?.({ message: "AI: Create path" });

  return { ok: true, layerId: result.nodeId, kind: result.kind ?? "pen" };
}

/** Inserts an image layer, then pins it to the exact requested geometry. */
export async function placeImage(args = {}) {
  const editor = requireEditor();
  const { url, name } = args;
  const x = finiteOrNull(args.x);
  const y = finiteOrNull(args.y);
  const width = finiteOrNull(args.width);
  const height = finiteOrNull(args.height);
  if (typeof url !== "string" || url.trim() === "") invalidArgs(`Invalid argument "url": expected a non-empty string, got ${JSON.stringify(url)}`);
  if (x === null && args.x !== undefined) invalidArgs(`Invalid argument "x": expected a finite number, got ${JSON.stringify(args.x)}`);
  if (y === null && args.y !== undefined) invalidArgs(`Invalid argument "y": expected a finite number, got ${JSON.stringify(args.y)}`);
  if (width === null && args.width !== undefined) invalidArgs(`Invalid argument "width": expected a finite number, got ${JSON.stringify(args.width)}`);
  if (height === null && args.height !== undefined) invalidArgs(`Invalid argument "height": expected a finite number, got ${JSON.stringify(args.height)}`);
  if (name !== undefined && typeof name !== "string") invalidArgs(`Invalid argument "name": expected a string, got ${JSON.stringify(name)}`);
  if (width !== null && width < 0) invalidArgs(`Invalid argument "width": expected >= 0, got ${JSON.stringify(width)}`);
  if (height !== null && height < 0) invalidArgs(`Invalid argument "height": expected >= 0, got ${JSON.stringify(height)}`);

  const node = await editor.insertImage?.(url);
  if (!node?.id) nodeNotFound();

  const patch = {};
  if (x !== null) patch.x = x;
  if (y !== null) patch.y = y;
  if (width !== null) patch.width = width;
  if (height !== null) patch.height = height;
  if (name !== undefined) patch.name = name;
  if (Object.keys(patch).length > 0) editor.updateNode?.(node.id, patch);
  editor.commitEditorDocument?.({ message: "AI: Place image" });

  return { ok: true, layerId: node.id, ...patch };
}

/** Renders `source` into an outW×outH canvas and PNG-encodes it. */
function renderScaled(source, outW, outH) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext?.("2d");
  if (!ctx || typeof ctx.drawImage !== "function") return null;
  ctx.drawImage(source, 0, 0, outW, outH);
  const dataUrl = canvas.toDataURL?.("image/png") ?? null;
  if (!dataUrl) return null;
  return { dataUrl, width: outW, height: outH };
}

/** Decodes a data URL through an Image element; null when no Image exists. */
function decodeDataUrl(url) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Captures the whole page (exportPngCanvas → renderComposite) or one image
 * layer (exportNodePng) as a PNG data URL, downscaled so the largest side is
 * at most maximally `maxSize` (default 1024).
 */
export async function captureCanvas(args = {}) {
  const editor = requireEditor();
  const maxSizeValue = Number(args.maxSize);
  const maxSize =
    Number.isFinite(maxSizeValue) && maxSizeValue > 0 ? Math.max(1, Math.round(maxSizeValue)) : DEFAULT_CAPTURE_MAX_SIZE;
  const layerId = typeof args.layerId === "string" && args.layerId.trim() !== "" ? args.layerId : null;

  let pixelSource = null;
  let sourceUrl = null;
  if (layerId) {
    const exported = editor.exportNodePng?.(layerId) ?? null;
    if (!exported) nodeNotFound();
    if (typeof exported === "string") sourceUrl = exported;
    else pixelSource = exported;
  } else {
    pixelSource = editor.exportPngCanvas?.() ?? editor.renderComposite?.() ?? null;
  }
  if (!pixelSource && !sourceUrl) {
    throw Object.assign(new Error("agentCaptureFailed"), { code: "agentCaptureFailed" });
  }

  if (pixelSource && Number(pixelSource.width) > 0 && Number(pixelSource.height) > 0) {
    const w = Number(pixelSource.width);
    const h = Number(pixelSource.height);
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));
    if (scale >= 1) {
      const dataUrl = pixelSource.toDataURL?.("image/png") ?? null;
      if (dataUrl) return { ok: true, dataUrl, width: outW, height: outH };
      return { ok: true, dataUrl: null, width: w, height: h };
    }
    const scaled = renderScaled(pixelSource, outW, outH);
    if (scaled) return { ok: true, ...scaled };
    const dataUrl = pixelSource.toDataURL?.("image/png") ?? null;
    if (dataUrl) return { ok: true, dataUrl, width: w, height: h };
    throw Object.assign(new Error("agentCaptureFailed"), { code: "agentCaptureFailed" });
  }

  if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("data:image")) {
    throw Object.assign(new Error("agentCaptureFailed"), { code: "agentCaptureFailed" });
  }
  const decoded = await decodeDataUrl(sourceUrl);
  const w = Number(decoded?.naturalWidth ?? decoded?.width ?? 0);
  const h = Number(decoded?.naturalHeight ?? decoded?.height ?? 0);
  if (!(w > 0 && h > 0)) {
    return { ok: true, dataUrl: sourceUrl, width: null, height: null };
  }
  const scale = Math.min(1, maxSize / Math.max(w, h));
  if (scale >= 1) return { ok: true, dataUrl: sourceUrl, width: w, height: h };
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const scaled = renderScaled(decoded, outW, outH);
  if (scaled) return { ok: true, ...scaled };
  return { ok: true, dataUrl: sourceUrl, width: w, height: h };
}
