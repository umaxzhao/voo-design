/**
 * Vector export of an editor document as SVG.
 *
 * Rects, ellipses, paths, text and boolean nodes map onto native SVG shapes;
 * gradients become <linearGradient> defs; rotation is applied as a transform
 * on a <g> wrapper. Image nodes embed their bitmap when a `bitmapOf` callback
 * is provided (data URL), otherwise they are skipped. Pure, so tests can
 * drive it without a DOM.
 */

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
    resolveCanvas = null,
  } = {},
) {
  if (!doc) return "";
  doc = expandInstances(doc, resolveCanvas);
  const page = effectivePage(doc);
  const { defs, idOf } = gradientDefs(doc.nodes ?? []);
  const body = [];

  if (doc.backgroundColor && doc.backgroundColor !== "transparent") {
    body.push(
      `<rect x="${number(page.x)}" y="${number(page.y)}" width="${number(page.width)}" height="${number(page.height)}" fill="${escapeXml(
        doc.backgroundColor,
      )}"/>`,
    );
  }

  (doc.nodes ?? []).forEach((node) => {
    // Locking prevents edits; visible locked artwork still belongs in exports.
    if (node.visible === false) return;
    switch (node.kind) {
      case NODE_KIND.RECT: {
        const radii = resolveCornerRadii(
          node.cornerRadius,
          node.width,
          node.height,
        );
        if (
          node.strokeAlign === "inside" &&
          node.strokeWidth > 0 &&
          node.stroke &&
          node.stroke !== "transparent"
        ) {
          const sw = node.strokeWidth;
          const inset = sw / 2;
          const iw = Math.max(0, node.width - sw);
          const ih = Math.max(0, node.height - sw);
          const insetRadii = resolveCornerRadii(
            radii.isUniform ? Math.max(0, radii.uniformRadius - inset) : radii,
            iw,
            ih,
          );
          const hasFill =
            node.fill && node.fill !== "transparent" && node.fill !== "none";
          if (hasFill) {
            if (radii.isUniform) {
              const r =
                radii.uniformRadius > 0
                  ? ` rx="${number(radii.uniformRadius)}"`
                  : "";
              body.push(
                `<rect x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}"${r} fill="${idOf(node.fill) ?? escapeXml(node.fill)}"${node.opacity != null && node.opacity < 1 ? ` opacity="${number(node.opacity)}"` : ""}/>`,
              );
            } else {
              body.push(
                `<path d="${roundedRectPathData(node.x, node.y, node.width, node.height, radii)}" fill="${idOf(node.fill) ?? escapeXml(node.fill)}"${node.opacity != null && node.opacity < 1 ? ` opacity="${number(node.opacity)}"` : ""}/>`,
              );
            }
          }
          const strokeOnlyNode = {
            ...node,
            x: node.x + inset,
            y: node.y + inset,
            width: iw,
            height: ih,
            fill: "none",
            strokeAlign: "center",
          };
          if (insetRadii.isUniform) {
            const ir =
              insetRadii.uniformRadius > 0
                ? ` rx="${number(insetRadii.uniformRadius)}"`
                : "";
            body.push(
              `<rect x="${number(node.x + inset)}" y="${number(node.y + inset)}" width="${number(iw)}" height="${number(ih)}"${ir} ${shapeAttributes(strokeOnlyNode, idOf)}/>`,
            );
          } else {
            body.push(
              `<path d="${roundedRectPathData(node.x + inset, node.y + inset, iw, ih, insetRadii)}" ${shapeAttributes(strokeOnlyNode, idOf)}/>`,
            );
          }
          break;
        }
        if (radii.isUniform) {
          const radius =
            radii.uniformRadius > 0
              ? ` rx="${number(radii.uniformRadius)}"`
              : "";
          body.push(
            `<rect x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(
              node.height,
            )}"${radius} ${shapeAttributes(node, idOf)}/>`,
          );
        } else {
          body.push(
            `<path d="${roundedRectPathData(node.x, node.y, node.width, node.height, radii)}" ${shapeAttributes(node, idOf)}/>`,
          );
        }
        break;
      }
      case NODE_KIND.ELLIPSE:
        body.push(
          `<ellipse cx="${number(node.x + node.width / 2)}" cy="${number(node.y + node.height / 2)}" rx="${number(
            node.width / 2,
          )}" ry="${number(node.height / 2)}" ${shapeAttributes(node, idOf)}/>`,
        );
        break;
      case NODE_KIND.PATH: {
        // A polygon/star exports as its true closed outline with its fill —
        // shapeAttributes emits the fill and (only when stroked) the stroke.
        if (node.poly === true || node.polygon === true || node.star === true) {
          body.push(
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
            body.push(`<g ${transformAttr}>${shaft}${arrowHeads.join("")}</g>`);
          } else {
            body.push(shaft, ...arrowHeads);
          }
          break;
        }
        if (ribbon) {
          body.push(
            `<path d="${ribbonPathData(ribbon)}" ${ribbonAttributes(node)}/>`,
          );
        } else {
          body.push(
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
          body.push(
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
          body.push(
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
          body.push(
            `<g mask="url(#${maskId})" ${groupTransform}>${renderBooleanSource(node, sources[0], fillAttr)}</g>`,
          );
        } else {
          // union (and single-source fallback):
          body.push(
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
        body.push(textElement(node, measureCtx));
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
          body.push(imageSvg);
        }
        break;
      }

      default:
        break;
    }
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(page.width)}" height="${number(page.height)}" viewBox="${number(page.x)} ${number(page.y)} ${number(
      page.width,
    )} ${number(page.height)}">`,
    defs.length ? `<defs>\n${defs.join("\n")}\n</defs>` : "",
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
  } = {},
) {
  const list = Array.isArray(nodes) ? nodes : [nodes].filter(Boolean);
  if (list.length === 0) return "";

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of list) {
    if (node.kind === NODE_KIND.GROUP) continue;
    const nx = Number(node.x || 0);
    const ny = Number(node.y || 0);
    const nw = Number(node.width || 0);
    const nh = Number(node.height || 0);
    minX = Math.min(minX, nx);
    minY = Math.min(minY, ny);
    maxX = Math.max(maxX, nx + nw);
    maxY = Math.max(maxY, ny + nh);
  }

  const originX = Number.isFinite(minX) ? minX : 0;
  const originY = Number.isFinite(minY) ? minY : 0;
  const w =
    width ??
    (Number.isFinite(maxX) && Number.isFinite(minX)
      ? Math.max(1, maxX - minX)
      : 100);
  const h =
    height ??
    (Number.isFinite(maxY) && Number.isFinite(minY)
      ? Math.max(1, maxY - minY)
      : 100);

  const virtualDoc = {
    width: w,
    height: h,
    backgroundColor: "transparent",
    nodes: list.map((n) => ({
      ...n,
      x: (n.x || 0) - originX,
      y: (n.y || 0) - originY,
    })),
  };

  return documentToSvg(virtualDoc, {
    bitmapOf,
    bitmapSizeOf,
    maskOf,
    resolveCanvas,
  });
}

export { tokenizePath, parseSvgPath } from "./editor_svg_parse.js";
export { parseSvgStringToNodes, isSvgString } from "./editor_svg_import.js";
