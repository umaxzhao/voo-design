/**
 * Path geometry, soft stroke stamps, and arrowhead generation for Skia adapter.
 */

import { arrowheadSize } from "./render_nodes.js";
import { arrowheadGeometry } from "./shape_geometry.js";
import { forEachSoftStamp, softBrushGradientStops } from "./soft_brush.js";

/**
 * A freehand stroke as SVG path data, in the node's own coordinates.
 *
 * The renderer draws path geometry with the element origin already at the
 * bounds' top-left, which is exactly how our points are stored, so the only
 * work here is the resize scale and the curve.
 *
 * The curve is deliberately the same construction the 2D renderer uses —
 * consecutive midpoints as quadratic control points — because the two
 * renderers draw the same documents and a different smoothing would make a
 * stroke visibly shift the moment the renderer is switched.
 */
export function pathDataFor(node) {
  const points = node.points ?? [];
  if (points.length === 0) return null;

  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const at = (index) => [points[index][0] * scaleX, points[index][1] * scaleY];

  const [startX, startY] = at(0);
  // A tap is a zero-length stroke; a round cap turns it into the dot the 2D
  // renderer draws with an arc.
  if (points.length === 1) return `M ${startX} ${startY} L ${startX} ${startY}`;

  if (node.pen) {
    const P = (anchor, offset) => [
      (anchor.x + (offset ? offset[0] : 0)) * scaleX,
      (anchor.y + (offset ? offset[1] : 0)) * scaleY,
    ];
    const parts = [];
    let contourStart = 0;

    while (contourStart < points.length) {
      const firstAnchor = points[contourStart];
      const [penStartX, penStartY] = P(firstAnchor);
      parts.push(`M ${penStartX} ${penStartY}`);

      if (firstAnchor.close && contourStart === points.length - 1) {
        parts.push("Z");
        break;
      }

      let i = contourStart + 1;
      while (i < points.length) {
        const from = points[i - 1];
        const to = points[i];
        if (from.out || to.in) {
          const [c1x, c1y] = P(from, from.out);
          const [c2x, c2y] = P(to, to.in);
          const [endX, endY] = P(to);
          parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`);
        } else {
          const [endX, endY] = P(to);
          parts.push(`L ${endX} ${endY}`);
        }
        if (to.close) {
          if (to.out || firstAnchor.in) {
            const [c1x, c1y] = P(to, to.out);
            const [c2x, c2y] = P(firstAnchor, firstAnchor.in);
            const [endX, endY] = P(firstAnchor);
            parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`);
          }
          parts.push("Z");
          i += 1;
          break;
        }
        i += 1;
      }
      contourStart = i;
    }
    return parts.join(" ");
  }

  // A polygon/star is straight segments through every vertex and a closed
  // outline — the corners are the shape, so no midpoint smoothing.
  if (node.poly) {
    const parts = [`M ${startX} ${startY}`];
    for (let index = 1; index < points.length; index += 1) {
      const [x, y] = at(index);
      parts.push(`L ${x} ${y}`);
    }
    parts.push("Z");
    return parts.join(" ");
  }

  const parts = [`M ${startX} ${startY}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const [x, y] = at(index);
    const [nextX, nextY] = at(index + 1);
    parts.push(`Q ${x} ${y} ${(x + nextX) / 2} ${(y + nextY) / 2}`);
  }
  const [lastX, lastY] = at(points.length - 1);
  parts.push(`L ${lastX} ${lastY}`);
  return parts.join(" ");
}

/**
 * A soft stroke as what the 2D renderer's sprite pass paints: one filled
 * circle per stamp, each carrying the very alpha profile `softBrushSprite`
 * bakes into its sprite as a radial gradient, so the feathering matches by
 * construction, not approximation. The positions, spacing and pressure scale
 * come from `forEachSoftStamp` — the single walk both renderers share.
 *
 * The circles live in the node's own coordinates inside the node's own
 * bounds — body-path space — so the element rotation the painter applies
 * orbits every stamp around the same pivot the 2D transform uses, and the
 * hit region stays the node box. The shader geometry solves back exactly:
 * the painter reads centre as a percentage of the box and takes the radius
 * as the larger of the two extents, so centre (x, y) and a 2·radius box
 * resolve to the stamp's centre and radius in path units. The 2D sprite
 * stretches to the stamp's own w×h; a stamp on a non-uniformly resized node
 * is painted here as a circle at the larger dimension — the one deliberate
 * divergence, reachable only by scaling a finished soft stroke unequally.
 */
export function softStrokeElements(node, base) {
  const points = node.points ?? [];
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const at = (index) => [
    points[index][0] * scaleX,
    points[index][1] * scaleY,
    points[index][2] ?? 0.5,
  ];
  const stroke = node.stroke ?? "#000000";
  // `softBrushGradientStops` answers in 0..1 fractions of the radius; the
  // scene gradient contract is 0..100 for both position and opacity.
  const stops = softBrushGradientStops(node.hardness).map(
    ([position, alpha]) => ({
      color: stroke,
      opacity: Math.round(alpha * 100),
      position: Math.round(position * 100),
    }),
  );
  const elements = [];
  forEachSoftStamp(node, at, scaleX, scaleY, (x, y, width, height) => {
    const radius = Math.max(width, height) / 2;
    elements.push({
      ...base,
      id: `${node.id}-stamp-${elements.length}`,
      kind: "node",
      nodeType: "path",
      shape: "path",
      title: node.name ?? "Soft Stroke",
      // A closed circle: two half-arcs are the SVG way of saying it; the
      // painter fills the path, it never strokes stamps.
      pathData:
        `M ${x - radius} ${y} A ${radius} ${radius} 0 1 0 ${x + radius} ${y} ` +
        `A ${radius} ${radius} 0 1 0 ${x - radius} ${y} Z`,
      pathClosed: true,
      fills: [
        {
          color: stroke,
          opacity: 1,
          gradient: {
            type: "radial",
            angle: 0,
            centerX: (x / node.width) * 100,
            centerY: (y / node.height) * 100,
            width: ((radius * 2) / node.width) * 100,
            height: ((radius * 2) / node.height) * 100,
            stops,
          },
        },
      ],
    });
  });
  return elements;
}

/**
 * The arrowheads of an arrow stroke — the end head, plus a start head for a
 * double-headed arrow — as their own elements. The 2D renderer draws barbs
 * with the node's plain solid stroke, round caps, whatever the body was: a
 * soft brush's feathered barbs would read as a smudge, and dashes must not
 * cut a barb short. Neither can ride the body element for the same reason,
 * so both renderers hand the barbs their own draw call; here, their own
 * elements. Path data is node-local, the body's coordinate space.
 */
export function arrowheadElements(node, base) {
  const points = node.points ?? [];
  if (!node.arrow || points.length < 2) return [];
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const at = (index) => {
    const pt = points[index];
    const px = Array.isArray(pt) ? pt[0] : (pt?.x ?? 0);
    const py = Array.isArray(pt) ? pt[1] : (pt?.y ?? 0);
    return {
      x: px * scaleX,
      y: py * scaleY,
    };
  };
  const size = arrowheadSize(node.strokeWidth, node.arrowSize);
  const head = (tipIndex, step, idSuffix) => {
    const tip = at(tipIndex);
    const back = at(tipIndex + step);
    const angle = Math.atan2(tip.y - back.y, tip.x - back.x);
    const geometry = arrowheadGeometry(tip, angle, size, node.arrowCap);
    const headBase = {
      ...base,
      id: `${node.id}-arrow${idSuffix}`,
      kind: "node",
      nodeType: "path",
      shape: "path",
      title: node.name ?? "Arrowhead",
    };
    // The open barbs stroke with the node's own style; the closed shapes
    // (triangle, circle, diamond) fill with the stroke colour, matching the
    // 2D renderer — the head reads as part of the shaft either way.
    if (geometry.kind === "lines") {
      const [barb1, barb2] = geometry.barbs;
      return {
        ...headBase,
        pathData: `M ${tip.x} ${tip.y} L ${barb1.x} ${barb1.y} M ${tip.x} ${tip.y} L ${barb2.x} ${barb2.y}`,
        pathClosed: false,
        stroke: {
          color: node.stroke,
          opacity: 1,
          width: node.strokeWidth ?? 1,
          lineCap: "round",
          lineJoin: "round",
        },
      };
    }
    const pathData =
      geometry.kind === "circle"
        ? `M ${geometry.center.x - geometry.radius} ${geometry.center.y} ` +
          `A ${geometry.radius} ${geometry.radius} 0 1 0 ${geometry.center.x + geometry.radius} ${geometry.center.y} ` +
          `A ${geometry.radius} ${geometry.radius} 0 1 0 ${geometry.center.x - geometry.radius} ${geometry.center.y} Z`
        : `M ${geometry.points.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
    return {
      ...headBase,
      pathData,
      pathClosed: true,
      fills: [{ color: node.stroke, opacity: 1 }],
    };
  };
  const heads = [head(points.length - 1, -1, node.arrowStart ? "-end" : "")];
  if (node.arrowStart) heads.push(head(0, 1, "-start"));
  return heads;
}
