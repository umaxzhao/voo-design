import { isDefaultAdjustments } from "../editor/scene_model_core.js";
import { packPresentationPptx } from "./presentation-pptx-zip.js";
import {
  baseEntries,
  contentTypes,
  slideSize,
} from "./presentation-pptx-package.js";
import {
  isClosedPath,
  notesXml,
  parseColor,
  pictureXml,
  relationships,
  resolveStrokeAlign,
  shapeXml,
  slideXml,
  textXml,
} from "./presentation-pptx-xml.js";

const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpeg" };
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function throwIfAborted(signal) {
  if (signal?.aborted)
    throw new DOMException("Presentation export aborted", "AbortError");
}

function validateImage(image) {
  const extension = IMAGE_TYPES[image?.mimeType];
  const bytes = image?.bytes;
  const valid =
    extension &&
    bytes instanceof Uint8Array &&
    bytes.length > 3 &&
    Number.isFinite(image.width) &&
    image.width > 0 &&
    Number.isFinite(image.height) &&
    image.height > 0 &&
    (extension === "png"
      ? PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
  if (!valid)
    throw new Error(
      "Presentation image must be PNG or JPEG bytes with dimensions",
    );
  return { ...image, extension };
}

function sameBytes(left, right) {
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

function registerMedia(image, media, entries) {
  const existing = media.find(
    (item) =>
      item.mimeType === image.mimeType && sameBytes(item.bytes, image.bytes),
  );
  if (existing) return existing.path;
  const path = `image${media.length + 1}.${image.extension}`;
  media.push({ ...image, path });
  entries.push([`ppt/media/${path}`, image.bytes]);
  return path;
}

function hasValidCropShape(crop) {
  return (
    crop &&
    [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) &&
    crop.width > 0 &&
    crop.height > 0
  );
}

function imageSourceRect(node, image) {
  if (!node.crop) return null;
  const { x, y, width, height } = node.crop;
  const left = Math.max(0, Math.min(image.width, x));
  const top = Math.max(0, Math.min(image.height, y));
  const right = Math.max(left, Math.min(image.width, x + width));
  const bottom = Math.max(top, Math.min(image.height, y + height));
  if (right <= left || bottom <= top) return null;
  if (left === 0 && top === 0 && right === image.width && bottom === image.height)
    return null;
  return {
    left: left / image.width,
    top: top / image.height,
    right: (image.width - right) / image.width,
    bottom: (image.height - bottom) / image.height,
  };
}

const FONT_WEIGHT_KEYWORDS = new Set([
  "normal",
  "bold",
  "lighter",
  "bolder",
  "thin",
  "hairline",
  "extra-light",
  "ultra-light",
  "light",
  "regular",
  "medium",
  "semi-bold",
  "demi-bold",
  "semibold",
  "extra-bold",
  "ultra-bold",
  "extrabold",
  "black",
  "heavy",
]);

function isValidFontWeight(weight) {
  if (weight === undefined || weight === null) return true;
  if (
    typeof weight === "string" &&
    FONT_WEIGHT_KEYWORDS.has(weight.toLowerCase())
  )
    return true;
  const num = Number(weight);
  return Number.isFinite(num) && num >= 100 && num <= 900;
}

function hasValidPathPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return false;
  return points.every((pt) => {
    if (Array.isArray(pt)) {
      return (
        pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
      );
    }
    if (pt && typeof pt === "object") {
      const okPos = Number.isFinite(pt.x) && Number.isFinite(pt.y);
      const okIn =
        !pt.in ||
        (Array.isArray(pt.in) &&
          pt.in.length >= 2 &&
          Number.isFinite(pt.in[0]) &&
          Number.isFinite(pt.in[1]));
      const okOut =
        !pt.out ||
        (Array.isArray(pt.out) &&
          pt.out.length >= 2 &&
          Number.isFinite(pt.out[0]) &&
          Number.isFinite(pt.out[1]));
      return okPos && okIn && okOut;
    }
    return false;
  });
}

const VALID_DASH_PRESETS = new Set(["solid", "dashed", "dotted"]);
const VALID_CAPS = new Set(["butt", "round", "square"]);
const VALID_JOINS = new Set(["miter", "round", "bevel"]);
const VALID_ARROW_CAPS = new Set([
  "lines",
  "triangle",
  "filled",
  "circle",
  "diamond",
]);
const VALID_ARROW_SIZES = new Set(["sm", "med", "lg"]);

function strokeReason(node) {
  if (node.strokeWidth > 0) {
    if (!parseColor(node.stroke)) return "unsupported-stroke-color";
    if (node.strokeWidthProfile && node.strokeWidthProfile !== "uniform")
      return "stroke-profile";
    const align = resolveStrokeAlign(node);
    if (align === "outside") return "stroke-align";
    if (align !== "center" && align !== "inside") return "stroke-align";
    if (
      node.kind === "path" &&
      !isClosedPath(node) &&
      node.strokeAlign &&
      node.strokeAlign !== "center"
    ) {
      return "stroke-align";
    }
    if (node.strokeDash && !VALID_DASH_PRESETS.has(node.strokeDash))
      return "stroke-dash";
    if (node.strokeCap && !VALID_CAPS.has(node.strokeCap))
      return "stroke-cap";
    if (node.strokeJoin && !VALID_JOINS.has(node.strokeJoin))
      return "stroke-join";
  }
  if (node.arrow || node.arrowStart || node.arrowEnd) {
    if (node.kind !== "path") return "unsupported-arrow";
    if (node.arrowCap && !VALID_ARROW_CAPS.has(node.arrowCap))
      return "unsupported-arrow-cap";
    if (
      node.arrowSize !== undefined &&
      node.arrowSize !== null &&
      typeof node.arrowSize === "string" &&
      !VALID_ARROW_SIZES.has(node.arrowSize)
    )
      return "unsupported-arrow-size";
  }
  return null;
}

// A page is only exported as editable objects when every visible layer is
// representable. One unsupported layer would otherwise silently change the
// composited result, so the caller rasterizes the entire page instead.
export function nodeReason(node) {
  if (!node || typeof node !== "object") return "invalid-node";
  if (
    !["text", "rect", "ellipse", "image", "path", "boolean"].includes(node.kind)
  )
    return `unsupported-node:${node.kind ?? "unknown"}`;
  if (
    node.clipTo ||
    node.maskId ||
    node.paint ||
    node.warpMesh ||
    node.perspectiveCorners ||
    node.puppetPins ||
    node.autoLayout
  )
    return "group-mask-or-transform";
  if (node.blendMode && node.blendMode !== "source-over") return "blend-mode";
  if (
    node.effects &&
    Object.entries(node.effects).some(
      ([key, effect]) => key !== "shadow" && effect?.enabled,
    )
  )
    return "layer-effects";
  if (node.adjustments && !isDefaultAdjustments(node.adjustments))
    return "adjustments";
  if (node.gradient || node.fillVariableId || node.strokeVariableId)
    return "dynamic-fill";
  if (node.shear || node.scaleX || node.scaleY)
    return "complex-transform";
  if (
    (node.fillOpacity ?? 1) !== 1 ||
    (node.strokeOpacity ?? 1) !== 1 ||
    node.fillHidden ||
    node.strokeHidden
  )
    return "complex-paint-opacity";
  if (
    ![
      node.x,
      node.y,
      node.width,
      node.height,
      node.rotation ?? 0,
      node.opacity ?? 1,
    ].every(Number.isFinite)
  )
    return "invalid-geometry";
  if (
    node.width <= 0 ||
    node.height <= 0 ||
    node.opacity < 0 ||
    node.opacity > 1
  )
    return "invalid-geometry";
  if (node.kind === "image") {
    if (typeof node.imageId !== "string" || !node.imageId)
      return "missing-image-id";
    if (
      (node.crop && !hasValidCropShape(node.crop)) ||
      node.sourceRect ||
      node.warpControls
    )
      return "image-crop-or-paint";
    if (
      node.fill &&
      node.fill !== "transparent" &&
      node.fill !== "none" &&
      !parseColor(node.fill)
    )
      return "unsupported-fill-color";
    const strokeErr = strokeReason(node);
    if (strokeErr) return strokeErr;
    return null;
  }
  if (node.kind === "path") {
    if (!hasValidPathPoints(node.points)) return "invalid-path-geometry";
  }
  if (node.kind === "text") {
    if (
      typeof node.text !== "string" ||
      !Number.isFinite(node.fontSize) ||
      node.fontSize <= 0
    )
      return "invalid-text";
    if (
      node.direction === "vertical" ||
      node.baselineShift ||
      node.stroke ||
      node.highlight ||
      node.shadow?.enabled ||
      node.textTransform
    )
      return "complex-text-style";
    if (
      !isValidFontWeight(node.fontWeight) ||
      !["left", "center", "right", "justify", undefined].includes(node.align)
    )
      return "complex-text-style";
    if ((node.lineHeight ?? 1.25) <= 0) return "complex-text-style";
  } else {
    const strokeErr = strokeReason(node);
    if (strokeErr) return strokeErr;
  }
  if (node.kind !== "image" && !parseColor(node.fill))
    return "unsupported-fill-color";
  return null;
}

function pageReason(page, size) {
  const doc = page?.doc;
  if (!doc || !Array.isArray(doc.nodes)) return "missing-native-scene";
  if (doc.version !== 2) return "unsupported-scene-version";
  if (
    !Number.isFinite(doc.width) ||
    !Number.isFinite(doc.height) ||
    doc.width <= 0 ||
    doc.height <= 0
  )
    return "invalid-scene-size";
  if (doc.width !== size.width || doc.height !== size.height)
    return "page-size-mismatch";
  if (
    doc.crop ||
    doc.timeline ||
    doc.background?.type ||
    (doc.backgroundColor &&
      doc.backgroundColor !== "transparent" &&
      !parseColor(doc.backgroundColor))
  )
    return "complex-page-style";
  for (const node of doc.nodes) {
    if (node?.visible === false) continue;
    const reason = nodeReason(node);
    if (reason) return reason;
  }
  return null;
}

async function editableShapes(
  page,
  scale,
  resolveImage,
  signal,
  media,
  entries,
  cache,
) {
  const images = [];
  const shapes = [];
  for (const node of page.doc.nodes) {
    throwIfAborted(signal);
    if (node.visible === false) continue;
    const id = shapes.length + 2;
    if (node.kind === "image") {
      if (typeof resolveImage !== "function")
        return { reason: "image-resolver-unavailable" };
      try {
        if (!cache.has(node.imageId))
          cache.set(node.imageId, await resolveImage(node.imageId));
        throwIfAborted(signal);
        const image = validateImage(cache.get(node.imageId));
        const path = registerMedia(image, media, entries);
        const relationshipId = `rId${3 + images.length}`;
        images.push([relationshipId, "image", `../media/${path}`]);
        shapes.push(
          pictureXml(
            id,
            node,
            relationshipId,
            scale,
            imageSourceRect(node, image),
          ),
        );
      } catch (error) {
        if (signal?.aborted) throw error;
        return { reason: "image-unavailable" };
      }
    } else if (node.kind === "text") shapes.push(textXml(id, node, scale));
    else shapes.push(shapeXml(id, node, scale));
  }
  return { shapes: shapes.join(""), images };
}

async function pageParts(page, index, reason, options, state, size) {
  const { entries, media, cache, warnings } = state;
  let built = reason
    ? null
    : await editableShapes(
        page,
        size.scale,
        options.resolveImage,
        options.signal,
        media,
        entries,
        cache,
      );
  if (built?.reason) reason = built.reason;
  if (reason) {
    if (typeof options.renderPage !== "function") {
      throw new Error(
        `Page ${page.id} requires raster fallback (${reason}), but renderPage is unavailable`,
      );
    }
    throwIfAborted(options.signal);
    const image = validateImage(await options.renderPage(page));
    throwIfAborted(options.signal);
    const path = registerMedia(image, media, entries);
    // A mismatched source page fits inside the deck without stretching its aspect ratio.
    const fit = Math.min(size.width / image.width, size.height / image.height);
    const rectangle = {
      x: (size.width - image.width * fit) / 2 / size.scale,
      y: (size.height - image.height * fit) / 2 / size.scale,
      width: (image.width * fit) / size.scale,
      height: (image.height * fit) / size.scale,
    };
    built = {
      shapes: pictureXml(2, rectangle, "rId3", size.scale),
      images: [["rId3", "image", `../media/${path}`]],
    };
    warnings.push({ pageId: page.id, reason });
  }
  const number = index + 1;
  entries.push([
    `ppt/slides/slide${number}.xml`,
    slideXml(
      built.shapes,
      reason ? "#ffffff" : (page.doc.backgroundColor ?? "transparent"),
    ),
  ]);
  entries.push([
    `ppt/notesSlides/notesSlide${number}.xml`,
    notesXml(page.notes),
  ]);
  entries.push([
    `ppt/slides/_rels/slide${number}.xml.rels`,
    relationships([
      ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
      ["rId2", "notesSlide", `../notesSlides/notesSlide${number}.xml`],
      ...built.images,
    ]),
  ]);
  entries.push([
    `ppt/notesSlides/_rels/notesSlide${number}.xml.rels`,
    relationships([
      ["rId1", "notesMaster", "../notesMasters/notesMaster1.xml"],
      ["rId2", "slide", `../slides/slide${number}.xml`],
    ]),
  ]);
}

/** Export ordered native scene pages. Unsupported pages require explicit full-page rendering. */
export async function buildPresentationPptx(
  deck,
  { resolveImage, renderPage, signal } = {},
) {
  if (!deck || !Array.isArray(deck.pages) || deck.pages.length === 0) {
    throw new TypeError("Presentation must contain at least one page");
  }
  const ids = new Set();
  for (const page of deck.pages) {
    if (!page || typeof page.id !== "string" || !page.id || ids.has(page.id)) {
      throw new TypeError("Presentation pages require unique IDs");
    }
    ids.add(page.id);
  }
  const size = slideSize(deck.width, deck.height);
  const state = {
    entries: baseEntries(deck, size),
    media: [],
    cache: new Map(),
    warnings: [],
  };
  for (const [index, page] of deck.pages.entries()) {
    throwIfAborted(signal);
    await pageParts(
      page,
      index,
      pageReason(page, deck),
      { resolveImage, renderPage, signal },
      state,
      size,
    );
  }
  state.entries.push(["[Content_Types].xml", contentTypes(deck.pages.length)]);
  return {
    blob: new Blob([packPresentationPptx(state.entries)], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    warnings: state.warnings,
  };
}
