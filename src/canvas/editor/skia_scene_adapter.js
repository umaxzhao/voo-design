import { frameSceneFills } from "./frame-fills.js";
import { isPlainRectList } from './render_plain_rects.js';
/**
 * Our editor document, expressed as the scene the Skia renderer draws.
 *
 * Facade module re-exporting documentToScene and documentsToScene.
 */

import { resolveCornerRadii } from "./scene_model_core.js";
import { isGroupNode, isHiddenByGroup } from "./scene_model.js";
import { cachedElementFor as elementFor } from "./skia-rect-scene-cache.js";
import { toSkiaBlendMode, strokeOf } from "./skia_adapter_paint.js";
import { isBoxOffscreen } from "./viewport_culling.js";
import { hasUnsupportedBooleanSources } from "./unsupported-boolean-sources.js";

/** Where a page sits in world space when several are laid out at once. */
export const PAGE_GAP = 80;

/** A PSD-only blend mode (dissolve, vivid-light, ...) that only the Canvas2D
 * per-pixel compositor can draw. */
function hasCanvas2dOnlyBlendMode(node) {
  const mode = node.blendMode;
  return (
    Boolean(mode) &&
    mode !== "source-over" &&
    mode !== "normal" &&
    !toSkiaBlendMode(mode)
  );
}

/** Check if a node specifies non-uniform per-corner radii. */
function hasIndependentCornerRadius(node) {
  if (!node || !node.cornerRadius || typeof node.cornerRadius !== "object") return false;
  return !resolveCornerRadii(node.cornerRadius, node.width, node.height).isUniform;
}

/** Skia has no video decoder, transparent GLTF compositor or PSD-only blend
 * modes. Route the whole composition through Canvas2D so layer order,
 * clipping, opacity and blending agree. */
export function requiresCanvas2dMediaFallback(doc) {
  const nodes = doc?.nodes ?? [];
  const clippingFrames = new Set(nodes.filter((node) => node.isFrame && node.clipContent !== false).map((node) => node.id));
  return Boolean(
    doc?.timeline ||
    // Nested Frame ancestry is not represented by this flat scene adapter.
    // Preserve the established document coordinates and clips in Canvas2D.
    nodes.some((node) => clippingFrames.has(node.parentId)) ||
    doc?.nodes?.some(
      (node) =>
        // The scene adapter cannot express painted alpha/luminance mask chains
        // or per-paint blends. Use the compositor that preserves their pixels.
        node.maskBase || node.clipTo || Array.isArray(node.fills) ||
        hasUnsupportedBooleanSources(node) ||
        node.fillHidden || node.strokeHidden ||
        (Array.isArray(node.strokes) && node.strokes.some((stroke) => stroke?.visible !== false && stroke?.strokeWidth > 0)) ||
        // Image/text scene elements do not carry their node stroke. Keep the
        // authoritative border/glyph compositor rather than silently dropping it.
        (["image", "text"].includes(node.kind) && node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent") ||
        // Effects and rectangle dash styles have no adapter representation.
        // Preserve their pixels with the existing authoritative compositor.
        node.layerBlur > 0 || node.backgroundBlur > 0 || node.noise ||
        node.effects && Object.values(node.effects).some((effect) => effect?.enabled) ||
        node.strokeDash && node.strokeDash !== "solid" ||
        (node.kind === "image" && (node.fillOpacity ?? 1) !== 1) ||
        /^(?:blob:|data:image\/|https?:|file:)/i.test(node.fill ?? "") ||
        node.fillBlendMode && node.fillBlendMode !== "source-over" ||
        node.kind === "video" ||
        node.kind === "model3d" ||
        node.kind === "adjustment" ||
        (node.animations?.length ?? 0) > 0 ||
        node.timing ||
        hasCanvas2dOnlyBlendMode(node) ||
        hasIndependentCornerRadius(node),
    ),
  );
}

/**
 * Turns one document into a frame and its contents.
 *
 * `resolveImageUrl` is passed in rather than read from the store, because the
 * caller is the only thing that knows whether it wants the live object URL or
 * an exported one.
 */
export function documentToScene(
  doc,
  { offsetX = 0, offsetY = 0, resolveImageUrl, visibleRect },
) {
  if (requiresCanvas2dMediaFallback(doc)) {
    throw new Error("Media and motion documents require the Canvas2D renderer");
  }
  const frame = {
    id: `frame-${doc.id ?? "page"}`,
    parentId: null,
    kind: "frame",
    title: doc.title ?? "Canvas",
    bounds: { x: offsetX, y: offsetY, width: doc.width, height: doc.height },
    visible: true,
    opacity: doc.opacity ?? 1,
    rotation: doc.rotation ?? 0,
    flipX: doc.flipX ?? false,
    flipY: doc.flipY ?? false,
    zIndex: 0,
    clipContent: doc.clipContent ?? true,
    cornerRadius: doc.cornerRadius ?? 0,
    cornerRadii: doc.cornerRadii ?? null,
    stroke: doc.stroke ? strokeOf(doc) : undefined,
    effects: doc.effects ?? [],
    fills: frameSceneFills(doc),
  };

  // Frustum culling: if frame is entirely offscreen, omit its children
  if (visibleRect && !doc.isCanvasRoot) {
    const frameBox = { x: offsetX, y: offsetY, width: doc.width, height: doc.height };
    if (isBoxOffscreen(frameBox, visibleRect)) {
      return [frame];
    }
  }

  // Flat rectangle frames dominate large design pages. Reuse immutable scene
  // elements directly instead of allocating four intermediate lists and a new
  // parented element per rectangle on every camera or single-object drag.
  if (isPlainRectList(doc.nodes ?? [])) {
    const elements = doc.isCanvasRoot ? [] : [frame];
    const parentId = doc.isCanvasRoot ? null : frame.id;
    for (let index = 0; index < (doc.nodes?.length ?? 0); index++) {
      const node = doc.nodes[index];
      const x = (node.x ?? 0) + offsetX;
      const y = (node.y ?? 0) + offsetY;
      if (visibleRect && (x + node.width < visibleRect.minX || y + node.height < visibleRect.minY ||
          x > visibleRect.maxX || y > visibleRect.maxY)) continue;
      elements.push(elementFor(node, index, offsetX, offsetY, resolveImageUrl, doc, parentId));
    }
    return elements;
  }

  const nodes = (doc.nodes || [])
    // A folder is chrome — a row in the layers panel — not artwork, so it has
    // nothing to paint itself. What it does carry is state for everything
    // inside it: hiding a folder hides its contents, and that reaches them
    // through the folder rather than through their own `visible` flag. Both
    // rules are the ones drawNode applies, so the two renderers agree about
    // what is on screen.
    .filter((node) => (!isGroupNode(node) || node.isFrame) && !isHiddenByGroup(doc, node))
    .filter((node) => {
      if (!visibleRect) return true;
      const nodeBox = {
        x: (node.x ?? 0) + offsetX,
        y: (node.y ?? 0) + offsetY,
        width: node.width ?? 0,
        height: node.height ?? 0,
      };
      return !isBoxOffscreen(nodeBox, visibleRect);
    })
    .map((node, index) =>
      elementFor(node, index, offsetX, offsetY, resolveImageUrl, doc),
    )
    .filter(Boolean)
    // A stroke can unfold into many elements — one soft stamp each, plus
    // arrowheads — where every other node is a single element.
    .flat()
    .map((el) => {
      if (!el.parentId && !doc.isCanvasRoot) {
        return { ...el, parentId: frame.id };
      }
      return el;
    });

  return doc.isCanvasRoot ? nodes : [frame, ...nodes];
}

/**
 * Several documents laid out along one axis or by layout map, as a single scene.
 *
 * This is the whole reason for the move: pages are positions in one scene, so
 * opening another costs a few elements rather than a canvas, an engine and a
 * GPU context.
 */
export function documentsToScene(
  docs,
  { axis = "horizontal", resolveImageUrl, layouts, spatialIndex, visibleRect } = {},
) {
  // Native paint-order array avoids a full document filter on camera frames.
  const only = docs.length === 1 ? docs[0] : null;
  if (only && !layouts && !only.layout && !only.bounds && spatialIndex?.drawList && visibleRect &&
      isPlainRectList(only.nodes)) {
    const { ids } = spatialIndex.drawList(visibleRect);
    const nodes = Array.from(ids, slot => spatialIndex.items[slot]?.node).filter(Boolean);
    return documentToScene({ ...only, nodes }, { resolveImageUrl, visibleRect });
  }
  const elements = [];
  let offsetX = 0;
  let offsetY = 0;

  let visibleIds = null;
  if (spatialIndex && visibleRect) {
    const hits = spatialIndex.search(visibleRect);
    if (hits && hits.length > 0) {
      visibleIds = new Set(hits.map((h) => h.id));
    }
  }

  for (const doc of docs) {
    if (!doc) continue;
    let docOffsetX = offsetX;
    let docOffsetY = offsetY;

    if (layouts) {
      const docId = doc.id || doc.canvasId;
      const layout =
        layouts instanceof Map
          ? (layouts.get(docId) ?? (doc.id ? layouts.get(doc.id) : null))
          : (layouts[docId] ?? (doc.id ? layouts[doc.id] : null));
      if (layout) {
        docOffsetX = layout.x ?? docOffsetX;
        docOffsetY = layout.y ?? docOffsetY;
      }
    } else if (doc.layout || doc.bounds) {
      const l = doc.layout || doc.bounds;
      docOffsetX = l.x ?? docOffsetX;
      docOffsetY = l.y ?? docOffsetY;
    }

    let docToRender = doc;
    if (visibleIds && doc.nodes) {
      docToRender = {
        ...doc,
        nodes: doc.nodes.filter((n) => visibleIds.has(n.id)),
      };
    }

    elements.push(
      ...documentToScene(docToRender, {
        offsetX: docOffsetX,
        offsetY: docOffsetY,
        resolveImageUrl,
        visibleRect,
      }),
    );

    if (axis === "horizontal") offsetX += doc.width + PAGE_GAP;
    else offsetY += doc.height + PAGE_GAP;
  }
  return elements;
}
