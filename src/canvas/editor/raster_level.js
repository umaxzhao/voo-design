import { ensureImagePyramid, getPyramidSource } from "./image_pyramid.js";

/**
 * The sole per-node, per-frame LOD decision contract.
 *
 * Pyramid code owns available tiers and their pixels. Renderers provide one
 * tier selector here, then image, matte, CPU, WebGL, and Skia consumers reuse
 * the returned descriptor without interpreting viewport scale themselves.
 */

export const RASTER_LEVEL_CONSUMER = Object.freeze({
  IMAGE: "image",
  MATTE: "matte",
  CPU_FALLBACK: "cpu-fallback",
  WEBGL: "webgl",
  SKIA: "skia",
});

const RASTER_LEVEL_CONSUMERS = new Set(Object.values(RASTER_LEVEL_CONSUMER));

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number`);
  }
  return value;
}

function sourceDimension(source, naturalKey, fallbackKey) {
  return source?.[naturalKey] ?? source?.[fallbackKey] ?? 0;
}

/** Computes display pixels per natural source pixel in one canonical place. */
export function rasterDisplayScale({ source, nodeWidth, viewport, dpr }) {
  const naturalWidth = finitePositive(
    sourceDimension(source, "naturalWidth", "width"),
    "source width",
  );
  return (
    (finitePositive(nodeWidth, "nodeWidth") *
      finitePositive(viewport?.zoom ?? 1, "viewport.zoom") *
      finitePositive(dpr ?? 1, "dpr")) /
    naturalWidth
  );
}

/**
 * Resolves exactly one immutable LOD descriptor for a node frame.
 * `selectTier` is supplied by image_pyramid so this module does not duplicate
 * its thresholds or make the pyramid depend on renderer implementations.
 */
export function resolveRasterLevel({
  source,
  nodeWidth,
  viewport,
  dpr,
  fullResolution = false,
  selectTier,
}) {
  const naturalWidth = finitePositive(
    sourceDimension(source, "naturalWidth", "width"),
    "source width",
  );
  const naturalHeight = finitePositive(
    sourceDimension(source, "naturalHeight", "height"),
    "source height",
  );
  const displayScale = fullResolution
    ? 1
    : rasterDisplayScale({
        source,
        nodeWidth,
        viewport,
        dpr,
      });

  let tier = { level: 0, scale: 1 };
  if (!fullResolution) {
    if (typeof selectTier !== "function") {
      throw new TypeError("selectTier must be a function");
    }
    tier = selectTier(naturalWidth, naturalHeight, displayScale);
  }
  if (!Number.isInteger(tier?.level) || tier.level < 0) {
    throw new TypeError("selected raster level must be a non-negative integer");
  }
  finitePositive(tier.scale, "selected raster scale");

  return Object.freeze({
    source,
    level: tier.level,
    scale: tier.scale,
    displayScale,
    naturalWidth,
    naturalHeight,
    fullResolution: Boolean(fullResolution),
  });
}

/** Resolves the shared descriptor and the matching pyramid source together. */
export function resolveRasterLevelFromPyramid({
  source,
  nodeWidth,
  viewport,
  dpr,
  fullResolution = false,
}) {
  const naturalWidth = sourceDimension(source, "naturalWidth", "width");
  const naturalHeight = sourceDimension(source, "naturalHeight", "height");
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
    return Object.freeze({
      source,
      level: 0,
      scale: 1,
      displayScale: 1,
      naturalWidth,
      naturalHeight,
      fullResolution: Boolean(fullResolution),
    });
  }
  let selected = null;
  const rasterLevel = resolveRasterLevel({
    source,
    nodeWidth,
    viewport,
    dpr,
    fullResolution,
    selectTier: (naturalWidth, naturalHeight, displayScale) => {
      selected = getPyramidSource(source, {
        onScreenScale: displayScale,
        fullResolution,
      });
      return selected;
    },
  });
  return Object.freeze({
    ...rasterLevel,
    source: selected?.source ?? source,
  });
}

/** Returns another bitmap (for example a matte) at the already chosen level. */
export function sourceAtRasterLevel(source, rasterLevel) {
  if (!source) return source;
  if (rasterLevel.fullResolution || rasterLevel.level === 0) return source;
  return ensureImagePyramid(source)?.get(rasterLevel.level) ?? source;
}

/** Validates a consumer and returns the same descriptor by identity. */
export function rasterLevelForConsumer(rasterLevel, consumer) {
  if (!RASTER_LEVEL_CONSUMERS.has(consumer)) {
    throw new TypeError(`Unknown RasterLevel consumer: ${consumer}`);
  }
  if (!Object.isFrozen(rasterLevel)) {
    throw new TypeError("RasterLevel must be the shared immutable descriptor");
  }
  return rasterLevel;
}
