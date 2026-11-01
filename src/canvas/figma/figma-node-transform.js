const IDENTITY = [1, 0, 0, 1, 0, 0];
const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function figmaMatrix(raw) {
  return [number(raw?.m00, 1), number(raw?.m10), number(raw?.m01), number(raw?.m11, 1), number(raw?.m02), number(raw?.m12)];
}

function multiply(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

/** Compose native parent spaces once; descendants remain in document space. */
export function resolveFigmaTransforms(nodes) {
  const visiting = new Set();
  const resolve = node => {
    if (node.matrix) return node.matrix;
    if (visiting.has(node.key)) throw new Error("figma-parent-cycle");
    visiting.add(node.key);
    const parent = nodes.get(node.parentKey);
    if (parent && !["CANVAS", "DOCUMENT"].includes(parent.type)) resolve(parent);
    node.parentMatrix = parent?.coordinateOrigin ? parent.matrix : parent?.parentMatrix ?? IDENTITY;
    node.matrix = multiply(node.parentMatrix, figmaMatrix(node.raw.transform));
    node.x = node.matrix[4]; node.y = node.matrix[5];
    visiting.delete(node.key);
    return node.matrix;
  };
  for (const node of nodes.values()) resolve(node);
}

/** Convert an origin-based affine transform to the editor's centre pivot. */
export function applyFigmaGeometry(node, layer) {
  const [a, b, c, d, tx, ty] = node.matrix ?? figmaMatrix(node.raw.transform);
  if (a === 1 && b === 0 && c === 0 && d === 1) return layer;
  const offset = node.mappingOffset ?? { x: 0, y: 0 };
  const localX = layer.x - tx - offset.x;
  const localY = layer.y - ty - offset.y;
  const cx = localX + layer.width / 2, cy = localY + layer.height / 2;
  const scaleX = Math.hypot(a, b) || 1;
  const scaleY = (a * d - b * c) / scaleX;
  const width = layer.width * scaleX, height = layer.height * Math.abs(scaleY);
  layer.x = a * cx + c * cy + tx + offset.x - width / 2;
  layer.y = b * cx + d * cy + ty + offset.y - height / 2;
  layer.width = width; layer.height = height;
  layer.rotation = Math.atan2(b, a) * 180 / Math.PI;
  layer.shear = scaleY ? Math.atan((a * c + b * d) / (scaleX * scaleY)) * 180 / Math.PI : 0;
  if (scaleY < 0) layer.flipV = true;
  return layer;
}

/** Root bounds include rotated corners, keeping fit/labels in the same world. */
export function figmaRootBounds(roots) {
  if (!roots.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const points = roots.flatMap(node => {
    const [a, b, c, d, x, y] = node.matrix ?? figmaMatrix(node.raw.transform);
    return [[0, 0], [node.w, 0], [node.w, node.h], [0, node.h]]
      .map(([u, v]) => ({ x: a * u + c * v + x, y: b * u + d * v + y }));
  });
  return { minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)),
    maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)) };
}
