import { applyFigmaNodeProperties } from "./figma-node-properties.js";
import { applyFigmaGeometry, figmaRootBounds } from "./figma-node-transform.js";
import { figmaObject as asObject, figmaArray as asArray, figmaNumber as asNumber, figmaString as asString, figmaHashHex as hashHex } from "./figma-value.js";
import { createImageNode } from "../editor/scene_doc_factory.js";
import { createEllipseNode, createRectNode } from "../editor/scene_model_node_builders.js";
import { createGroupNode } from "../editor/scene_model_groups.js";
import { NODE_KIND } from "../editor/scene_model_core.js";
import { createTextNode } from "../editor/scene_model_text_effects.js";
import { vectorToPenNode } from "./figma-path-nodes.js";
import { isFigmaFontAvailable, textStyleOf } from "./figma-text.js";
import { textOutlinePath } from "./figma-glyph-outline.js";
import { importedTextSignature } from "../editor/imported-text-cache.js";
import { blendModeOf, effectsOf } from "./figma-effects.js";
import { imageBytesToDataUrl } from "./fig-file.js";
import { CONTAINER_TYPES, VECTOR_TYPES, RECT_TYPES, ELLIPSE_TYPES } from "./figma-node-types.js";
import { fillPaintsOf, solidPaintHex, gradientPaintFill, imagePaint } from "./figma-scene-paints.js";
function applyCommon(node, ctx, layer) {
  applyFigmaGeometry(node, layer);
  applyFigmaNodeProperties(node.raw, layer, { outlinedStroke: VECTOR_TYPES.has(node.type) && asArray(node.raw.strokeGeometry).length > 0 });
  const opacity = asNumber(node.raw.opacity, 1);
  if (opacity < 1) layer.opacity = Math.max(0, opacity);
  if (node.raw.visible === false) layer.visible = false;
  layer.blendMode = blendModeOf(node.raw);
  if (layer.kind !== NODE_KIND.GROUP && !(VECTOR_TYPES.has(node.type) && asArray(node.raw.strokeGeometry).length > 0 && asArray(node.raw.fillGeometry).length === 0)) {
    const paints = fillPaintsOf(node.raw, ctx);
    if (paints.length) {
      const first = paints.find((paint) => paint.visible) ?? paints[0];
      layer.fill = first.fill;
      layer.fillOpacity = first.opacity;
      layer.fillHidden = !first.visible;
      if (first.imageId) layer.imageId = first.imageId;
      if (first.imageScaleMode) {
        layer.imageScaleMode = first.imageScaleMode;
        if (first.imageTransform) layer.imageTransform = first.imageTransform;
        if (first.imageTileScale) layer.imageTileScale = first.imageTileScale;
      }
      if (paints.length > 1) layer.fills = paints;
      else layer.fillBlendMode = first.blendMode;
    }
  }
  const { effects, layerBlur, backgroundBlur, noise } = effectsOf(node.raw);
  if (effects) layer.effects = effects;
  if (layerBlur > 0) layer.layerBlur = layerBlur;
  if (backgroundBlur > 0) layer.backgroundBlur = backgroundBlur;
  if (noise) layer.noise = noise;
  return layer;
}

function noteFont(ctx, font) {
  const entry = ctx.fonts.get(font.family) ?? { family: font.family, styles: new Set(), count: 0 };
  entry.styles.add(font.style);
  entry.count += 1;
  ctx.fonts.set(font.family, entry);
}

function note(ctx, message) {
  ctx.warnings.set(message, (ctx.warnings.get(message) ?? 0) + 1);
}

/** A single painted leaf: text, image, ellipse or rectangle (approximations included). */
function buildLeaf(node, box, ctx) {
  const fills = node.raw.fillPaints;
  const strokes = node.raw.strokePaints;
  if (node.type === "TEXT") {
    const text = asString(asObject(node.raw.textData)?.characters);
    if (!text) return null;
    const fontSize = asNumber(node.raw.fontSize, 0) > 0 ? asNumber(node.raw.fontSize) : undefined;
    const style = textStyleOf(node.raw, fontSize);
    noteFont(ctx, style.figmaFont);
    // Keep text editable while preserving its original glyph appearance.
    // Decorations require separate native geometry and use editable layout.
    const { figmaFont, ...fields } = style;
    const decorated = node.raw.textDecoration === "UNDERLINE" ||
      asArray(node.raw.derivedTextData?.decorations).length > 0;
    const path = decorated ? "" : textOutlinePath(node.raw, ctx.blobs);
    const layer = applyCommon(node, ctx, {
      ...createTextNode({
        x: box.x,
        y: box.y,
        text,
        fill: solidPaintHex(fills) ?? "#000000",
        fontSize,
      }),
      ...fields,
      ...(path ? { width: box.width, height: box.height } : {}),
      figmaFont,
      fontMissing: !isFigmaFontAvailable(figmaFont.family),
      name: node.name,
    });
    if (path) {
      layer.figmaText = { path, width: box.width, height: box.height,
        signature: importedTextSignature(layer), textData: structuredClone(node.raw.textData) };
    }
    return layer;
  }

  const image = imagePaint(fills);
  if (image && !VECTOR_TYPES.has(node.type) && node.type !== "ELLIPSE") {
    const hash = hashHex(asObject(image.image)?.hash);
    const bytes = hash && ctx.images.get(hash);
    if (hash && ctx.imageHashes.has(hash)) {
      const imageId = `img-${hash}`;
      if (!ctx.externalAssets) {
        if (!bytes) {
          note(ctx, "image-fill-missing");
          return null;
        }
        ctx.assets[imageId] = imageBytesToDataUrl(bytes);
      }
      return applyCommon(node, ctx, createImageNode({ ...box, imageId, name: node.name }));
    }
    note(ctx, "image-fill-missing");
  }

  if (VECTOR_TYPES.has(node.type)) {
    const pen = vectorToPenNode(node.raw, box, ctx.blobs, vectorColors(node.raw));
    if (pen) return applyCommon(node, ctx, { ...pen, name: node.name });
    note(ctx, `approximated:${node.type}`);
  }

  const fill = solidPaintHex(fills) ?? gradientPaintFill(fills) ?? "transparent";
  const strokeColor = solidPaintHex(strokes);
  const stroke = strokeColor ?? "transparent";
  const strokeWidth = strokeColor && asNumber(node.raw.strokeWeight) > 0 ? asNumber(node.raw.strokeWeight) : 0;

  if (ELLIPSE_TYPES.has(node.type)) {
    return applyCommon(node, ctx, { ...createEllipseNode({ ...box, fill, stroke, strokeWidth }), name: node.name });
  }

  if (!RECT_TYPES.has(node.type) && !CONTAINER_TYPES.has(node.type) && !VECTOR_TYPES.has(node.type)) {
    note(ctx, `approximated:${node.type}`);
  }
  const rect = createRectNode({ ...box, fill, stroke, strokeWidth });
  const radius = asNumber(node.raw.cornerRadius);
  if (radius > 0) rect.cornerRadius = radius;
  return applyCommon(node, ctx, { ...rect, name: node.name });
}

/**
 * Colours for a decoded vector. Geometry that already carries Figma's stroke
 * outline is one filled region: a stroke-only outline takes the stroke colour,
 * a filled shape keeps its fill colour.
 */
function vectorColors(raw) {
  const fillColor = solidPaintHex(raw.fillPaints) ?? gradientPaintFill(raw.fillPaints);
  const strokeColor = solidPaintHex(raw.strokePaints);
  const hasFill = asArray(raw.fillGeometry).length > 0;
  const hasOutline = hasFill || asArray(raw.strokeGeometry).length > 0;
  if (hasOutline) {
    const color = hasFill ? fillColor ?? strokeColor : strokeColor ?? fillColor;
    return { fill: color ?? "transparent", stroke: "transparent", strokeWidth: 0 };
  }
  return {
    fill: fillColor ?? "transparent",
    stroke: strokeColor ?? "transparent",
    strokeWidth: strokeColor && asNumber(raw.strokeWeight) > 0 ? asNumber(raw.strokeWeight) : 0,
  };
}

function hasOwnPaint(node) {
  return gradientPaintFill(node.raw.fillPaints) !== null || solidPaintHex(node.raw.fillPaints) !== null || solidPaintHex(node.raw.strokePaints) !== null || imagePaint(node.raw.fillPaints) !== null;
}

function isFrameContainer(type) {
  return (
    type === "FRAME" ||
    type === "COMPONENT" ||
    type === "COMPONENT_SET" ||
    type === "INSTANCE" ||
    type === "SECTION" ||
    type === "SYMBOL"
  );
}

/**
 * Emits one node and its subtree into `out`, preserving Frame vs Group semantics
 * and full multi-level container nesting. `originX/Y` is the coordinate origin
 * of the node's parent space; `parentId` links to a parent Frame or Group.
 */
/**
 * A Figma mask is a node flagged `mask: true`. Only leaf shapes mask: a frame's
 * `maskType` is a clip of its own children, which the editor already does with
 * `clipContent`.
 */
function isMaskLeaf(node) {
  return node.raw.mask === true && !CONTAINER_TYPES.has(node.type);
}

/**
 * Emits a container's children in stacking order. A Figma mask clips the
 * siblings above it (up to the next mask), and the editor's `clipTo` needs its
 * clip base below the layers it clips, which is the order Figma already gives.
 * Each covered sibling therefore points `clipTo` at the mask.
 */
export function emitChildren(children, originX, originY, parentId, out, ctx, emit = emitNode) {
  let activeMask = null;
  for (const child of children) {
    if (isMaskLeaf(child)) {
      const before = out.length;
      emit(child, originX, originY, parentId, out, ctx);
      activeMask = out[before] ?? null;
      if (activeMask) {
        activeMask.maskBase = true;
        // NodeChange.maskType is the MaskType enum: ALPHA, OUTLINE, LUMINANCE.
        if (child.raw.maskType === "LUMINANCE") activeMask.maskType = "luminance";
        note(ctx, "mask-applied");
      }
      continue;
    }
    const before = out.length;
    emit(child, originX, originY, parentId, out, ctx);
    if (!activeMask) continue;
    for (const emitted of out.slice(before)) {
      if (emitted.kind !== NODE_KIND.GROUP) emitted.clipTo = activeMask.id;
    }
  }
}

function emitNode(node, originX, originY, parentId, out, ctx) {
  const absX = originX + node.x;
  const absY = originY + node.y;
  const box = { x: absX, y: absY, width: node.w, height: node.h };
  node.mappingOffset = { x: originX, y: originY };
  const childOriginX = originX, childOriginY = originY;

  if (CONTAINER_TYPES.has(node.type) && node.children.length > 0) {
    const isFrame = isFrameContainer(node.type);
    const group = applyCommon(node, ctx, {
      ...createGroupNode({ ...box, parentId: parentId ?? null }),
      name: node.name,
      isFrame,
      frame: isFrame,
      containerType: isFrame ? "frame" : "group",
      ...(isFrame && asNumber(node.raw.cornerRadius) > 0 ? { cornerRadius: asNumber(node.raw.cornerRadius) } : {}),
      ...(isFrame ? { clipContent: typeof node.raw.clipContent === "boolean" ? node.raw.clipContent : node.type !== "SECTION" && node.raw.frameMaskDisabled !== true } : {}),
    });
    out.push(group);
    if (hasOwnPaint(node)) {
      const painted = buildLeaf(node, box, ctx);
      if (painted) {
        out.push({
          ...painted,
          parentId: group.id,
          name: isFrame ? `${node.name} Background` : node.name,
          isFrameBackground: isFrame,
        });
      }
    }
    emitChildren(node.children, childOriginX, childOriginY, group.id, out, ctx);
    return;
  }

  if (CONTAINER_TYPES.has(node.type)) {
    const isFrame = isFrameContainer(node.type);
    const group = applyCommon(node, ctx, {
      ...createGroupNode({ ...box, parentId: parentId ?? null }),
      name: node.name,
      isFrame,
      frame: isFrame,
      containerType: isFrame ? "frame" : "group",
      ...(isFrame && asNumber(node.raw.cornerRadius) > 0 ? { cornerRadius: asNumber(node.raw.cornerRadius) } : {}),
      ...(isFrame ? { clipContent: typeof node.raw.clipContent === "boolean" ? node.raw.clipContent : node.type !== "SECTION" && node.raw.frameMaskDisabled !== true } : {}),
    });
    out.push(group);
    if (hasOwnPaint(node)) {
      const painted = buildLeaf(node, box, ctx);
      if (painted) {
        out.push({
          ...painted,
          parentId: group.id,
          name: isFrame ? `${node.name} Background` : node.name,
          isFrameBackground: isFrame,
        });
      }
    }
    return;
  }

  const leaf = buildLeaf(node, box, ctx);
  if (!leaf) return;
  leaf.parentId = parentId ?? null;
  out.push(leaf);
}

/**
 * Emits one top-level object of a Figma page.
 * Keeps Frames as Frames and Groups as Groups, with all multi-level children
 * nested cleanly under their parentId rather than being flattened or forced into
 * an unwanted single wrapper. Symbol definitions put layers directly on the page.
 */
export function emitPageRoot(root, originX, originY, out, ctx) {
  if (root.type === "SYMBOL") {
    for (const child of root.children) {
      emitNode(child, originX, originY, null, out, ctx);
    }
    return;
  }
  emitNode(root, originX, originY, null, out, ctx);
}

export function canvasPage(roots, label, ctx, background = "transparent") {
  const { minX, minY, maxX, maxY } = figmaRootBounds(roots);
  const nodes = [];
  emitChildren(roots, -minX, -minY, null, nodes, ctx, (root, x, y, _parent, out, context) => emitPageRoot(root, x, y, out, context));
  return { label, width: maxX - minX, height: maxY - minY, nodes, left: minX, top: minY, background };
}
