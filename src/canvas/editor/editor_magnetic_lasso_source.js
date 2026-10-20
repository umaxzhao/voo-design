/** DOM adapter between image sources and the pure Magnetic Lasso solver. */

import { resolveRasterLevelFromPyramid } from "./raster_level.js";
import {
  buildLiveWireTree,
  clampLiveWireRoi,
  computeScharrGradient,
} from "./magnetic_lasso.js";
import { fromNodeLocal, toNodeLocal } from "./scene_geometry.js";

function sourceDimensions(source) {
  const width = source?.naturalWidth ?? source?.width ?? 0;
  const height = source?.naturalHeight ?? source?.height ?? 0;
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError("Magnetic Lasso requires a sized bitmap source");
  }
  return { width, height };
}

function readSourceRoi(source, roi) {
  if (typeof document === "undefined") {
    throw new Error("Magnetic Lasso pixel reads require a document");
  }
  const canvas = document.createElement("canvas");
  canvas.width = roi.width;
  canvas.height = roi.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Magnetic Lasso could not create a 2D context");
  context.drawImage(source, -roi.x, -roi.y);
  return context.getImageData(0, 0, roi.width, roi.height).data;
}

export function assertMagneticLassoHost(node) {
  if (!node || node.kind !== "image") {
    throw new TypeError("Magnetic Lasso requires an image node");
  }
  if (
    node.warpMesh?.points?.length ||
    node.perspectiveCorners?.length === 4 ||
    node.perspectiveQuad?.length === 4
  ) {
    throw new Error("MAGNETIC_LASSO_NONLINEAR_HOST");
  }
}

/** Selects the render pyramid tier and defines its document mapping. */
export function prepareMagneticLassoSource(node, bitmap, viewport) {
  assertMagneticLassoHost(node);
  const bitmapSize = sourceDimensions(bitmap);
  const rasterLevel = resolveRasterLevelFromPyramid({
    source: bitmap,
    nodeWidth: Math.max(
      node.width,
      node.height * (bitmapSize.width / bitmapSize.height),
    ),
    viewport,
    dpr: 1,
  });
  const size = sourceDimensions(rasterLevel.source);
  return Object.freeze({
    bitmap,
    bitmapVersion: bitmap.__warpTextureVersion ?? 0,
    source: rasterLevel.source,
    tierLevel: rasterLevel.level,
    tierScale: rasterLevel.scale,
    width: size.width,
    height: size.height,
  });
}

export function docPointToTier(node, analysis, point) {
  const local = toNodeLocal(node, point);
  return {
    x: Math.max(
      0,
      Math.min(analysis.width - 1, (local.x / node.width) * analysis.width),
    ),
    y: Math.max(
      0,
      Math.min(analysis.height - 1, (local.y / node.height) * analysis.height),
    ),
  };
}

export function tierPointToDoc(node, analysis, point) {
  return fromNodeLocal(node, {
    x: (point[0] / analysis.width) * node.width,
    y: (point[1] / analysis.height) * node.height,
  });
}

/** Builds one bounded tree. The reader is injectable for direct node:test use. */
export function buildMagneticSegment(
  analysis,
  anchor,
  { radius, contrast, readRgba = readSourceRoi } = {},
) {
  const roi = clampLiveWireRoi({
    anchor,
    imageWidth: analysis.width,
    imageHeight: analysis.height,
    requestedRadius: radius,
  });
  const rgba = readRgba(analysis.source, roi);
  const gradient = computeScharrGradient(rgba, roi.width, roi.height);
  const tree = buildLiveWireTree(gradient, roi.anchor, { contrast });
  return Object.freeze({ roi, gradient, tree });
}
