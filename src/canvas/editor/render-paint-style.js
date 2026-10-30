import { isCssGradient, parseGradient } from "../color_picker/gradient_fill.js";
import { colourWithAlpha } from "./soft_brush.js";
import { meshCanvasPattern } from "./mesh-gradient-paint.js";

/**
 * A fill or stroke value as something Canvas2D can paint with.
 *
 * A plain colour passes straight through. A CSS gradient string — what the
 * colour picker writes into `fill` — becomes a CanvasGradient, parsed by the
 * same `parseGradient` the picker itself uses. Sharing that parser is the
 * point: a second one drifts, and a gradient that reads one way in the picker
 * and another on the canvas is the kind of bug nobody can see until they
 * compare the two side by side.
 *
 * The result is cached per (value, box), because this sits in the per-frame
 * draw path: without it every shape re-parses its gradient string on every
 * frame, at every zoom step and during every drag.
 */
const paintStyleCache = new Map();
const PAINT_STYLE_CACHE_MAX = 256;

function gradientStopColour(stop) {
  const alpha = Math.max(0, Math.min(100, stop.opacity ?? 100)) / 100;
  if (alpha >= 1) return stop.color;
  return colourWithAlpha(stop.color, alpha);
}

function buildCanvasGradient(ctx, parsed, x, y, width, height, alpha = 1) {
  if (parsed.type === "mesh") return meshCanvasPattern(ctx, parsed, x, y, width, height, alpha);
  const { geometry } = parsed;
  const centreX = x + ((geometry?.centerX ?? 50) / 100) * width;
  const centreY = y + ((geometry?.centerY ?? 50) / 100) * height;

  let gradient;
  if (parsed.type === "linear") {
    // A gradient edited on the canvas carries its direction line (start/end
    // points as percentages of the box); honour it over the stored angle —
    // that is what the endpoint drags write, and the Skia path reads the same
    // fields. Plain angle gradients (no line metadata) keep the old math.
    if (
      geometry?.startX !== undefined &&
      geometry?.startY !== undefined &&
      geometry?.endX !== undefined &&
      geometry?.endY !== undefined
    ) {
      gradient = ctx.createLinearGradient(
        x + (geometry.startX / 100) * width,
        y + (geometry.startY / 100) * height,
        x + (geometry.endX / 100) * width,
        y + (geometry.endY / 100) * height,
      );
    } else {
      // CSS measures the angle clockwise from "up"; the canvas measures from
      // the positive x axis, hence the quarter turn.
      const radians = ((parseFloat(parsed.angle) || 0) - 90) * (Math.PI / 180);
      const reach = Math.hypot(width, height) / 2;
      gradient = ctx.createLinearGradient(
        centreX - Math.cos(radians) * reach,
        centreY - Math.sin(radians) * reach,
        centreX + Math.cos(radians) * reach,
        centreY + Math.sin(radians) * reach,
      );
    }
  } else if (
    parsed.type === "angular" &&
    typeof ctx.createConicGradient === "function"
  ) {
    const radians = (parseFloat(parsed.angle) || 0) * (Math.PI / 180);
    gradient = ctx.createConicGradient(radians, centreX, centreY);
  } else {
    // Radial, and diamond — which Canvas2D has no shader for, so it takes the
    // radial ramp rather than painting nothing.
    const radiusX = Math.max(1, ((geometry?.width ?? 100) / 200) * width);
    const radiusY = Math.max(1, ((geometry?.height ?? 100) / 200) * height);
    // Rasterize the elliptical ramp in local coordinates. CanvasGradient has
    // no transform of its own; restoring the creation context loses the ellipse.
    const tile = document.createElement("canvas");
    tile.width = Math.max(1, Math.ceil(width));
    tile.height = Math.max(1, Math.ceil(height));
    const paint = tile.getContext("2d");
    paint.scale(tile.width / width, tile.height / height);
    paint.translate(centreX - x, centreY - y);
    paint.scale(radiusX, radiusY);
    const ramp = paint.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const stop of parsed.stops ?? []) {
      ramp.addColorStop(Math.max(0, Math.min(1, (stop.position ?? 0) / 100)), gradientStopColour(stop));
    }
    paint.fillStyle = ramp;
    paint.fillRect(-(centreX - x) / radiusX, -(centreY - y) / radiusY, width / radiusX, height / radiusY);
    const pattern = ctx.createPattern(tile, "no-repeat");
    pattern.setTransform(new DOMMatrix().translate(x, y).scale(width / tile.width, height / tile.height));
    return pattern;
  }

  for (const stop of parsed.stops ?? []) {
    const position = Math.max(0, Math.min(1, (stop.position ?? 0) / 100));
    gradient.addColorStop(position, gradientStopColour(stop));
  }
  return gradient;
}

/**
 * Whether a paint string names a picture (a URL) rather than a colour or
 * gradient the canvas can fill with. Image fills on shapes are not drawn by
 * the 2D renderer, and handing a URL to `fillStyle` is a silent no-op that
 * leaves the *previous* fillStyle active — so the renderer must treat them
 * as the absence of a fill, never as a colour.
 */
export function isImagePaint(style) {
  return (
    typeof style === "string" &&
    /^(?:blob:|data:image\/|https?:|file:)/i.test(style)
  );
}

export function resolvePaintStyle(ctx, style, x, y, width, height, alpha = 1) {
  if (typeof style === "object" && style !== null) return style;
  if (typeof style !== "string" || !style || style === "transparent") {
    return "transparent";
  }
  if (!isCssGradient(style)) {
    if (isImagePaint(style)) return "transparent";
    return alpha >= 1 ? style : colourWithAlpha(style, alpha);
  }

  const key = `${style}|${x}|${y}|${width}|${height}|${alpha}`;
  const cached = paintStyleCache.get(key);
  if (cached) {
    // Keep the entry hot: re-inserting moves it to the end of the eviction
    // order, so the shapes actually on screen are the ones that survive.
    paintStyleCache.delete(key);
    paintStyleCache.set(key, cached);
    return cached;
  }

  let resolved;
  try {
    const parsed = parseGradient(style);
    if (alpha < 1 && parsed.stops) {
      parsed.stops = parsed.stops.map((stop) => ({
        ...stop,
        opacity: (stop.opacity ?? 100) * alpha,
      }));
    }
    resolved = buildCanvasGradient(ctx, parsed, x, y, width, height, alpha);
  } catch {
    // A gradient string this build cannot read paints as nothing rather than
    // throwing out of the draw loop and taking the whole frame with it.
    return "transparent";
  }

  if (paintStyleCache.size >= PAINT_STYLE_CACHE_MAX) {
    paintStyleCache.delete(paintStyleCache.keys().next().value);
  }
  paintStyleCache.set(key, resolved);
  return resolved;
}

