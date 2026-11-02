/**
 * World-space mapping for pen anchors, used when joining open paths (UF13).
 *
 * Follows applyNodeTransform (render_custom_blend.js): an anchor is scaled into the
 * node box, then flipped, sheared and rotated about the box centre. Handles are
 * vectors, so they take only the linear part of that transform.
 */

const radians = (degrees) => (degrees * Math.PI) / 180;

function scaleOf(node) {
  return {
    sx: node.baseWidth ? node.width / node.baseWidth : 1,
    sy: node.baseHeight ? node.height / node.baseHeight : 1,
  };
}

/** Linear part of the node transform: flip, then shear, then rotate (same order as the canvas). */
function applyLinear(node, vx, vy) {
  let x = vx;
  let y = vy;
  if (node.flipH) x = -x;
  if (node.flipV) y = -y;
  if (node.shear) x += Math.tan(radians(node.shear)) * y;
  if (node.rotation) {
    const rad = radians(node.rotation);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
  }
  return { x, y };
}

/** Maps one pen anchor (local to a node box) to world coordinates. */
export function penAnchorToWorld(node, anchor) {
  const { sx, sy } = scaleOf(node);
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const point = applyLinear(node, node.x + anchor.x * sx - cx, node.y + anchor.y * sy - cy);
  const handle = (vector) => {
    if (!vector) return null;
    const v = applyLinear(node, vector[0] * sx, vector[1] * sy);
    return [v.x, v.y];
  };
  return {
    x: cx + point.x,
    y: cy + point.y,
    in: handle(anchor.in),
    out: handle(anchor.out),
    close: false,
  };
}
