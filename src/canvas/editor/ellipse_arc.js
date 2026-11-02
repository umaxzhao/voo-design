/** Shared SVG geometry for Figma-style ellipse start/sweep/inner-radius controls. */
export function ellipseArcPath(node) {
  const start = Number.isFinite(node.arcStart) ? node.arcStart : 0;
  const sweep = Math.max(0.01, Math.min(360, Number.isFinite(node.arcSweep) ? node.arcSweep : 360));
  const inner = Math.max(0, Math.min(0.99, node.arcInnerRadius ?? 0));
  const rx = node.width / 2, ry = node.height / 2;
  const point = (angle, ratio = 1) => {
    const radians = angle * Math.PI / 180;
    return `${rx + rx * ratio * Math.cos(radians)} ${ry + ry * ratio * Math.sin(radians)}`;
  };
  // Two arcs also handle a complete ring (SVG cannot draw 360° in one arc).
  const middle = start + sweep / 2, end = start + sweep;
  const outer = `M ${point(start)} A ${rx} ${ry} 0 0 1 ${point(middle)} A ${rx} ${ry} 0 0 1 ${point(end)}`;
  if (inner) return `${outer} L ${point(end, inner)} A ${rx * inner} ${ry * inner} 0 0 0 ${point(middle, inner)} A ${rx * inner} ${ry * inner} 0 0 0 ${point(start, inner)} Z`;
  return sweep === 360 ? `${outer} Z` : `${outer} L ${rx} ${ry} Z`;
}
export function hasEllipseArc(node) {
  return (node.arcSweep != null && node.arcSweep !== 360) || (node.arcInnerRadius ?? 0) > 0;
}
