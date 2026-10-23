import { designSystemFields } from "./design_tokens.js";
// Seam: Document serialization, deserialization, and display helpers.
/* eslint-disable no-unused-vars */
import {
  REGION_PALETTE,
  REGION_COLOR,
  getRegionColor,
  MIN_REGION_SIZE,
  LEGACY_DOC_VERSION,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_RATIO,
  TEXT_FONT_WEIGHTS,
  TEXT_ALIGNS,
  DEFAULT_TEXT_STYLE,
  MIN_DOC_SIZE,
  BLEND_MODES,
  normalizeBlendMode,
  MAX_SHEAR_DEG,
  normalizeCornerRadius,
  normalizeRotationDeg,
  normalizeNodeTransform,
  hasBlendModes,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
  deepEqual,
  normalizePoints,
  parseAdjustmentValue,
  HUE_BAND_KEYS,
  normalizeHueSatBands,
  DOC_VERSION,
  NODE_KIND,
  DEFAULT_BLEND_MODE,
  newId,
  createDefaultAdjustments,
  getBaseDefaults,
  createDocument,
  createImageNode,
} from "./scene_model_core.js";
import { normalizeAdjustments } from "./scene_model_adjustments.js";
import { normalizeColorVariables } from "./scene_color_variables.js";
import {
  deserializeVariables,
  resolveDocumentVariables,
  serializeVariables,
} from "./scene_variables.js";
import {
  deserializeComments,
  serializeComments,
} from "../comments/comment_model.js";
import {
  deserializeStyles,
  resolveStyleBindings,
  serializeStyles,
} from "./scene_styles.js";
import { normalizeBooleanNode } from "./scene-boolean-serialization.js";
import { normalizeStoredImageCrop } from "./image_layer_crop.js";
export { normalizeBooleanNode } from "./scene-boolean-serialization.js";
import { validateAndNormalizeModifierCollection } from "./scene-linear-array-validation.js";
import { assertNotEvaluatedFrame } from "./scene-evaluated-frame.js";
import * as canvasComposition from "./canvas-composition-model.js";
import {
  normalizeGradientStops,
  normalizeMixerRow,
  normalizeInkRow,
  normalizeColorBalanceZone,
  normalizeHexColor,
  BASE_DEFAULTS,
  DEFAULT_PAGE_BACKGROUND,
  effectivePage,
} from "./scene_model_geometry.js";
import {
  createAdjustmentNode,
  isAdjustmentNode,
  createRectNode,
  createEllipseNode,
  BOOLEAN_SOURCE_KINDS,
  canCombine,
  booleanSourceOf,
  syncBooleanNode,
  createBooleanNode,
  DEFAULT_BRUSH_HARDNESS,
  DEFAULT_SOFT_BRUSH_HARDNESS,
  normalizePathHardness,
} from "./scene_model_node_builders.js";
import {
  createPathNode,
  pathBounds,
  normalisePenAnchor,
  cubicExtrema1D,
  penAnchorsBounds,
  createPenNode,
} from "./scene_model_paths.js";
import {
  createTextNode,
  normalizeColourOrNull,
  normalizeTextShadow,
  normalizeDropShadow,
  normalizeOuterGlow,
  normalizeBevel,
  normalizeFill,
  normalizeStroke,
  normalizeInnerShadow,
  normalizeInnerGlow,
  normalizeSatin,
  normalizeGradientOverlay,
  normalizeEffects,
  normalizeTextStyle,
} from "./scene_model_text_effects.js";
import {
  REGION_INTENTS,
  DEFAULT_REGION_INTENT,
  normalizeRegionIntent,
  normalizeWarpControls,
  createRegionNode,
  isRegionNode,
  createGroupNode,
  isGroupNode,
  isBooleanNode,
  isContainerNode,
  groupChildren,
  booleanChildren,
  isInsideBooleanGroup,
  groupDescendants,
  topLevelGroupOf,
  isHiddenByGroup,
  isLockedByGroup,
  regionParts,
  regionName,
  regionsOf,
  promptLayersOf,
  imageUnderRect,
  textLines,
} from "./scene_model_groups.js";

/** Node box, for hit-testing and the selection frame. */
/* eslint-enable no-unused-vars */
export function nodeRect(node) {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function findNode(doc, id) {
  return doc.nodes.find((node) => node.id === id) ?? null;
}

/**
 * Serialisable form of the document.
 *
 * Image nodes keep only their `imageId`; the bytes live in IndexedDB and the
 * `src` object URL dies with the session, so persisting either would bloat the
 * record and still not survive a reload.
 */
export function serialiseDocument(doc) {
  assertNotEvaluatedFrame(doc);
  const colorVariables = normalizeColorVariables(doc.colorVariables);
  const comments = serializeComments(doc);
  return {
    version: DOC_VERSION,
    ...canvasComposition.serializeCanvasFields(doc),
    ...designSystemFields(doc),
    width: doc.width,
    height: doc.height,
    backgroundColor: doc.backgroundColor ?? "transparent",
    ...(colorVariables.length > 0 ? { colorVariables } : {}),
    // A non-destructive crop travels with the document; without it the full
    // canvas is shown.
    ...(doc.crop ? { crop: doc.crop } : {}),
    // Guide lines from the rulers persist with the document.
    ...(Array.isArray(doc.guides) ? { guides: doc.guides } : {}),
    // Variables v2 (collections, modes and their values) are document tokens.
    ...serializeVariables(doc),
    // Named paint / text / effect styles are document-level tokens too; each
    // node keeps its `styleIds` refs on the node record itself.
    ...serializeStyles(doc),
    // Canvas comment threads belong to the page, like guides do.
    ...(comments.length > 0 ? { comments } : {}),
    ...(doc.modifiers !== undefined
      ? (() => {
          const valid = validateAndNormalizeModifierCollection(
            doc.modifiers,
            doc.nodes,
          );
          return valid.length > 0 ? { modifiers: valid } : {};
        })()
      : {}),
    nodes: doc.nodes.map((node) => {
      const copy = canvasComposition.serializeCanvasNode(node);
      // Image object URLs are session-only. Media may carry a durable URL;
      // blob URLs still resolve through assetId after hydration.
      if (copy.src?.startsWith("blob:")) delete copy.src;
      // v2: don't persist a node's neutral adjustments — an unchanged layer
      // carries no signal, and dropping the default per node is what shrinks
      // the record. `deserialiseDocument` restores the default on read.
      if (isDefaultAdjustments(copy.adjustments)) delete copy.adjustments;
      if (copy.cornerRadius !== undefined) {
        copy.cornerRadius = normalizeCornerRadius(copy.cornerRadius);
      }
      return copy;
    }),
  };
}

/**
 * Reads a serialised document back, dropping anything unrecognised.
 *
 * Returns null for a document this build cannot read — including the Fabric
 * documents written by earlier versions, which have no `version` field. The
 * caller then opens the flattened picture instead of failing.
 */
export function deserialiseDocument(value) {
  if (!value) return null;
  // Accept the current version and the legacy version: v1 docs wrote warp/
  // perspective as absolute document-space coordinates and must still load
  // (re-anchored) so a pre-migration save is not silently dropped. Anything
  // else is a document this build cannot read.
  if (value.version !== DOC_VERSION && value.version !== LEGACY_DOC_VERSION) {
    return null;
  }
  const legacy = value.version === LEGACY_DOC_VERSION;
  if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) {
    return null;
  }
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const readable = nodes.filter(isReadableNode).map((node) => {
    const readableNode = {
      ...node,
      locked: Boolean(node.locked),
      // A PSD layer's transparency lock (protected.transparency) travels
      // with the import and the brush honours it: locked pixels only take
      // paint over existing content (see editor_paint.js stampLocked).
      ...(node.lockTransparency ? { lockTransparency: true } : {}),
      ...(node.lockPosition ? { lockPosition: true } : {}),
      ...(node.lockImagePixels ? { lockImagePixels: true } : {}),
      blendMode: normalizeBlendMode(node.blendMode),
      ...normalizeNodeTransform(node),
      adjustments: normalizeAdjustments(node.adjustments),
      effects: normalizeEffects(node.effects),
      ...(node.kind === NODE_KIND.TEXT ? normalizeTextStyle(node) : {}),
      ...(node.kind === NODE_KIND.RECT
        ? { cornerRadius: normalizeCornerRadius(node.cornerRadius) }
        : node.kind === NODE_KIND.IMAGE && node.cornerRadius != null
          ? { cornerRadius: normalizeCornerRadius(node.cornerRadius) }
          : {}),
      ...(node.kind === NODE_KIND.PATH
        ? { hardness: normalizePathHardness(node.hardness) }
        : {}),
      ...(node.kind === NODE_KIND.BOOLEAN ? normalizeBooleanNode(node) : {}),
      ...(node.kind === NODE_KIND.REGION
        ? {
            intent: normalizeRegionIntent(node.intent),
            ...(typeof node.hostId === "string" ? { hostId: node.hostId } : {}),
            ...(Array.isArray(node.points) && node.points.length > 0
              ? {
                  points: node.points.map((point) => ({
                    x: point.x,
                    y: point.y,
                  })),
                }
              : {}),
          }
        : {}),
      // Documents written before the warp controls moved to node-local
      // ratios stored absolute document coordinates; re-anchor those so a
      // saved perspective/mesh edit still lands on the same picture.
      ...(node.kind === NODE_KIND.IMAGE
        ? normalizeWarpControls(node, legacy)
        : {}),
    };
    if (node.kind === NODE_KIND.IMAGE) {
      const crop = normalizeStoredImageCrop(node.crop);
      if (crop) readableNode.crop = crop;
      else delete readableNode.crop;
    } else {
      delete readableNode.crop;
    }
    const name = normalizeNodeName(node.name);
    if (name === undefined) delete readableNode.name;
    else readableNode.name = name;
    // The spread above carries a stored arrow flag through verbatim; only a
    // literal true on a path is real, anything else normalises away.
    if (readableNode.arrow !== true || node.kind !== NODE_KIND.PATH) {
      delete readableNode.arrow;
    }
    // The line/poly/closed shape flags follow the same rule as `arrow`:
    // literal true on a path node, anything else normalises away.
    for (const flag of ["line", "poly", "closed"]) {
      if (readableNode[flag] !== true || node.kind !== NODE_KIND.PATH) {
        delete readableNode[flag];
      }
    }
    // Same rule for the pen flag: literal true on a path node.
    if (readableNode.pen !== true || node.kind !== NODE_KIND.PATH) {
      delete readableNode.pen;
    }
    // Same rule for the paint-layer flag: literal true on an image node.
    if (readableNode.paint !== true || node.kind !== NODE_KIND.IMAGE) {
      delete readableNode.paint;
    }
    // Keyframe tracks belonged to the removed animation editor; old files drop them.
    delete readableNode.animations;
    return canvasComposition.normalizeCanvasNode(readableNode);
  });
  const variablesPatch = deserializeVariables(value);
  const colorVariables = variablesPatch.colorVariables ?? [];
  const comments = deserializeComments(value);
  const colorById = new Map(colorVariables.map((item) => [item.id, item]));
  for (const node of readable) {
    if (node.fillVariableId) {
      const variable = colorById.get(node.fillVariableId);
      if (variable) node.fill = variable.value;
      else delete node.fillVariableId;
    }
    if (node.strokeVariableId) {
      const variable = colorById.get(node.strokeVariableId);
      if (variable) node.stroke = variable.value;
      else delete node.strokeVariableId;
    }
  }
  // Group membership survives only when it is sound: the parent must be a
  // group that itself survived the read, and following the chain from any
  // node must reach the root without cycling. Anything else flattens to the
  // top level, which is what a document written before groups existed reads
  // as anyway.
  const groupIds = new Set(readable.filter(isGroupNode).map((node) => node.id));
  // A region's host is different: it names the image the annotation sits
  // on, and any surviving image is a legal host regardless of groups.
  const imageIds = new Set(
    readable
      .filter((node) => node.kind === NODE_KIND.IMAGE)
      .map((node) => node.id),
  );
  // Cycle detection reads the original links, so one node's clean-up cannot
  // hide another node's cycle behind it.
  const originalParent = new Map(
    readable.map((node) => [node.id, node.parentId]),
  );
  for (const node of readable) {
    // A region's group link is checked like anyone else's, but its host
    // image link survives on its own.
    if (
      isRegionNode(node) &&
      typeof node.hostId === "string" &&
      !imageIds.has(node.hostId)
    ) {
      delete node.hostId;
    }
    if (typeof node.parentId !== "string" || !groupIds.has(node.parentId)) {
      delete node.parentId;
      continue;
    }
    const seen = new Set([node.id]);
    let cursor = node.parentId;
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic = true;
        break;
      }
      seen.add(cursor);
      cursor = originalParent.get(cursor);
    }
    if (cyclic) delete node.parentId;
  }
  // A clipping mask is only valid when the target layer survived the read.
  // The base must paint (no group rows or regions) and must sit below the
  // clipped layer, or the mask would clip into itself or into thin air.
  const allIds = new Set(readable.map((node) => node.id));
  const paintOrder = new Map(readable.map((node, index) => [node.id, index]));
  for (const node of readable) {
    if (typeof node.clipTo !== "string" || !allIds.has(node.clipTo)) {
      delete node.clipTo;
      continue;
    }
    const base = readable.find((candidate) => candidate.id === node.clipTo);
    const baseIndex = paintOrder.get(node.clipTo);
    const nodeIndex = paintOrder.get(node.id);
    if (
      !base ||
      isGroupNode(base) ||
      isRegionNode(base) ||
      baseIndex >= nodeIndex
    ) {
      delete node.clipTo;
    }
  }
  const nextDocument = {
    version: DOC_VERSION,
    ...canvasComposition.deserializeCanvasFields(value),
    ...designSystemFields(value),
    width: value.width,
    height: value.height,
    backgroundColor: value.backgroundColor ?? "transparent",
    ...(colorVariables.length > 0 ? { colorVariables } : {}),
    // A non-destructive crop comes back only when it is a sane, in-bounds
    // rect; anything else is dropped so the full canvas shows instead.
    ...(isFiniteCrop(value.crop, value.width, value.height)
      ? { crop: value.crop }
      : {}),
    // Rulers' guide lines travel with the document like they do in a PSD.
    ...(Array.isArray(value.guides) ? { guides: value.guides } : {}),
    ...(value.modifiers !== undefined
      ? (() => {
          const valid = validateAndNormalizeModifierCollection(
            value.modifiers,
            readable,
          );
          return valid.length > 0 ? { modifiers: valid } : {};
        })()
      : {}),
    // Array order is paint order, and regions are the plane above the artwork.
    // Sorting on the way in means nothing downstream has to re-check that.
    nodes: [
      ...readable.filter((node) => !isRegionNode(node)),
      ...readable.filter(isRegionNode),
    ],
  };
  // v2 variables, named styles and comment threads are restored after the node
  // graph is sound. Named styles materialise first, then variables resolve —
  // a variable bound to a property wins over the style value while both keep
  // their binding ids intact.
  return resolveDocumentVariables(
    resolveStyleBindings({
      ...nextDocument,
      ...(variablesPatch.variablesV2
        ? { variablesV2: variablesPatch.variablesV2 }
        : {}),
      ...deserializeStyles(value),
      ...(comments.length > 0 ? { comments } : {}),
    }),
  );
}

/** Whether a serialised crop is worth keeping: finite and inside the canvas. */
export function isFiniteCrop(crop, docWidth, docHeight) {
  if (!crop) return false;
  const { x, y, width, height } = crop;
  if (![x, y, width, height].every(Number.isFinite)) return false;
  return (
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= docWidth &&
    y + height <= docHeight
  );
}

/**
 * A user-given layer name. Anything that is not a non-empty trimmed string
 * normalises away, so an unnamed node falls back to the generated label and
 * a serialised node never carries a junk `name`.
 */
export function normalizeNodeName(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isReadableNode(node) {
  return (
    node &&
    Object.values(NODE_KIND).includes(node.kind) &&
    canvasComposition.assertCanvasNodeReadable(node) &&
    typeof node.id === "string" &&
    Number.isFinite(node.x) &&
    Number.isFinite(node.y) &&
    Number.isFinite(node.width) &&
    Number.isFinite(node.height)
  );
}

/** A readable name for the layers list — the user's rename wins when set. */
export function describeNode(node, index, labels) {
  const named = normalizeNodeName(node.name);
  if (named) return named;
  if (node.kind === NODE_KIND.REGION) {
    return String(node.label ?? "").slice(0, 18) || labels.region;
  }
  if (node.kind === NODE_KIND.TEXT) {
    return String(node.text ?? "").slice(0, 18) || labels.text;
  }
  if (node.kind === NODE_KIND.PATH) {
    if (node.pen === true) return labels.pen ?? labels.brush;
    if (node.arrow === true) return labels.arrow ?? labels.layer;
    if (node.line === true) return labels.line ?? labels.layer;
    if (node.poly === true) {
      if (node.polyKind === "star") return labels.star ?? labels.layer;
      return labels.polygon ?? labels.layer;
    }
    return labels.brush;
  }
  if (node.kind === NODE_KIND.RECT) return labels.rect;
  if (node.kind === NODE_KIND.ELLIPSE) return labels.ellipse;
  if (node.kind === NODE_KIND.IMAGE) return labels.image;
  if (node.kind === NODE_KIND.CANVAS_INSTANCE)
    return labels.canvasInstance ?? labels.layer;
  if (node.kind === NODE_KIND.GROUP) {
    if (node.frame || node.isFrame || node.containerType === "frame") {
      return labels.frame ?? "Frame";
    }
    return labels.group ?? labels.layer;
  }
  if (node.kind === NODE_KIND.BOOLEAN) {
    const opKey = `combine.${node.operation ?? "union"}`;
    return labels[opKey] ?? labels.boolean ?? labels.layer;
  }
  if (node.kind === NODE_KIND.ADJUSTMENT)
    return labels.adjustment ?? labels.layer;
  return `${labels.layer} ${index + 1}`;
}

/** Which colour field a node paints with — strokes for paths, fills otherwise. */
export function colourKeyOf(node) {
  return node.kind === NODE_KIND.PATH ? "stroke" : "fill";
}

export function supportsColour(node) {
  return (
    node.kind !== NODE_KIND.REGION &&
    node.kind !== NODE_KIND.GROUP &&
    node.kind !== NODE_KIND.ADJUSTMENT
  );
}
