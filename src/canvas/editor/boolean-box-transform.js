/** Positive Boolean box resizing preserves operand rotation and shear. */
const DEGREES = 180 / Math.PI;

export function booleanBoxChanged(before, after) {
  return ["x", "y", "width", "height"].some((key) => before?.[key] !== after?.[key]);
}

export function positiveBooleanBox(node, previous) {
  return { ...node,
    width: node.width === previous?.width ? node.width : Math.max(1, Number.isFinite(node.width) ? node.width : 1),
    height: node.height === previous?.height ? node.height : Math.max(1, Number.isFinite(node.height) ? node.height : 1) };
}

/** Map a source/child box, retaining an affine basis under anisotropic scaling. */
export function transformBooleanChild(node, before, after) {
  const sx = after.width / (before.width > 0 ? before.width : 1);
  const sy = after.height / (before.height > 0 ? before.height : 1);
  if (Math.abs(sx - sy) < 1e-12) {
    return { ...node, x: after.x + (node.x - before.x) * sx,
      y: after.y + (node.y - before.y) * sy, width: node.width * sx, height: node.height * sy };
  }
  const rotation = (node.rotation ?? 0) / DEGREES;
  const tangent = Math.tan((node.shear ?? 0) / DEGREES);
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const ax = cos * node.width * sx, ay = sin * node.width * sy;
  const bx = (cos * tangent - sin) * node.height * sx;
  const by = (sin * tangent + cos) * node.height * sy;
  const width = Math.hypot(ax, ay);
  const height = width > 0 ? Math.abs(ax * by - ay * bx) / width : node.height * sy;
  const centerX = after.x + (node.x + node.width / 2 - before.x) * sx;
  const centerY = after.y + (node.y + node.height / 2 - before.y) * sy;
  return { ...node, x: centerX - width / 2, y: centerY - height / 2, width, height,
    rotation: Math.atan2(ay, ax) * DEGREES,
    shear: Math.atan(width > 0 && height > 0 ? (ax * bx + ay * by) / (width * height) : 0) * DEGREES };
}

/** Nested source geometry is local to its own box, including legacy snapshots. */
export function resizeBooleanSources(sources, before, after) {
  return (sources ?? []).map((source) => {
    const original = { ...source, width: source.w, height: source.h };
    const next = transformBooleanChild(original, { ...before, x: 0, y: 0 }, { ...after, x: 0, y: 0 });
    const result = { ...source, x: next.x, y: next.y, w: next.width, h: next.height,
      rotation: next.rotation ?? 0, ...(next.shear != null ? { shear: next.shear } : {}) };
    if (source.type === "boolean") {
      result.booleanSources = resizeBooleanSources(source.booleanSources, original, next);
    }
    return result;
  });
}
