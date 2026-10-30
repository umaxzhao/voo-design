// Match the existing mesh SVG: an opaque base and ordered radial overlays.
// Fixed-size tiles keep zoom/drag frames synchronous. This local LRU retains
// at most 32 tiles. PNG strings, downstream decoded resources and paint-style
// patterns have separate lifetimes, so this is not a total renderer memory cap.
const TILE_EDGE = 256;
const CACHE_LIMIT = 32;
const tiles = new Map();
let colourContext;

function transparentEndpoint(colour) {
  if (!colourContext) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    colourContext = canvas.getContext("2d", { willReadFrequently: true });
  }
  colourContext.clearRect(0, 0, 1, 1);
  colourContext.fillStyle = colour;
  colourContext.fillRect(0, 0, 1, 1);
  const [red, green, blue] = colourContext.getImageData(0, 0, 1, 1).data;
  // Canvas interpolates transparent black differently from SVG's same-colour
  // stop-opacity=0, so retain the endpoint RGB even at zero alpha.
  return `rgba(${red}, ${green}, ${blue}, 0)`;
}

function meshTile(parsed, opacity = 1) {
  const alpha = Math.max(0, Math.min(1, opacity));
  const blur = Math.max(10, Math.min(100, Number(parsed.blur) || 45));
  const points = parsed.points;
  if (!Array.isArray(points) || points.length < 2) throw new TypeError("Invalid mesh gradient points");
  const key = JSON.stringify([points, blur, alpha]);
  let entry = tiles.get(key);
  if (entry) {
    tiles.delete(key);
    tiles.set(key, entry);
    return entry;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE_EDGE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = points[0].color;
  ctx.fillRect(0, 0, TILE_EDGE, TILE_EDGE);
  const radius = Math.round(blur * 1.5) * TILE_EDGE / 100;
  for (const point of points) {
    const x = point.x * TILE_EDGE / 100, y = point.y * TILE_EDGE / 100;
    const ramp = ctx.createRadialGradient(x, y, 0, x, y, radius);
    ramp.addColorStop(0, point.color);
    ramp.addColorStop(1, transparentEndpoint(point.color));
    ctx.globalAlpha = Math.max(0, Math.min(100, point.opacity ?? 100)) / 100;
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, TILE_EDGE, TILE_EDGE);
  }
  // Fill opacity belongs to the completed paint, not to every overlapping blob.
  if (alpha < 1) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, TILE_EDGE, TILE_EDGE);
  }
  entry = { canvas };
  if (tiles.size >= CACHE_LIMIT) tiles.delete(tiles.keys().next().value);
  tiles.set(key, entry);
  return entry;
}

/** A synchronously available paint for every vector silhouette and transform. */
export function meshCanvasPattern(ctx, parsed, x, y, width, height, opacity, paintTransform = null) {
  const { canvas } = meshTile(parsed, opacity);
  const pattern = ctx.createPattern(canvas, "no-repeat");
  if (!pattern) throw new Error("Mesh gradient pattern could not be created");
  const bounds = new DOMMatrix().translate(x, y).scale(width / TILE_EDGE, height / TILE_EDGE);
  pattern.setTransform(paintTransform ? paintTransform.multiply(bounds) : bounds);
  return pattern;
}

/** CanvasKit decodes PNG, so reuse a bounded cached PNG instead of its SVG URL. */
export function meshSceneFill(parsed, opacity) {
  const entry = meshTile(parsed);
  entry.dataUrl ??= entry.canvas.toDataURL("image/png");
  return { type: "image", imageUrl: entry.dataUrl, imageFit: "fill", opacity, color: "transparent" };
}
