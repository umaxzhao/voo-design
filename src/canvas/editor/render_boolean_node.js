// Composite boolean operation rendering for combined shapes using offscreen silhouette layers.

import { resolveCornerRadii } from "./scene_model_core.js";
import { NODE_KIND } from "./scene_model.js";
import {
  getRenderCache,
  renderSignature,
  setRenderCache,
} from "./render_cache.js";
import { penOutlinePath } from "./render_pen_node.js";
import { buildStrokeRing } from "./stroke_filter.js";

/**
 * Canvas2D's composite operation for each boolean operation.
 *
 * The mapping is exact, which is why the 2D path needs no geometry library:
 * every part after the first is composited against what is already there.
 *   union     — draw it on top
 *   subtract  — take it out of what is there
 *   intersect — keep only where both are
 *   exclude   — keep where exactly one is
 */
const BOOLEAN_COMPOSITE = {
  union: "source-over",
  subtract: "destination-out",
  intersect: "destination-in",
  exclude: "xor",
};

/** One source shape of a boolean node, as a path in the node's own space. */
function booleanSourcePath(source) {
  const path = new Path2D();
  const { x, y, w: width, h: height } = source;

  if (source.type === NODE_KIND.ELLIPSE) {
    path.ellipse(
      x + width / 2,
      y + height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
    return path;
  }
  if (source.type === NODE_KIND.PATH && Array.isArray(source.points)) {
    return penOutlinePath({
      points: source.points,
      x,
      y,
      width,
      height,
      baseWidth: source.baseWidth,
      baseHeight: source.baseHeight,
    });
  }
  // A nested boolean is flattened to its own parts here. The 2D path cannot
  // composite a sub-result without another layer, so a nested operation reads
  // as a union of its parts — the one place this renderer approximates where
  // Skia is exact. Nesting is only reachable by combining a combined shape.
  if (
    source.type === NODE_KIND.BOOLEAN &&
    Array.isArray(source.booleanSources)
  ) {
    for (const nested of source.booleanSources) {
      path.addPath(
        booleanSourcePath({ ...nested, x: nested.x + x, y: nested.y + y }),
      );
    }
    return path;
  }

  const radii = resolveCornerRadii(source.cornerRadius, width, height);
  if (radii.tl <= 0 && radii.tr <= 0 && radii.br <= 0 && radii.bl <= 0) {
    path.rect(x, y, width, height);
  } else if (typeof path.roundRect === "function") {
    path.roundRect(
      x,
      y,
      width,
      height,
      radii.isUniform ? radii.uniformRadius : radii.asArray,
    );
  } else if (radii.isUniform) {
    const rad = radii.uniformRadius;
    path.moveTo(x + rad, y);
    path.arcTo(x + width, y, x + width, y + height, rad);
    path.arcTo(x + width, y + height, x, y + height, rad);
    path.arcTo(x, y + height, x, y, rad);
    path.arcTo(x, y, x + width, y, rad);
    path.closePath();
  } else {
    const { tl, tr, br, bl } = radii;
    path.moveTo(x + tl, y);
    path.lineTo(x + width - tr, y);
    path.arcTo(x + width, y, x + width, y + tr, tr);
    path.lineTo(x + width, y + height - br);
    path.arcTo(x + width, y + height, x + width - br, y + height, br);
    path.lineTo(x + bl, y + height);
    path.arcTo(x, y + height, x, y + height - bl, bl);
    path.lineTo(x, y + tl);
    path.arcTo(x, y, x + tl, y, tl);
    path.closePath();
  }
  return path;
}

/**
 * A combined shape.
 *
 * Composited on a layer of its own rather than straight onto the page,
 * because `destination-out` and friends act on everything already drawn —
 * done in place, subtracting one shape would punch a hole through the artwork
 * underneath it. The layer is sized in device pixels from the live transform,
 * so the result stays as sharp as the zoom it is drawn at.
 *
 * Exported for the renderer unit tests; drawNode is the real caller.
 */
export function drawBooleanNode(ctx, node, renderState = null) {
  const sources = node.sources ?? [];
  if (sources.length < 2) return;

  const transform = ctx.getTransform?.();
  // The horizontal scale of the live transform is the zoom times the device
  // ratio — what one document unit is worth in real pixels right now.
  const scale = transform ? Math.abs(transform.a) || 1 : 1;
  const pixelWidth = Math.max(1, Math.ceil(node.width * scale));
  const pixelHeight = Math.max(1, Math.ceil(node.height * scale));

  const key = renderState
    ? `${renderState.docVersion}|${node.id ?? "boolean"}|${renderSignature(sources)}|${node.operation}|${pixelWidth}x${pixelHeight}`
    : null;
  let layer = key ? getRenderCache("boolean", key) : null;
  if (!layer) {
    layer = document.createElement("canvas");
    layer.width = pixelWidth;
    layer.height = pixelHeight;
    const layerCtx = layer.getContext("2d");
    if (!layerCtx) return;
    layerCtx.scale(pixelWidth / node.width, pixelHeight / node.height);

    const composite = BOOLEAN_COMPOSITE[node.operation] ?? "source-over";
    // Opaque black builds the silhouette; the fill is painted through it below,
    // which is what lets a gradient follow the combined outline rather than
    // each part separately.
    layerCtx.fillStyle = "#000000";
    layerCtx.fill(booleanSourcePath(sources[0]));
    for (let index = 1; index < sources.length; index += 1) {
      layerCtx.globalCompositeOperation = composite;
      layerCtx.fill(booleanSourcePath(sources[index]));
    }
    if (key) setRenderCache("boolean", key, layer);
  }

function hexToRgb(hex) {
  if (typeof hex !== "string") return [0, 0, 0];
  const cleaned = hex.trim().replace(/^#/, "");
  if (cleaned.length === 3) {
    return [
      parseInt(cleaned[0] + cleaned[0], 16),
      parseInt(cleaned[1] + cleaned[1], 16),
      parseInt(cleaned[2] + cleaned[2], 16),
    ];
  }
  if (cleaned.length >= 6) {
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  }
  return [0, 0, 0];
}

function applyBooleanStroke(
  targetCanvas,
  node,
  pixelWidth,
  pixelHeight,
  scale,
  sources,
) {
  const strokeWidth = node.strokeWidth ?? 0;
  const stroke = node.stroke;
  const strokeAlpha = node.strokeOpacity ?? 1;
  if (
    !(strokeWidth > 0) ||
    !stroke ||
    stroke === "transparent" ||
    !(strokeAlpha > 0)
  ) {
    return;
  }
  const lctx = targetCanvas.getContext("2d");
  if (!lctx) return;

  lctx.save();
  lctx.strokeStyle = stroke;
  lctx.lineWidth = strokeWidth * scale;
  lctx.globalAlpha = strokeAlpha;

  let painted = false;
  if (typeof lctx.getImageData === "function") {
    try {
      const pixels = lctx.getImageData(0, 0, pixelWidth, pixelHeight);
      if (pixels?.data) {
        const alpha = new Uint8Array(pixelWidth * pixelHeight);
        let hasAlpha = false;
        for (let i = 0; i < alpha.length; i += 1) {
          alpha[i] = pixels.data[i * 4 + 3];
          if (alpha[i] > 0) hasAlpha = true;
        }
        if (hasAlpha) {
          const ring = buildStrokeRing(
            alpha,
            pixelWidth,
            pixelHeight,
            strokeWidth * scale,
            node.strokeAlign ?? "inside",
          );
          if (ring) {
            const image = lctx.createImageData(pixelWidth, pixelHeight);
            const [cr, cg, cb] = hexToRgb(stroke);
            for (let i = 0; i < ring.length; i += 1) {
              if (ring[i] > 0) {
                image.data[i * 4] = cr;
                image.data[i * 4 + 1] = cg;
                image.data[i * 4 + 2] = cb;
                image.data[i * 4 + 3] = Math.round(ring[i] * strokeAlpha);
              }
            }
            lctx.putImageData(image, 0, 0);
            painted = true;
          }
        }
      }
    } catch {
      // Fall through to path stroke
    }
  }

  if (!painted && Array.isArray(sources)) {
    for (const source of sources) {
      lctx.stroke(booleanSourcePath(source));
    }
  }
  lctx.restore();
}

  // Preserve the direct renderer's one-layer path for exports and unit tests
  // that deliberately do not opt into frame caching.
  if (!key) {
    const layerCtx = layer.getContext("2d");
    if (!layerCtx) return;
    if (node.fill && node.fill !== "transparent") {
      layerCtx.globalCompositeOperation = "source-in";
      layerCtx.fillStyle = node.fill;
      layerCtx.fillRect(0, 0, node.width, node.height);
    }
    applyBooleanStroke(layer, node, pixelWidth, pixelHeight, scale, sources);
    ctx.drawImage(layer, node.x, node.y, node.width, node.height);
    return;
  }

  // The cached layer is the opaque silhouette. Copy it before applying the
  // current fill so a colour/gradient change never mutates cached pixels.
  const paint = document.createElement("canvas");
  paint.width = pixelWidth;
  paint.height = pixelHeight;
  const layerCtx = paint.getContext("2d");
  if (!layerCtx) return;
  layerCtx.drawImage(layer, 0, 0);

  if (node.fill && node.fill !== "transparent") {
    layerCtx.globalCompositeOperation = "source-in";
    layerCtx.fillStyle = node.fill;
    layerCtx.fillRect(0, 0, node.width, node.height);
  }
  applyBooleanStroke(paint, node, pixelWidth, pixelHeight, scale, sources);

  ctx.drawImage(paint, node.x, node.y, node.width, node.height);
}
