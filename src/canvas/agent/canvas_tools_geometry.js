/**
 * Geometry-side canvas tools for the design agent: raw vector paths from SVG,
 * exact-geometry image placement, and canvas capture so the agent can look at
 * its own work. Registered in canvas_tools.js CANVAS_TOOL_SCHEMAS / EXECUTORS.
 */

export const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NO_IMAGE_MODEL: "agentNoImageModel",
  CANCELLED: "agentCancelled",
  NODE_NOT_FOUND: "agentNodeNotFound",
  INVALID_ARGS: "agentInvalidArgs",
});

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
        "Import a generated or existing image from a URL or data URL as a native image layer. " +
        "Optionally place it inside a Frame or group with parentId, and set exact canvas geometry.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          parentId: {
            type: "string",
            description: "Optional Frame or group that owns this image layer.",
          },
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
  {
    type: "function",
    function: {
      name: "find_empty_space",
      description:
        "Find an empty, non-overlapping coordinate region (x, y) on the canvas to place a new screen or frame.",
      parameters: {
        type: "object",
        properties: {
          width: { type: "number", description: "Desired frame width (default 1440)." },
          height: { type: "number", description: "Desired frame height (default 900)." },
          direction: {
            type: "string",
            enum: ["auto", "right", "bottom"],
            description: "Search direction relative to existing frames (default: 'auto').",
          },
          padding: { type: "number", description: "Spacing between frames in pixels (default: 80)." },
          nodeId: { type: "string", description: "Optional anchor frame ID to place adjacent to." },
        },
      },
    },
  },
]);

/** Creates a pen (bezier) node from an SVG path string via the drawing API. */
export function createPath(args = {}, hostEditor) {
  const editor = hostEditor ?? requireEditor();
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
  const { url, name, parentId } = args;
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
  if (
    parentId !== undefined &&
    (typeof parentId !== "string" || parentId.trim() === "")
  ) {
    invalidArgs(
      `Invalid argument "parentId": expected a non-empty string, got ${JSON.stringify(parentId)}`,
    );
  }
  if (width !== null && width < 0) invalidArgs(`Invalid argument "width": expected >= 0, got ${JSON.stringify(width)}`);
  if (height !== null && height < 0) invalidArgs(`Invalid argument "height": expected >= 0, got ${JSON.stringify(height)}`);

  if (parentId !== undefined) {
    const parent =
      editor.getNode?.(parentId) ??
      editor.getDocument?.()?.nodes?.find((node) => node.id === parentId);
    const isContainer =
      parent?.isFrame === true || parent?.kind === "group" || parent?.type === "frame";
    if (!isContainer) {
      invalidArgs(
        `Invalid argument "parentId": expected an existing Frame or group, got ${JSON.stringify(parentId)}`,
      );
    }
  }

  const node = await editor.insertImage?.(url);
  if (!node?.id) nodeNotFound();

  const patch = {};
  if (x !== null) patch.x = x;
  if (y !== null) patch.y = y;
  if (width !== null) patch.width = width;
  if (height !== null) patch.height = height;
  if (name !== undefined) patch.name = name;
  if (parentId !== undefined) patch.parentId = parentId;
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

/**
 * Finds an empty, non-overlapping canvas coordinate for a new frame or artboard.
 */
export function findEmptySpace(args = {}, hostEditor) {
  const editor = hostEditor ?? requireEditor();
  const width = Math.max(1, Number(args.width) || 1440);
  const height = Math.max(1, Number(args.height) || 900);
  const direction = args.direction || "auto";
  const padding = Number.isFinite(Number(args.padding)) ? Number(args.padding) : 80;
  const nodeId = typeof args.nodeId === "string" ? args.nodeId : null;

  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];

  const topLevel = nodes.filter(
    (n) => !n.parentId && Number.isFinite(Number(n.x)) && Number.isFinite(Number(n.y))
  );

  if (!topLevel.length) {
    return { ok: true, x: 0, y: 0, width, height };
  }

  const rectCollides = (x, y, w, h) =>
    topLevel.some((n) => {
      const nx = Number(n.x) || 0;
      const ny = Number(n.y) || 0;
      const nw = Number(n.width) || 100;
      const nh = Number(n.height) || 100;
      return (
        x < nx + nw + padding &&
        x + w + padding > nx &&
        y < ny + nh + padding &&
        y + h + padding > ny
      );
    });

  if (nodeId) {
    const anchor = topLevel.find((n) => n.id === nodeId);
    if (anchor) {
      const ax = Number(anchor.x) || 0;
      const ay = Number(anchor.y) || 0;
      const aw = Number(anchor.width) || 100;
      const ah = Number(anchor.height) || 100;

      if (direction === "bottom") {
        let candidateY = ay + ah + padding;
        while (rectCollides(ax, candidateY, width, height)) {
          candidateY += height + padding;
        }
        return { ok: true, x: Math.round(ax), y: Math.round(candidateY), width, height };
      }

      let candidateX = ax + aw + padding;
      while (rectCollides(candidateX, ay, width, height)) {
        candidateX += width + padding;
      }
      return { ok: true, x: Math.round(candidateX), y: Math.round(ay), width, height };
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of topLevel) {
    const nx = Number(n.x) || 0;
    const ny = Number(n.y) || 0;
    const nw = Number(n.width) || 100;
    const nh = Number(n.height) || 100;
    minX = Math.min(minX, nx);
    minY = Math.min(minY, ny);
    maxX = Math.max(maxX, nx + nw);
    maxY = Math.max(maxY, ny + nh);
  }

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  const targetDir =
    direction === "auto"
      ? totalWidth > totalHeight * 2.5
        ? "bottom"
        : "right"
      : direction;

  if (targetDir === "bottom") {
    let candidateY = maxY + padding;
    while (rectCollides(minX, candidateY, width, height)) {
      candidateY += height + padding;
    }
    return { ok: true, x: Math.round(minX), y: Math.round(candidateY), width, height };
  }

  let candidateX = maxX + padding;
  while (rectCollides(candidateX, minY, width, height)) {
    candidateX += width + padding;
  }
  return { ok: true, x: Math.round(candidateX), y: Math.round(minY), width, height };
}
