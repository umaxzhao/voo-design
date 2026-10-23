import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import {
  IconBox3,
  IconBrush,
  IconCircle,
  IconCone,
  IconCylinder,
  IconDodecahedron,
  IconHelix,
  IconIcosahedron,
  IconMusic,
  IconPolygon,
  IconPyramid,
  IconSphere,
  IconSquare,
  IconStar,
  IconTorus,
  IconTorusKnot,
  IconTriangle,
  IconVideo,
  IconComponent,
} from "../icons.jsx";
import { NODE_KIND } from "../editor/scene_model.js";
import { normalizeImageCrop } from "../editor/image_layer_crop.js";

const MESH_3D_ICONS = {
  box: IconBox3,
  sphere: IconSphere,
  cylinder: IconCylinder,
  torus: IconTorus,
  helix: IconHelix,
  cone: IconCone,
  pyramid: IconPyramid,
  icosahedron: IconIcosahedron,
  dodecahedron: IconDodecahedron,
  torusKnot: IconTorusKnot,
  plane: IconSquare,
  ellipse: IconCircle,
  triangle: IconTriangle,
  polygon: IconPolygon,
  star: IconStar,
};

/** Thumbnail tile size, in CSS px. */
const THUMB_WIDTH = 28;
const THUMB_HEIGHT = 20;
/** Render at 2x so the tile stays crisp on retina displays. */
const RENDER_SCALE = 2;
/** Thumbnails survive panel re-renders; cap how many bitmaps are kept. */
const CACHE_LIMIT = 64;
/** The bitmap cache decodes lazily — give up polling after this many tries. */
const POLL_TRIES = 20;
const POLL_MS = 200;

/** `imageId` → data URL. Module-level, like the filter preset swatches. */
const thumbCache = new Map();

/** The node's bitmap cropped and fitted inside the tile without losing its edges. */
export function renderImageThumb(bitmap, node) {
  const sourceWidth = bitmap.videoWidth || bitmap.naturalWidth || bitmap.width;
  const sourceHeight =
    bitmap.videoHeight || bitmap.naturalHeight || bitmap.height;
  if (!sourceWidth || !sourceHeight) return null;
  const crop = normalizeImageCrop(node, sourceWidth, sourceHeight);
  const scale = Math.min(
    (THUMB_WIDTH * RENDER_SCALE) / crop.width,
    (THUMB_HEIGHT * RENDER_SCALE) / crop.height,
  );
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH * RENDER_SCALE;
  canvas.height = THUMB_HEIGHT * RENDER_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    bitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height,
  );
  return canvas.toDataURL();
}

/** Renders the real mask matte (opaque = white, transparent = black). */
function renderMaskThumb(maskSource) {
  const sourceWidth = maskSource.naturalWidth ?? maskSource.width;
  const sourceHeight = maskSource.naturalHeight ?? maskSource.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.max(
    (THUMB_WIDTH * RENDER_SCALE) / sourceWidth,
    (THUMB_HEIGHT * RENDER_SCALE) / sourceHeight,
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH * RENDER_SCALE;
  canvas.height = THUMB_HEIGHT * RENDER_SCALE;
  const ctx = canvas.getContext("2d");

  // Fill black background first
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw the mask source into an offscreen buffer to convert alpha to black/white
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(
    maskSource,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height,
  );

  const imgData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const outData = ctx.createImageData(canvas.width, canvas.height);
  const out = outData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    // Photoshop mask: alpha represents opacity (white = reveal, black = hide)
    out[i] = alpha;
    out[i + 1] = alpha;
    out[i + 2] = alpha;
    out[i + 3] = 255;
  }
  ctx.putImageData(outData, 0, 0);
  return canvas.toDataURL();
}

function ImageThumb({ object, getBitmap = null, className }) {
  const imageKey = object.imageId ?? object.assetId ?? object.src ?? null;
  const thumbKey = imageKey
    ? `${imageKey}:${object.crop ? `${object.crop.x},${object.crop.y},${object.crop.width},${object.crop.height}` : "full"}`
    : null;
  const [url, setUrl] = useState(() =>
    thumbKey ? (thumbCache.get(thumbKey) ?? null) : null,
  );
  // `object` is rebuilt on every document edit; only the image identity
  // should restart the poll, so the latest node reaches it via a ref.
  const objectRef = useRef(object);
  objectRef.current = object;

  useEffect(() => {
    if (!imageKey) {
      setUrl(null);
      return undefined;
    }
    const cached = thumbCache.get(thumbKey);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    setUrl(null);
    let cancelled = false;
    let timer = 0;
    let tries = 0;
    const poll = () => {
      if (cancelled) return;
      const bitmap = getBitmap?.(objectRef.current);
      const rendered = bitmap ? renderImageThumb(bitmap, objectRef.current) : null;
      if (rendered) {
        if (thumbCache.size >= CACHE_LIMIT) {
          thumbCache.delete(thumbCache.keys().next().value);
        }
        thumbCache.set(thumbKey, rendered);
        setUrl(rendered);
        return;
      }
      tries += 1;
      if (tries < POLL_TRIES) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [thumbKey, imageKey, getBitmap]);

  return (
    <div className={`${className} bg-neutral-800 overflow-hidden`}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}

/** Renders a real black & white Mask thumbnail (Photoshop style: white = opaque, black = transparent). */
export function MaskThumb({
  object = null,
  getNodeMask = null,
  className = "",
}) {
  const maskKey = object?.maskId ? `mask-${object.maskId}` : null;
  const [url, setUrl] = useState(() =>
    maskKey ? (thumbCache.get(maskKey) ?? null) : null,
  );
  const objectRef = useRef(object);
  objectRef.current = object;

  useEffect(() => {
    if (!maskKey) {
      setUrl(null);
      return undefined;
    }
    const cached = thumbCache.get(maskKey);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    setUrl(null);
    let cancelled = false;
    let timer = 0;
    let tries = 0;
    const poll = () => {
      if (cancelled) return;
      const mask = getNodeMask?.(objectRef.current);
      const rendered = mask ? renderMaskThumb(mask) : null;
      if (rendered) {
        if (thumbCache.size >= CACHE_LIMIT) {
          thumbCache.delete(thumbCache.keys().next().value);
        }
        thumbCache.set(maskKey, rendered);
        setUrl(rendered);
        return;
      }
      tries += 1;
      if (tries < POLL_TRIES) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [maskKey, getNodeMask]);

  return (
    <div
      className={`${className} relative overflow-hidden bg-black flex items-center justify-center`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full bg-black flex items-center justify-center">
          <div className="h-3 w-3 rounded-full bg-white" />
        </div>
      )}
    </div>
  );
}

/**
 * A pen node's thumbnail is its actual outline, fitted into the tile — the
 * layers row reads as the shape itself, Figma-style. Points are node-local,
 * so the node box is the viewBox. Freehand brush strokes keep the brush
 * glyph; only bezier pen nodes get the vector preview.
 */
function PenThumb({ object, className }) {
  const points = object.points ?? [];
  const width = object.baseWidth || object.width || 1;
  const height = object.baseHeight || object.height || 1;
  if (points.length === 0) return <div className={className} />;

  const parts = [`M${points[0].x} ${points[0].y}`];
  const segment = (from, to) => {
    if (from.out || to.in) {
      const c1x = from.x + (from.out?.[0] ?? 0);
      const c1y = from.y + (from.out?.[1] ?? 0);
      const c2x = to.x + (to.in?.[0] ?? 0);
      const c2y = to.y + (to.in?.[1] ?? 0);
      return `C${c1x} ${c1y} ${c2x} ${c2y} ${to.x} ${to.y}`;
    }
    return `L${to.x} ${to.y}`;
  };
  for (let index = 1; index < points.length; index += 1) {
    parts.push(segment(points[index - 1], points[index]));
  }
  const closed = points[points.length - 1]?.close === true;
  if (closed) {
    parts.push(segment(points[points.length - 1], points[0]));
    parts.push("Z");
  }

  // Fills/strokes may be CSS gradient strings, which SVG paint cannot read.
  const safePaint = (value) =>
    value && value !== "transparent" && !value.includes("gradient")
      ? value
      : null;
  // The canvas renderer fills even an open outline (fill() closes it
  // implicitly); SVG fill does the same, so the thumbnail must not gate the
  // fill on the close flag — that mismatch showed filled shapes as strokes.
  const fill = safePaint(object.fill) ?? "none";
  const stroke =
    safePaint(object.stroke) ?? (fill !== "none" ? null : "#a3a3a3");

  return (
    <div className={`${className} bg-neutral-800`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <path
          d={parts.join(" ")}
          fill={fill}
          fillOpacity={object.fillOpacity ?? 1}
          stroke={stroke ?? "none"}
          strokeOpacity={object.strokeOpacity ?? 1}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

PenThumb.propTypes = {
  object: PropTypes.object.isRequired,
  className: PropTypes.string.isRequired,
};

/**
 * The little per-row preview tile. Image nodes show their bitmap (the matte
 * is deliberately not composited); every other kind gets a glyph tile that
 * reads at a glance. Purely presentational — selection is the caller's job.
 */
export default function EditorLayerThumb({ object, getBitmap = null }) {
  const tile =
    "flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm";

  switch (object.kind) {
    case NODE_KIND.IMAGE:
      return (
        <ImageThumb object={object} getBitmap={getBitmap} className={tile} />
      );
    case NODE_KIND.TEXT:
      return (
        <div className={`${tile} bg-neutral-800`}>
          <span className="text-[11px] font-semibold leading-none text-neutral-300">
            T
          </span>
        </div>
      );
    case NODE_KIND.RECT: {
      const color =
        object.fill && object.fill !== "transparent"
          ? object.fill
          : object.stroke;
      return (
        <div
          className={`${tile} rounded-md`}
          style={{ background: color ?? "#262626", opacity: object.opacity ?? 1, boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 25%)" }}
        />
      );
    }
    case NODE_KIND.ELLIPSE: {
      const color =
        object.fill && object.fill !== "transparent"
          ? object.fill
          : object.stroke;
      return (
        <div className={`${tile} bg-neutral-800`}>
          <div
            className="h-3.5 w-3.5 rounded-full"
            style={{ background: color ?? "transparent", opacity: object.opacity ?? 1, boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 25%)" }}
          />
        </div>
      );
    }
    case NODE_KIND.PATH:
      if (object.pen === true) {
        return <PenThumb object={object} className={tile} />;
      }
      return (
        <div
          data-media-placeholder
          className={`${tile} bg-neutral-800 text-neutral-300`}
        >
          <IconBrush size={11} />
        </div>
      );
    case NODE_KIND.REGION: {
      const color = object.color || "#FF3B30";
      return (
        <div
          className={`${tile} border border-dashed rounded-md`}
          style={{ borderColor: color, backgroundColor: `${color}25` }}
        />
      );
    }
    case NODE_KIND.CANVAS_INSTANCE:
      return (
        <div
          data-media-placeholder
          className={`${tile} bg-neutral-800 text-neutral-300`}
        >
          <IconComponent size={12} strokeWidth={1.5} />
        </div>
      );
    case NODE_KIND.ADJUSTMENT:
      return (
        <div className={`${tile} bg-neutral-800 text-[#a7ffd4]`}>
          <div className="h-3.5 w-3.5 rounded-full border border-white/20 bg-neutral-900 overflow-hidden flex">
            <div className="w-1/2 h-full bg-neutral-100" />
            <div className="w-1/2 h-full bg-neutral-800" />
          </div>
        </div>
      );
    default:
      return <div className={`${tile} bg-neutral-800`} />;
  }
}

EditorLayerThumb.propTypes = {
  object: PropTypes.object.isRequired,
  /** Returns the decoded bitmap for a node, or null while it loads. */
  getBitmap: PropTypes.func,
};

ImageThumb.propTypes = {
  object: PropTypes.object.isRequired,
  getBitmap: PropTypes.func,
  className: PropTypes.string.isRequired,
};

MaskThumb.propTypes = {
  object: PropTypes.object,
  getNodeMask: PropTypes.func,
  className: PropTypes.string,
};
