/**
 * Our editor document, expressed as the scene the Skia renderer draws.
 *
 * Facade module re-exporting documentToScene and documentsToScene.
 */

import { resolveCornerRadii } from "./scene_model_core.js";
import { isGroupNode, isHiddenByGroup } from "./scene_model.js";
import { elementFor } from "./skia_adapter_elements.js";
import { toSkiaBlendMode } from "./skia_adapter_paint.js";

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
  return Boolean(
    doc?.timeline ||
    doc?.nodes?.some(
      (node) =>
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
  { offsetX = 0, offsetY = 0, resolveImageUrl },
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
    opacity: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
    zIndex: 0,
    clipContent: true,
    fills:
      doc.backgroundColor && doc.backgroundColor !== "transparent"
        ? [{ color: doc.backgroundColor, opacity: 1 }]
        : [{ color: "#ffffff", opacity: 1 }],
  };

  const nodes = doc.nodes
    // A folder is chrome — a row in the layers panel — not artwork, so it has
    // nothing to paint itself. What it does carry is state for everything
    // inside it: hiding a folder hides its contents, and that reaches them
    // through the folder rather than through their own `visible` flag. Both
    // rules are the ones drawNode applies, so the two renderers agree about
    // what is on screen.
    .filter((node) => !isGroupNode(node) && !isHiddenByGroup(doc, node))
    .map((node, index) =>
      elementFor(node, index, offsetX, offsetY, resolveImageUrl, doc),
    )
    .filter(Boolean)
    // A stroke can unfold into many elements — one soft stamp each, plus
    // arrowheads — where every other node is a single element.
    .flat();

  return [frame, ...nodes];
}

/**
 * Several documents laid out along one axis, as a single scene.
 *
 * This is the whole reason for the move: pages are positions in one scene, so
 * opening another costs a few elements rather than a canvas, an engine and a
 * GPU context.
 */
export function documentsToScene(
  docs,
  { axis = "horizontal", resolveImageUrl },
) {
  const elements = [];
  let offsetX = 0;
  let offsetY = 0;
  for (const doc of docs) {
    elements.push(
      ...documentToScene(doc, { offsetX, offsetY, resolveImageUrl }),
    );
    if (axis === "horizontal") offsetX += doc.width + PAGE_GAP;
    else offsetY += doc.height + PAGE_GAP;
  }
  return elements;
}
