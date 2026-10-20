/**
 * Trimming a rasterized layer down to the pixels it actually has.
 *
 * Baking a layer's effects often leaves most of its box empty — a mask cuts
 * the picture down to a circle, a warp pulls it away from an edge — and a box
 * that still spans the old rectangle reports a size the layer no longer has.
 * These two functions answer "where are the pixels" and "where does the box
 * go once it only covers them", kept free of canvas and React so the rules can
 * be driven directly from tests.
 */

/**
 * The smallest rectangle covering every pixel that is not fully transparent.
 *
 * Returns null when nothing is visible at all — the caller must decide what an
 * empty layer means rather than being handed a zero-size box.
 *
 * @param {Uint8ClampedArray} data RGBA pixels, as ImageData carries them.
 * @param {number} width  Row length in pixels.
 * @param {number} height Row count.
 * @returns {{x: number, y: number, width: number, height: number} | null}
 */
export function opaqueBounds(data, width, height) {
  if (!data || !(width > 0) || !(height > 0)) return null;
  if (data.length < width * height * 4) {
    throw new Error(
      `opaqueBounds got ${data.length} bytes for a ${width}x${height} image, expected ${width * height * 4}`,
    );
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Where a node's box lands once it shrinks to `bounds`.
 *
 * `bounds` is in the pixels of the offscreen canvas the layer was baked into,
 * which may differ from the node's document size by the rounding that sized
 * that canvas, so it is scaled back into document units on the way in.
 *
 * Rotation and shear pivot on the box centre (see applyNodeTransform), so a
 * smaller box would spin around a different point and the picture would jump.
 * Offsetting the origin by (I - M)(c - c') — old centre minus new centre, run
 * through the same matrix — holds every pixel exactly where it already was.
 *
 * @param {{x: number, y: number, width: number, height: number, rotation?: number, shear?: number}} node
 * @param {{x: number, y: number, width: number, height: number}} bounds In canvas pixels.
 * @param {{width: number, height: number}} canvas The canvas `bounds` was measured on.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function trimmedNodeBox(node, bounds, canvas) {
  const scaleX = node.width / canvas.width;
  const scaleY = node.height / canvas.height;
  const width = bounds.width * scaleX;
  const height = bounds.height * scaleY;
  // Top-left of the kept pixels, in the node's own unrotated space.
  const originX = node.x + bounds.x * scaleX;
  const originY = node.y + bounds.y * scaleY;

  const rotation = node.rotation ?? 0;
  const shear = node.shear ?? 0;
  if (!rotation && !shear) return { x: originX, y: originY, width, height };

  const deltaX = node.x + node.width / 2 - (originX + width / 2);
  const deltaY = node.y + node.height / 2 - (originY + height / 2);
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const tan = Math.tan((shear * Math.PI) / 180);
  // M = R · Shear, in the order applyNodeTransform applies them.
  const m11 = cos;
  const m12 = cos * tan - sin;
  const m21 = sin;
  const m22 = sin * tan + cos;
  return {
    x: originX + deltaX - (m11 * deltaX + m12 * deltaY),
    y: originY + deltaY - (m21 * deltaX + m22 * deltaY),
    width,
    height,
  };
}
