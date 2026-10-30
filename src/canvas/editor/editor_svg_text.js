/**
 * Text layers in SVG export: one <text> per node, with a <tspan> per further
 * wrapped or typed line so the export breaks lines where the canvas does.
 */
import { textLines } from "./scene_model.js";
import { layoutTextLines, textLineHeight } from "./text_metrics.js";
import { escapeXml, number, svgNodeTransform } from "./editor_svg_xml.js";
import { textOnPathToSvg } from "./text_on_path.js";

/** The lines a text node exports: wrap when a metric source is available. */
function svgTextLines(node, measureCtx) {
  if (node.boxWidth > 0 && measureCtx) return layoutTextLines(measureCtx, node);
  return textLines(node);
}

function textTransformAttr(node) {
  const attr = svgNodeTransform(node);
  return attr ? ` ${attr}` : "";
}

/**
 * One <text> (or one line bearing one <tspan> per wrapped line) — a bare
 * <text> flattens every newline and wrap into a single horizontal run, the
 * canvas this exports never draws it that way.
 */
export function textElement(node, measureCtx, idOf = () => null) {
  // A CSS url(data:image/svg+xml,...) is not an SVG paint server. Resolve
  // fill and stroke through the same local definitions used by vector shapes.
  const fill = idOf(node.fill) ?? node.fill ?? "#000000";
  const stroke = idOf(node.stroke) ?? node.stroke;
  if (node.textPath) {
    const svg = textOnPathToSvg({ ...node, fill, stroke }, measureCtx);
    if (svg) {
      const transform = textTransformAttr(node);
      return transform ? `<g${transform}>${svg}</g>` : svg;
    }
  }
  const anchor =
    { left: "start", center: "middle", right: "end" }[node.align] ?? "start";
  const x =
    anchor === "middle"
      ? node.x + node.width / 2
      : anchor === "end"
        ? node.x + node.width
        : node.x;
  const spacing = node.letterSpacing ?? 0;
  const strokeParts =
    node.stroke && (node.strokeWidth ?? 0) > 0
      ? ` stroke="${escapeXml(stroke)}" stroke-width="${number(node.strokeWidth)}" stroke-linejoin="round" paint-order="stroke fill"`
      : "";
  const shadow = node.shadow?.enabled ? node.shadow : null;
  const filterPart = shadow
    ? ` style="filter:drop-shadow(${number(shadow.offsetX ?? 0)}px ${number(shadow.offsetY ?? 0)}px ${number(shadow.blur ?? 0)}px ${escapeXml(shadow.color ?? "#000000")})"`
    : "";
  const styleParts = [
    spacing ? ` letter-spacing="${number(spacing)}"` : "",
    node.italic ? ' font-style="italic"' : "",
    node.underline ? ' text-decoration="underline"' : "",
    // SVG 1.1's writing-mode shorthand; "tb" stacks the glyphs top to bottom
    // like the canvas painter's 直排 columns.
    node.direction === "vertical" ? ' writing-mode="tb"' : "",
    node.fillOpacity != null && node.fillOpacity < 1 ? ` fill-opacity="${number(node.fillOpacity)}"` : "",
    node.strokeOpacity != null && node.strokeOpacity < 1 ? ` stroke-opacity="${number(node.strokeOpacity)}"` : "",
    strokeParts,
    filterPart,
  ].join("");

  const transformAttr = textTransformAttr(node);
  const textTransform = node.highlight ? "" : transformAttr;

  const head =
    `<text x="${number(x)}" y="${number(node.y + node.fontSize)}" font-family="${escapeXml(
      node.fontFamily ?? "sans-serif",
    )}" font-size="${number(node.fontSize)}" font-weight="${node.fontWeight ?? "normal"}" fill="${escapeXml(
      fill,
    )}"${node.opacity != null && node.opacity < 1 ? ` opacity="${number(node.opacity)}"` : ""} text-anchor="${anchor}"${styleParts}${textTransform}>`;
  const lines = svgTextLines(node, measureCtx);
  const textBody =
    lines.length === 1
      ? `${head}${escapeXml(lines[0])}</text>`
      : `${head}${escapeXml(lines[0])}${wrappedTail(node, lines, x, node.y + node.fontSize)}</text>`;

  if (node.highlight) {
    const highlightRect = `<rect x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}" fill="${escapeXml(node.highlight)}"/>`;
    if (transformAttr) {
      return `<g${transformAttr}>${highlightRect}${textBody}</g>`;
    }
    return `${highlightRect}${textBody}`;
  }
  return textBody;
}

/** One <tspan> per further wrapped/typed line, stepped by the line pitch. */
function wrappedTail(node, lines, anchorX, anchorY) {
  // Horizontal: every continuation restarts at the head's x and steps down.
  // 直排 columns advance to the LEFT (dx), each restarting at the head's y.
  if (node.direction === "vertical") {
    return lines
      .slice(1)
      .map(
        (line) =>
          `<tspan dx="${number(-textLineHeight(node))}" y="${number(anchorY)}">${escapeXml(line)}</tspan>`,
      )
      .join("");
  }
  return lines
    .slice(1)
    .map(
      (line) =>
        `<tspan x="${number(anchorX)}" dy="${number(textLineHeight(node))}">${escapeXml(line)}</tspan>`,
    )
    .join("");
}
