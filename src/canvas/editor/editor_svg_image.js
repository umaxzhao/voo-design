/**
 * Image layers in SVG export: bitmap embedding, crop viewBox normalization,
 * corner radius clip paths, mask definitions, and rotation wrapper.
 */

import { resolveCornerRadii } from "./scene_model_core.js";
import { escapeXml, number } from "./editor_svg_xml.js";

export function roundedRectPathData(x, y, w, h, radii) {
  const { tl, tr, br, bl } = radii;
  const segs = [`M ${number(x + tl)} ${number(y)}`, `H ${number(x + w - tr)}`];
  if (tr > 0) segs.push(`A ${number(tr)} ${number(tr)} 0 0 1 ${number(x + w)} ${number(y + tr)}`);
  segs.push(`V ${number(y + h - br)}`);
  if (br > 0) segs.push(`A ${number(br)} ${number(br)} 0 0 1 ${number(x + w - br)} ${number(y + h)}`);
  segs.push(`H ${number(x + bl)}`);
  if (bl > 0) segs.push(`A ${number(bl)} ${number(bl)} 0 0 1 ${number(x)} ${number(y + h - bl)}`);
  segs.push(`V ${number(y + tl)}`);
  if (tl > 0) segs.push(`A ${number(tl)} ${number(tl)} 0 0 1 ${number(x + tl)} ${number(y)}`);
  segs.push("Z");
  return segs.join(" ");
}

export function imageCornerClip(node, defs) {
  if (!node.cornerRadius) return "";
  const radii = resolveCornerRadii(node.cornerRadius, node.width, node.height);
  if (radii.isUniform && radii.uniformRadius === 0) return "";
  const clipId = `clip-${escapeXml(node.id ?? "img")}`;
  const shape = radii.isUniform
    ? `<rect x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}" rx="${number(radii.uniformRadius)}"/>`
    : `<path d="${roundedRectPathData(node.x, node.y, node.width, node.height, radii)}"/>`;
  defs.push(`<clipPath id="${clipId}">${shape}</clipPath>`);
  return ` clip-path="url(#${clipId})"`;
}

export function normalizeSvgCrop(crop, width, height) {
  const x = Math.max(0, Math.min(width, Number(crop.x) || 0));
  const y = Math.max(0, Math.min(height, Number(crop.y) || 0));
  const right = Math.max(x, Math.min(width, (Number(crop.x) || 0) + (Number(crop.width) || width)));
  const bottom = Math.max(y, Math.min(height, (Number(crop.y) || 0) + (Number(crop.height) || height)));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

export function imageElement(
  node,
  { bitmapOf = null, bitmapSizeOf = null, maskOf = null, defs = [] } = {},
) {
  const href =
    (node.imageId && bitmapOf ? bitmapOf(node.imageId) : null) ??
    (node.src || null);
  if (!href) return null;

  const clipAttr = imageCornerClip(node, defs);
  const maskHref = node.maskId
    ? (maskOf ? maskOf(node.maskId) : null) ??
      (bitmapOf ? bitmapOf(node.maskId) : null)
    : null;
  const maskAttr = maskHref ? ` mask="url(#mask-${escapeXml(node.id)})"` : "";

  if (node.crop) {
    const size = bitmapSizeOf?.(node.imageId);
    if (size?.width > 0 && size?.height > 0) {
      const crop = normalizeSvgCrop(node.crop, size.width, size.height);
      if (maskHref) {
        defs.push(
          `<mask id="mask-${escapeXml(node.id)}" maskUnits="userSpaceOnUse" mask-type="alpha" style="mask-type:alpha" x="0" y="0" width="${number(size.width)}" height="${number(size.height)}"><image href="${maskHref}" x="0" y="0" width="${number(size.width)}" height="${number(size.height)}" preserveAspectRatio="none"/></mask>`,
        );
      }
      const innerSvg = `<svg x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}" viewBox="${number(crop.x)} ${number(crop.y)} ${number(crop.width)} ${number(crop.height)}" preserveAspectRatio="none"${clipAttr}${node.opacity != null && node.opacity < 1 ? ` opacity="${number(node.opacity)}"` : ""}><image href="${href}" x="0" y="0" width="${number(size.width)}" height="${number(size.height)}" preserveAspectRatio="none"${maskAttr}/></svg>`;
      if (node.rotation) {
        return `<g transform="rotate(${number(node.rotation)} ${number(node.x + node.width / 2)} ${number(node.y + node.height / 2)})">${innerSvg}</g>`;
      }
      return innerSvg;
    }
  }

  if (maskHref) {
    defs.push(
      `<mask id="mask-${escapeXml(node.id)}" maskUnits="userSpaceOnUse" mask-type="alpha" style="mask-type:alpha" x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}"><image href="${maskHref}" x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}" preserveAspectRatio="none"/></mask>`,
    );
  }

  const imgTag = `<image href="${href}" x="${number(node.x)}" y="${number(node.y)}" width="${number(
    node.width,
  )}" height="${number(node.height)}"${clipAttr}${maskAttr}${node.opacity != null && node.opacity < 1 ? ` opacity="${number(node.opacity)}"` : ""}/>`;

  if (node.rotation) {
    return `<g transform="rotate(${number(node.rotation)} ${number(node.x + node.width / 2)} ${number(node.y + node.height / 2)})">${imgTag}</g>`;
  }
  return imgTag;
}
