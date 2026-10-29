/**
 * Vector export of an editor document as SVG.
 *
 * Rects, ellipses, paths, text and boolean nodes map onto native SVG shapes;
 * gradients become <linearGradient> defs; rotation is applied as a transform
 * on a <g> wrapper. Image nodes embed their bitmap when a `bitmapOf` callback
 * is provided (data URL), otherwise they are skipped. Pure, so tests can
 * drive it without a DOM.
 */

import { selectionBounds } from "./editor_export_bounds.js";
import { resolveCornerRadii } from "./scene_model_core.js";
import { NODE_KIND, effectivePage } from "./scene_model.js";
import { escapeXml, number, svgNodeTransform } from "./editor_svg_xml.js";
import { textElement } from "./editor_svg_text.js";
import { imageElement, roundedRectPathData } from "./editor_svg_image.js";
import {
  arrowheadSvgElements,
  booleanSourceToPathData,
  gradientDefs,
  pathData,
  polyPathData,
  renderBooleanSource,
  ribbonAttributes,
  ribbonPathData,
  shapeAttributes,
} from "./editor_svg_shapes.js";
import { buildStrokeRibbon, normalizeStrokeProps } from "./stroke_style.js";
import { detachInstance } from "./component_extract.js";
import { paintsBeyondFill, svgStrokeDefinitionNodes, svgStrokeMarkup } from "./svg-stroke-paints.js";

function expandInstances(doc, resolveCanvas, sourcePath = new Set()) {
  if (typeof resolveCanvas !== "function") return doc;
  const nodes = (doc.nodes ?? []).flatMap((node) => {
    if (node.kind !== NODE_KIND.CANVAS_INSTANCE || node.visible === false) {
      return [node];
    }
    const sourceId = node.sourceCanvasId;
    if (sourcePath.has(sourceId)) return [node];
    const source = resolveCanvas(sourceId);
    if (!source) return [node];
    const detached = detachInstance(
      { ...doc, nodes: [node] },
      node.id,
      source,
    ).doc;
    return expandInstances(
      detached,
      resolveCanvas,
      new Set([...sourcePath, sourceId]),
    ).nodes;
  });
  return { ...doc, nodes };
}

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
function clipReference(base, markup, defs) {
  if (markup.length === 0) return null;
  const id = `clip-${String(base.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
  if (clipsAsGeometry(base, markup)) {
    const shape = markup[0].replace(/fill-rule="([^"]+)"/, 'fill-rule="$1" clip-rule="$1"');
    defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${shape}</clipPath>`);
    return `clip-path="url(#${id})"`;
  }
  const type = base.maskType === "luminance" ? "luminance" : "alpha";
  defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="-50000" y="-50000" width="100000" height="100000" mask-type="${type}" style="mask-type:${type}">${markup.join("")}</mask>`,
  );
  return `mask="url(#${id})"`;
}

/**
 * Renders a document as an SVG string. Image nodes embed `bitmapOf(id)` when
 * provided (a data URL) and are skipped otherwise. `measureCtx` — a 2D
 * canvas context like the one the editor draws with — upgrades text nodes
 * to the same wrapped lines the main render paints.
 */
export function documentToSvg(
  doc,
  {
    bitmapOf = null,
    bitmapSizeOf = null,
    maskOf = null,
    measureCtx = null,
    transparent = false,
    resolveCanvas = null,
  } = {},
) {
  if (!doc) return "";
  doc = expandInstances(doc, resolveCanvas);
  const page = effectivePage(doc);
  const svgNodes = doc.nodes ?? [];
  const { defs, idOf } = gradientDefs([...svgNodes, ...svgStrokeDefinitionNodes(svgNodes)]);
  const body = [];

  if (!transparent && doc.backgroundColor && doc.backgroundColor !== "transparent") {
    body.push(
      `<rect x="${number(page.x)}" y="${number(page.y)}" width="${number(page.width)}" height="${number(page.height)}" fill="${escapeXml(
        doc.backgroundColor,
      )}"/>`,
    );
  }

  const singleNodeMarkup = (node) => {
    const out = [];
    // Locking prevents edits; visible locked artwork still belongs in exports.
    if (node.visible === false) return out;
    switch (node.kind) {
      case NODE_KIND.RECT: {
        const radii = resolveCornerRadii(
          node.cornerRadius,
          node.width,
          node.height,
        );
        if (radii.isUniform) {
          const radius =
            radii.uniformRadius > 0
              ? ` rx="${number(radii.uniformRadius)}"`
              : "";
          out.push(
            `<rect x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(
              node.height,
            )}"${radius} ${shapeAttributes(node, idOf)}/>`,
          );
        } else {
          out.push(
            `<path d="${roundedRectPathData(node.x, node.y, node.width, node.height, radii)}" ${shapeAttributes(node, idOf)}/>`,
          );
        }
        break;
      }
      case NODE_KIND.ELLIPSE:
        out.push(
          `<ellipse cx="${number(node.x + node.width / 2)}" cy="${number(node.y + node.height / 2)}" rx="${number(
            node.width / 2,
          )}" ry="${number(node.height / 2)}" ${shapeAttributes(node, idOf)}/>`,
        );
        break;
      case NODE_KIND.PATH: {
        // A polygon/star exports as its true closed outline with its fill —
        // shapeAttributes emits the fill and (only when stroked) the stroke.
        if (node.poly === true || node.polygon === true || node.star === true) {
          out.push(
            `<path d="${polyPathData(node)}" ${shapeAttributes(node, idOf)}/>`,
          );
          break;
        }
        // A non-uniform stroke-width profile has no SVG stroke equivalent, so
        // it exports as a filled ribbon polygon (buildStrokeRibbon returns
        // world coords, emitted as-is). Uniform profile and <2 anchors fall
        // back to the existing stroked-path branch.
        const hasStroke =
          node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent";
        const ribbon = hasStroke
          ? buildStrokeRibbon(node, normalizeStrokeProps(node).profile)
          : null;
        const arrowHeads = arrowheadSvgElements(node);
        if (arrowHeads.length > 0) {
          const transformAttr = svgNodeTransform(node);
          const shaft = ribbon
            ? `<path d="${ribbonPathData(ribbon)}" ${ribbonAttributes(node)}/>`
            : `<path d="${pathData(node)}" ${shapeAttributes({ ...node, rotation: 0, flipH: false, flipV: false }, idOf)}/>`;
          if (transformAttr) {
            out.push(`<g ${transformAttr}>${shaft}${arrowHeads.join("")}</g>`);
          } else {
            out.push(shaft, ...arrowHeads);
          }
          break;
        }
        if (ribbon) {
          out.push(
            `<path d="${ribbonPathData(ribbon)}" ${ribbonAttributes(node)}/>`,
          );
        } else {
          out.push(
            `<path d="${pathData(node)}" ${shapeAttributes(node, idOf)}/>`,
          );
        }
        break;
      }
      case NODE_KIND.BOOLEAN: {
        const fill = idOf(node.fill) ?? escapeXml(node.fill ?? "none");
        const fillAttr = `fill="${fill}"`;
        const sources = node.sources ?? [];
        if (sources.length === 0) break;
        const op = node.operation ?? "union";
        const groupTransform =
          svgNodeTransform(node) ||
          (node.rotation
            ? `transform="rotate(${number(node.rotation)} ${number(node.x)} ${number(node.y)})"`
            : "");

        if (op === "exclude") {
          const combinedD = sources
            .map((s) => booleanSourceToPathData(node, s))
            .join(" ");
          out.push(
            `<path fill-rule="evenodd" d="${combinedD}" ${fillAttr} ${groupTransform}/>`,
          );
        } else if (op === "subtract" && sources.length > 1) {
          const maskId = `mask_${node.id ?? Math.random().toString(36).slice(2)}`;
          const baseSource = renderBooleanSource(
            node,
            sources[0],
            'fill="white"',
          );
          const cutoutSources = sources
            .slice(1)
            .map((s) => renderBooleanSource(node, s, 'fill="black"'))
            .join("");
          defs.push(
            `<mask id="${maskId}" maskUnits="userSpaceOnUse">\n` +
              `    <rect x="-50000" y="-50000" width="100000" height="100000" fill="black"/>\n` +
              `    <g fill="white">${baseSource}</g>\n` +
              `    <g fill="black">${cutoutSources}</g>\n` +
              `  </mask>`,
          );
          out.push(
            `<g mask="url(#${maskId})" ${groupTransform}>${renderBooleanSource(node, sources[0], fillAttr)}</g>`,
          );
        } else if (op === "intersect" && sources.length > 1) {
          const maskId = `mask_${node.id ?? Math.random().toString(36).slice(2)}`;
          const clipSources = sources
            .slice(1)
            .map((s) => renderBooleanSource(node, s, 'fill="white"'))
            .join("");
          defs.push(
            `<mask id="${maskId}" maskUnits="userSpaceOnUse">\n` +
              `    <rect x="-50000" y="-50000" width="100000" height="100000" fill="black"/>\n` +
              `    <g fill="white">${clipSources}</g>\n` +
              `  </mask>`,
          );
          out.push(
            `<g mask="url(#${maskId})" ${groupTransform}>${renderBooleanSource(node, sources[0], fillAttr)}</g>`,
          );
        } else {
          // union (and single-source fallback):
          out.push(
            `<g ${groupTransform}>` +
              sources
                .map((source) => renderBooleanSource(node, source, fillAttr))
                .join("") +
              "</g>",
          );
        }
        break;
      }
      case NODE_KIND.TEXT: {
        out.push(textElement(node, measureCtx));
        break;
      }
      case NODE_KIND.IMAGE: {
        const imageSvg = imageElement(node, {
          bitmapOf,
          bitmapSizeOf,
          maskOf,
          defs,
        });
        if (imageSvg) {
          out.push(imageSvg);
        }
        break;
      }

      default:
        break;
    }
    return out;
  };
  const nodeMarkup = (node) => svgStrokeMarkup(node, singleNodeMarkup, defs);

  const nodes = doc.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const clipRefs = new Map();
  const clipRefOf = (base) => {
    if (!clipRefs.has(base.id)) {
      clipRefs.set(base.id, clipReference(base, nodeMarkup(base), defs));
    }
    return clipRefs.get(base.id);
  };

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.clipTo) {
      // Like the stage, consecutive layers clipped to one base composite as
      // one group, and the group is clipped once by the base.
      const baseId = node.clipTo;
      const members = [];
      while (i < nodes.length && nodes[i].clipTo === baseId) {
        members.push(...nodeMarkup(nodes[i]));
        i += 1;
      }
      i -= 1;
      const base = byId.get(baseId);
      if (!base || base.visible === false || members.length === 0) continue;
      const ref = clipRefOf(base);
      body.push(ref ? `<g ${ref}>${members.join("")}</g>` : members.join(""));
      continue;
    }
    // A Figma mask base paints nothing itself; it only clips its chain.
    if (node.maskBase) continue;
    body.push(...nodeMarkup(node));
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(page.width)}" height="${number(page.height)}" viewBox="${number(page.x)} ${number(page.y)} ${number(
      page.width,
    )} ${number(page.height)}">`,
    // A painted image base also renders its markup for the clip, which
    // repeats the image's own corner-clip def.
    defs.length ? `<defs>\n${[...new Set(defs)].join("\n")}\n</defs>` : "",
    ...body,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Exports an arbitrary collection of nodes as an SVG string with calculated viewBox.
 */
export function nodesToSvg(
  nodes,
  {
    width = null,
    height = null,
    bitmapOf = null,
    bitmapSizeOf = null,
    maskOf = null,
    resolveCanvas = null,
    measureCtx = null,
    backgroundColor = "transparent",
  } = {},
) {
  const list = Array.isArray(nodes) ? nodes : [nodes].filter(Boolean);
  // A Figma mask base stays in the list so its chain can clip to it, but it
  // paints nothing, so it neither sizes the export nor exports on its own.
  if (!list.some((node) => !node.maskBase)) return "";

  const bounds = selectionBounds(list.filter((node) => node.kind !== NODE_KIND.GROUP && !node.maskBase && node.visible !== false));
  if (!bounds) return "";
  const virtualDoc = {
    width: width ?? bounds.width,
    height: height ?? bounds.height,
    crop: { ...bounds, width: width ?? bounds.width, height: height ?? bounds.height },
    backgroundColor,
    nodes: list,
  };

  return documentToSvg(virtualDoc, {
    measureCtx,
    bitmapOf,
    bitmapSizeOf,
    maskOf,
    resolveCanvas,
  });
}

export { tokenizePath, parseSvgPath } from "./editor_svg_parse.js";
export { parseSvgStringToNodes, isSvgString } from "./editor_svg_import.js";
