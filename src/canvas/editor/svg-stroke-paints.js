import { NODE_KIND } from "./scene_model.js";
import { strokeMaskBounds } from "./painted-node-bounds.js";
export { strokeMaskBounds } from "./painted-node-bounds.js";
import { number } from "./editor_svg_xml.js";
import { additionalStrokePaints, primaryStrokePaint } from "./stroke-paint-passes.js";
import { svgContainerBlend } from "./svg-container-opacity.js";

/** Collect every paint before writing markup, including layered fill paints. */
export function svgStrokeDefinitionNodes(nodes) {
  return nodes.flatMap((node) => [
    { fill: node.stroke },
    ...(Array.isArray(node.fills) ? node.fills.map((paint) => ({ ...node, fill: paint?.fill })) : []),
    ...(Array.isArray(node.strokes) ? node.strokes.map((stroke) => ({ fill: stroke?.stroke })) : []),
  ]);
}

function isClosedShape(node) {
  if ([NODE_KIND.RECT, NODE_KIND.ELLIPSE, NODE_KIND.BOOLEAN].includes(node.kind)) return true;
  return node.kind === NODE_KIND.PATH && (node.poly || node.polygon || node.star || node.points?.at(-1)?.close);
}


export function paintsBeyondFill(node) {
  if (Array.isArray(node.fills)) return true;
  if (node.strokeHidden !== true && node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent") return true;
  if (additionalStrokePaints(node).length) return true;
  if (node.layerBlur > 0 || node.noise?.opacity > 0 || node.shadow?.enabled) return true;
  const effects = node.effects;
  if (Array.isArray(effects)) return effects.some((effect) => effect && effect.enabled !== false);
  return Boolean(effects && Object.values(effects).some((effect) => effect?.enabled));
}

function alignedMarkup(node, render, defs, paintIndex) {
  const visibleStroke = node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent";
  const align = node.strokeAlign ?? ([NODE_KIND.RECT, NODE_KIND.ELLIPSE, NODE_KIND.BOOLEAN].includes(node.kind) ? "inside" : "center");
  if (!visibleStroke || !isClosedShape(node) || align === "center") return render(node);

  // SVG has no widely supported inside/outside stroke property. Clip a
  // double-width centred stroke against the same transformed geometry.
  const geometry = render({ ...node, fill: "#ffffff", fillOpacity: 1, fillHidden: false, strokeWidth: 0, opacity: 1 });
  const fill = render({ ...node, strokeWidth: 0 });
  const stroke = render({ ...node, fill: "none", fillOpacity: 0, strokeWidth: node.strokeWidth * 2, strokeAlign: "center" });
  const id = `stroke-${String(node.id ?? "shape").replace(/[^A-Za-z0-9_-]/g, "_")}-${paintIndex}-${defs.length}`;
  const bounds = strokeMaskBounds(node);
  const area = `x="${number(bounds.x)}" y="${number(bounds.y)}" width="${number(bounds.width)}" height="${number(bounds.height)}"`;
  if (align === "inside") {
    defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${area} mask-type="alpha">${geometry.join("")}</mask>`);
    return [...fill, `<g mask="url(#${id})">${stroke.join("")}</g>`];
  }
  const inverse = geometry.map((markup) => markup.replaceAll('fill="#ffffff"', 'fill="#000000"'));
  defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${area} mask-type="luminance"><rect ${area} fill="#ffffff"/>${inverse.join("")}</mask>`);
  return [...fill, `<g mask="url(#${id})">${stroke.join("")}</g>`];
}

/** Keep each stroke independent while reusing the established node exporters. */
export function svgStrokeMarkup(node, render, defs) {
  if (node.visible === false) return [];
  if (Array.isArray(node.fills) && node.kind !== NODE_KIND.IMAGE) {
    // Match the compositor's bottom-to-top fill order. Each paint owns its
    // alpha/visibility, while the node's strokes are emitted exactly once.
    const layers = node.fills.filter((paint) => paint.visible !== false).flatMap((paint) => {
      const painted = { ...node, fills: undefined, strokes: undefined,
        fill: paint.fill, fillOpacity: paint.opacity ?? 1, fillHidden: false,
        strokeWidth: 0, strokeHidden: true };
      const markup = svgStrokeMarkup(painted, render, defs);
      const blend = svgContainerBlend({ blendMode: paint.blendMode });
      return blend && markup.length ? [`<g${blend}>${markup.join("")}</g>`] : markup;
    });
    const primary = primaryStrokePaint(node);
    const hasStroke = primary.strokeWidth > 0 && primary.stroke && primary.stroke !== "transparent";
    const outlines = hasStroke || additionalStrokePaints(node).length
      ? svgStrokeMarkup({ ...node, fills: undefined, fillHidden: true }, render, defs) : [];
    return [...layers, ...outlines];
  }
  return [primaryStrokePaint(node), ...additionalStrokePaints(node)].flatMap((paint, index) => {
    if (paint.kind === NODE_KIND.GROUP && !paint.isFrame) return [];
    if (paint.isFrame) paint = { ...paint, kind: NODE_KIND.RECT };
    if (paint.kind === NODE_KIND.IMAGE) {
      const image = paint.fillHidden ? [] : render(paint);
      const outline = { ...paint, kind: NODE_KIND.RECT, fill: "none", fillHidden: false, fillOpacity: 0 };
      return [...image, ...alignedMarkup(outline, render, defs, index)];
    }
    if (paint.fillHidden) paint = { ...paint, fill: "none" };
    return alignedMarkup(paint, render, defs, index);
  });
}
