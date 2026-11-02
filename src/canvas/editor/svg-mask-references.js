import { NODE_KIND, isHiddenByGroup } from "./scene_model.js";
import { number } from "./editor_svg_xml.js";
import { paintedNodeBounds } from "./painted-node-bounds.js";
import { paintsBeyondFill } from "./svg-stroke-paints.js";
import { containerMaskNode } from "./container-opacity.js";

const CLIP_SHAPE_KINDS = new Set([NODE_KIND.RECT, NODE_KIND.ELLIPSE, NODE_KIND.PATH]);
const SINGLE_SHAPE_ELEMENT = /^<(rect|ellipse|path)\s[^<]*\/>$/;

function isOpaqueSolid(fill) {
  if (typeof fill !== "string") return false;
  const value = fill.trim().toLowerCase();
  if (value === "none" || value === "transparent") return false;
  if (value.startsWith("#")) {
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) return true;
    return /^#[0-9a-f]{3}f$|^#[0-9a-f]{6}ff$/.test(value);
  }
  return /^rgb\(/.test(value) || /^[a-z]+$/.test(value);
}

/**
 * A `<clipPath>` keeps only geometry, so it reproduces the stage's alpha clip
 * exactly only for an opaque, solid-filled, unstroked vector base.
 */
function clipsAsGeometry(base, markup) {
  return (
    base.maskType !== "luminance" &&
    CLIP_SHAPE_KINDS.has(base.kind) &&
    (base.opacity ?? 1) >= 1 &&
    (base.fillOpacity ?? 1) >= 1 &&
    base.fillHidden !== true &&
    isOpaqueSolid(base.fill) &&
    !paintsBeyondFill(base) &&
    markup.length === 1 &&
    SINGLE_SHAPE_ELEMENT.test(markup[0])
  );
}

/**
 * Defines the clip for layers clipped to `base` and returns the attribute
 * that applies it, or null when the base renders nothing to clip with.
 * Any other base becomes a `<mask>` holding its painted markup: alpha for a
 * clipping mask (opacity, gradients and strokes all count, as on the stage),
 * luminance for a Figma luminance mask.
 */
function clipReference(base, markup, defs, id) {
  if (markup.length === 0) return null;
  if (clipsAsGeometry(base, markup)) {
    const shape = markup[0].replace(/fill-rule="([^"]+)"/, 'fill-rule="$1" clip-rule="$1"');
    defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${shape}</clipPath>`);
    return `clip-path="url(#${id})"`;
  }
  const type = base.maskType === "luminance" ? "luminance" : "alpha";
  const area = paintedNodeBounds(base);
  defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="${number(area.x - 1)}" y="${number(area.y - 1)}" width="${number(area.width + 2)}" height="${number(area.height + 2)}" mask-type="${type}" style="mask-type:${type}">${markup.join("")}</mask>`,
  );
  return `mask="url(#${id})"`;
}

/** Parent mask chains contribute alpha before masking a complete container. */
export function createSvgMaskReferences({ doc, byId, defs, nodeMarkup, opacityPlan }) {
  const references = new Map();
  function referenceOf(base, isolated, seen = new Set()) {
    if (!base || base.visible === false || isHiddenByGroup(doc, base) || seen.has(base.id)) return null;
    const key = JSON.stringify([base.id, [...isolated]]);
    if (references.has(key)) return references.get(key);
    const paint = containerMaskNode(base, isolated, opacityPlan);
    let markup = nodeMarkup(paint, isolated);
    if (base.clipTo) {
      const inherited = referenceOf(byId.get(base.clipTo), isolated, new Set([...seen, base.id]));
      if (!inherited) return null;
      markup = [`<g ${inherited}>${markup.join("")}</g>`];
    }
    const reference = clipReference(paint, markup, defs, `chain-clip-${references.size}`);
    references.set(key, reference);
    return reference;
  }
  return referenceOf;
}
