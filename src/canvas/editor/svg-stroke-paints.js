import { NODE_KIND } from "./scene_model.js";
import { nodeCorners } from "./scene_geometry_transform.js";
import { boundsOfPoints } from "./scene_geometry_bounds.js";
import { number } from "./editor_svg_xml.js";
import { additionalStrokePaints, primaryStrokePaint } from "./stroke-paint-passes.js";

/** Gradient IDs must include stroke paints as well as ordinary fill paints. */
export function svgStrokeDefinitionNodes(nodes) {
  return nodes.flatMap((node) => [
    { fill: node.stroke },
    ...(Array.isArray(node.strokes) ? node.strokes.map((stroke) => ({ fill: stroke?.stroke })) : []),
  ]);
}

function isClosedShape(node) {
  if (node.kind === NODE_KIND.RECT || node.kind === NODE_KIND.ELLIPSE) return true;
  return node.kind === NODE_KIND.PATH && (node.poly || node.polygon || node.star || node.points?.at(-1)?.close);
}

export function strokeMaskBounds(node) {
  // Expand in the node's own axes before transformation. This includes rotated
  // and sheared miter tips at any world coordinate without a fixed world box.
  const padding = Math.max(1, node.strokeWidth ?? 1) * Math.max(1, node.strokeMiterLimit ?? 4) + 1;
  return boundsOfPoints(nodeCorners({ ...node, effectiveLocal: null,
    x: node.x - padding, y: node.y - padding,
    width: node.width + padding * 2, height: node.height + padding * 2 }).map(({ x, y }) => [x, y]));
}

export function paintsBeyondFill(node) {
  if (node.strokeHidden !== true && node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent") return true;
  if (additionalStrokePaints(node).length) return true;
  if (node.layerBlur > 0 || node.noise?.opacity > 0 || node.shadow?.enabled) return true;
  const effects = node.effects;
  if (Array.isArray(effects)) return effects.some((effect) => effect && effect.enabled !== false);
  return Boolean(effects && Object.values(effects).some((effect) => effect?.enabled));
}

function alignedMarkup(node, render, defs, paintIndex) {
  const visibleStroke = node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent";
  const align = node.strokeAlign ?? ([NODE_KIND.RECT, NODE_KIND.ELLIPSE].includes(node.kind) ? "inside" : "center");
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
