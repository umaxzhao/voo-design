/**
 * Effects imported from Figma that the node pipeline draws beyond the shadow,
 * glow and overlay set: background blur (blurring what is already painted under
 * a layer) and noise/grain (a seeded speckle pattern over the layer).
 *
 * Radii are in document units; they are scaled into device pixels by the current
 * transform, so the effect keeps its proportion when the view is zoomed.
 */

const GRAIN_TILE_SIZE = 128;
const grainTileCache = new Map();

/** Device pixels per document unit under the current transform. */
export function deviceScaleOf(ctx) {
  const matrix = ctx.getTransform();
  return Math.hypot(matrix.a, matrix.b) || 1;
}

/**
 * Blurs everything already painted under the node, inside the node's box. Called
 * before the node itself paints, so the node sits on the blurred backdrop.
 */
export function drawBackgroundBlur(ctx, node, radius) {
  const canvas = ctx.canvas;
  if (!canvas || !(radius > 0) || typeof document === "undefined") return;
  const backdrop = document.createElement("canvas");
  backdrop.width = canvas.width;
  backdrop.height = canvas.height;
  backdrop.getContext("2d").drawImage(canvas, 0, 0);

  const matrix = ctx.getTransform();
  const box = new Path2D();
  box.rect(node.x, node.y, node.width, node.height);
  const clip = new Path2D();
  clip.addPath(box, matrix);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clip(clip);
  ctx.filter = `blur(${radius * (Math.hypot(matrix.a, matrix.b) || 1)}px)`;
  ctx.drawImage(backdrop, 0, 0);
  ctx.restore();
}

/** Seeded speckle tile, built once per seed and reused as a repeating pattern. */
function grainTile(seed, color, secondary = null) {
  const key = `${seed}|${color}|${secondary ?? ""}`;
  const cached = grainTileCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = GRAIN_TILE_SIZE;
  canvas.height = GRAIN_TILE_SIZE;
  const context = canvas.getContext("2d");
  const image = context.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
  const parse = (hex) => [
    Number.parseInt(hex.slice(1, 3), 16) || 0,
    Number.parseInt(hex.slice(3, 5), 16) || 0,
    Number.parseInt(hex.slice(5, 7), 16) || 0,
  ];
  const [aRed, aGreen, aBlue] = parse(color);
  const [bRed, bGreen, bBlue] = secondary ? parse(secondary) : [aRed, aGreen, aBlue];
  // mulberry32: a small seeded generator, so the same seed gives the same grain.
  let state = (seed >>> 0) + 0x6d2b79f5;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = 0; index < image.data.length; index += 4) {
    // Each speckle takes one of the two tones; mono grain has the same tone twice.
    const second = random() < 0.5;
    image.data[index] = second ? bRed : aRed;
    image.data[index + 1] = second ? bGreen : aGreen;
    image.data[index + 2] = second ? bBlue : aBlue;
    image.data[index + 3] = Math.floor(random() * 256);
  }
  context.putImageData(image, 0, 0);
  if (grainTileCache.size > 32) grainTileCache.clear();
  grainTileCache.set(key, canvas);
  return canvas;
}

/**
 * Covers the node's box with grain. Density sets how many speckles are opaque
 * enough to show; opacity scales the whole layer of grain.
 */
export function drawNoiseOverlay(ctx, node, noise) {
  if (typeof document === "undefined" || !(noise.opacity > 0)) return;
  const tile = grainTile(noise.seed ?? 0, noise.color ?? "#808080", noise.secondaryColor ?? null);
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  const size = Math.max(1, noise.size ?? 1);
  ctx.save();
  ctx.globalAlpha = Math.min(1, noise.opacity) * Math.min(1, noise.density ?? 0.5) * 2;
  ctx.globalCompositeOperation = noise.blendMode ?? "source-over";
  ctx.translate(node.x, node.y);
  ctx.scale(size, size);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, node.width / size, node.height / size);
  ctx.restore();
}
