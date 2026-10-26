import { ellipseArcPath, hasEllipseArc } from "./ellipse_arc.js";
/**
 * Node to Skia scene element mapping.
 */

import { resolveCornerRadii } from "./scene_model_core.js";
import { NODE_KIND } from "./scene_model.js";

function skiaCornerRadiiProps(cornerRadius, width, height) {
  if (cornerRadius == null || cornerRadius === 0) return { cornerRadius: 0 };
  const radii = resolveCornerRadii(cornerRadius, width, height);
  if (radii.isUniform) {
    return { cornerRadius: radii.uniformRadius };
  }
  return {
    cornerRadius: 0,
    cornerRadii: {
      topLeft: radii.tl,
      topRight: radii.tr,
      bottomRight: radii.br,
      bottomLeft: radii.bl,
    },
  };
}
import {
  buildStrokeRibbon,
  dashPatternFor,
  effectiveStrokeAlign,
  effectiveStrokeCap,
  normalizeStrokeProps,
} from "./stroke_style.js";
import { mapAdjustmentsToSkia } from "./skia_adjustment_support.js";
import { baseOf, fillsOf, strokeOf } from "./skia_adapter_paint.js";
import {
  arrowheadElements,
  pathDataFor,
  softStrokeElements,
} from "./skia_adapter_paths.js";

/**
 * One node.
 *
 * Regions are ours alone — a prompt-authoring annotation with no counterpart
 * in the scene model — so they are left for the overlay pass rather than
 * pushed through a shape that would only approximate them.
 */
export function elementFor(node, index, offsetX, offsetY, resolveImageUrl, doc) {
  const base = baseOf(node, index, offsetX, offsetY, doc);

  if (node.kind === NODE_KIND.IMAGE) {
    // The fill types on an image node are alternatives, matching the 2D
    // renderer: the image fill is the bitmap itself, while a solid or
    // gradient fill replaces it. An image-URL fill is not a vector paint and
    // leaves the picture in place.
    const hasVectorFill =
      typeof node.fill === "string" &&
      node.fill !== "transparent" &&
      !/^(?:blob:|data:image\/|https?:|file:)/i.test(node.fill) &&
      (node.fillOpacity ?? 1) > 0 &&
      node.fillHidden !== true;
    // Only carry `imageAdjustments` when at least one of the seven factors is
    // active — an all-zero (no-op) object matches canvas-core's own
    // "all-zero => null matrix" behaviour and keeps the element lean.
    const imageAdjustments = mapAdjustmentsToSkia(node.adjustments);
    return {
      ...base,
      kind: "node",
      nodeType: "image",
      shape: "image",
      title: node.name ?? "Image",
      imageUrl: hasVectorFill
        ? undefined
        : (resolveImageUrl(node) ?? undefined),
      imageFit: "fill",
      ...(node.crop ? { sourceRect: { ...node.crop } } : {}),
      fills: hasVectorFill ? fillsOf(node) : undefined,
      ...(imageAdjustments ? { imageAdjustments } : {}),
      ...skiaCornerRadiiProps(node.cornerRadius, node.width, node.height),
    };
  }

  if (node.kind === NODE_KIND.RECT) {
    return {
      ...base,
      kind: "node",
      nodeType: "rect",
      shape: "rect",
      title: node.name ?? "Rectangle",
      fills: fillsOf(node),
      stroke: strokeOf(node),
      ...skiaCornerRadiiProps(node.cornerRadius, node.width, node.height),
    };
  }

  if (node.kind === NODE_KIND.ELLIPSE) {
    return {
      ...base,
      kind: "node",
      nodeType: hasEllipseArc(node) ? "path" : "ellipse",
      shape: hasEllipseArc(node) ? "path" : "ellipse",
      ...(hasEllipseArc(node) ? { pathData: ellipseArcPath(node), fillRule: "evenodd" } : {}),
      title: node.name ?? "Ellipse",
      fills: fillsOf(node),
      stroke: strokeOf(node),
    };
  }

  if (node.kind === NODE_KIND.BOOLEAN) {
    return {
      ...base,
      kind: "node",
      nodeType: "boolean",
      shape: "boolean",
      title: node.name ?? "Combined shape",
      fills: fillsOf(node),
      stroke: strokeOf(node),
      // The renderer combines these with real path operations at paint time,
      // which is why the document stores the parts and not an outline — and
      // why a nested combination stays exact here where the 2D path has to
      // flatten it.
      booleanOperation: node.operation,
      booleanSources: node.sources,
    };
  }

  if (node.kind === NODE_KIND.PATH) {
    // Three things a plain stroked path cannot carry, each built the way the
    // 2D renderer builds it: a stroke that is soft (`hardness` < 1) or carries
    // per-point pressure stamps along the curve — here as filled circles at
    // the positions and sizes of the shared `forEachSoftStamp` walk, exactly
    // the 2D routing rule; `arrow` adds barbs — always their own solid
    // round-capped elements, on either body. A named width profile is the one
    // construction the renderers do not share: the ribbon below stands in for
    // it in Skia, which is crisper than stamps and has been the path of
    // record here since it landed.
    const arrowHeads = arrowheadElements(node, base);
    const softOrPressed =
      (node.hardness ?? 1) < 1 ||
      (node.points ?? []).some(
        (pt) => typeof pt[2] === "number" && pt[2] !== 0.5,
      );
    if (
      softOrPressed &&
      (node.points?.length ?? 0) > 0 &&
      node.width > 0 &&
      node.height > 0
    ) {
      return [...softStrokeElements(node, base), ...arrowHeads];
    }
    const pathData = pathDataFor(node);
    if (!pathData) return arrowHeads.length ? arrowHeads : null;
    const strokeStyle = normalizeStrokeProps(node);
    // A variable-width stroke has no stroked-path equivalent — a stroked path
    // can only be one width — so the ribbon outline is precomputed here, using
    // the same construction the 2D renderer fills, and carried to the painter
    // as a ring. `buildStrokeRibbon` already returns null for a uniform
    // profile or fewer than two anchors, which is exactly the fall-back to the
    // ordinary uniform stroke. The ring is world-space; the painter translates
    // an element by its bounds origin, so it is re-based to the node's own
    // (local) coordinates here — the opposite of the SVG export, which hands
    // the renderer world coordinates as-is.
    const ribbon = buildStrokeRibbon(node, strokeStyle.profile);
    const body = {
      ...base,
      kind: "node",
      nodeType: "path",
      shape: "path",
      title: node.name ?? "Stroke",
      pathData,
      fillRule: node.fillRule ?? "evenodd",
      // A poly shape (polygon/star) or closed pen path is a closed, fillable outline;
      // a plain stroke is open, so the renderer strokes it rather than closing it
      // into a fillable region.
      pathClosed:
        node.poly === true ||
        Boolean(
          node.points?.length &&
            node.points[node.points.length - 1]?.close === true,
        ),
      // The fill the shape or pen tools draw with; an unclosed stroke carries none.
      ...(node.poly === true || (node.fill && node.fill !== "transparent")
        ? { fills: fillsOf(node) }
        : {}),
      // A fill-only poly or pen path (strokeWidth 0, the shape tools' default) has no
      // stroke to paint — the 2D renderer skips it on the same condition.
      ...((node.poly === true || node.pen === true) && !(node.strokeWidth > 0)
        ? {}
        : {
            stroke: {
              color: node.stroke,
              opacity: node.strokeOpacity ?? node.opacity ?? 1,
              width: node.strokeWidth ?? 1,
              lineCap: effectiveStrokeCap(strokeStyle.cap, strokeStyle.dash),
              lineJoin: strokeStyle.join,
              miterLimit: strokeStyle.miterLimit,
              dash: dashPatternFor(strokeStyle.dash, node.strokeWidth ?? 1),
              align: effectiveStrokeAlign(
                strokeStyle.align,
                Boolean(
                  node.poly ||
                  (node.points?.length &&
                    node.points[node.points.length - 1]?.close === true),
                ),
              ),
              // The filled ribbon for a variable-width stroke, in local coordinates;
              // absent for a uniform width so the stroke falls back to the plain
              // stroked path above.
              ...(ribbon
                ? { ribbon: ribbon.map(([x, y]) => [x - node.x, y - node.y]) }
                : {}),
            },
          }),
    };
    return arrowHeads.length ? [body, ...arrowHeads] : body;
  }

  if (node.kind === NODE_KIND.TEXT) {
    const boxWidth = node.boxWidth ?? 0;
    return {
      ...base,
      // A fixed box's scene bounds are the wrap column, even before the
      // engine's measurement pass has run — the mapper must not depend on
      // node.width having been measured already.
      bounds: {
        ...base.bounds,
        width:
          boxWidth > 0
            ? Math.max(base.bounds.width, boxWidth)
            : base.bounds.width,
      },
      kind: "node",
      nodeType: "text",
      shape: "text",
      title: node.name ?? node.text ?? "Text",
      text: node.text ?? "",
      textColor: node.fill ?? "#000000",
      fontFamily: node.fontFamily,
      fontSize: node.fontSize,
      italic: Boolean(node.italic),
      // Our model stores CSS keywords or numeric weights; Skia wants the
      // numeric axis. Legacy documents carry "normal"/"bold".
      fontWeight:
        node.fontWeight === "bold"
          ? 700
          : node.fontWeight === "normal"
            ? 400
            : Number(node.fontWeight) || 400,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
      // Point text hugs the glyphs, matching how the editor measures it; a
      // fixed text box (boxWidth > 0) lays out to its wrap column instead —
      // the same column the 2D renderer wraps at.
      textAlign: node.align ?? "left",
      textAutoWidth: !(boxWidth > 0),
    };
  }

  return null;
}
