import { applyBoxBlur } from "./spatial_filter.js";
import { createGroupNode, createImageNode } from "./scene_model.js";

/** Split RGBA pixels into a Gaussian-like low layer and linear-light detail. */
export function createFrequencySeparationPixels(source, width, height, radius) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Frequency Separation dimensions must be positive integers");
  }
  if (!Number.isFinite(radius) || radius < 1 || radius > 100) {
    throw new RangeError("Frequency Separation radius must be between 1 and 100 px");
  }
  if (!source || source.length !== width * height * 4) {
    throw new RangeError("Frequency Separation source must be an RGBA buffer matching its dimensions");
  }
  const low = Uint8ClampedArray.from(source);
  applyBoxBlur(low, width, height, radius);
  const high = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      high[i + channel] = 128 + (source[i + channel] - low[i + channel]) / 2;
    }
    high[i + 3] = source[i + 3];
  }
  return { low, high };
}

/** Create the paired raster nodes used by the editor's atomic layer operation. */
export function buildFrequencySeparationLayerTree(sourceNode, lowImageId, highImageId) {
  const group = createGroupNode({
    x: sourceNode.x,
    y: sourceNode.y,
    width: sourceNode.width,
    height: sourceNode.height,
    parentId: sourceNode.parentId ?? null,
  });
  const low = {
    ...createImageNode({
      x: sourceNode.x,
      y: sourceNode.y,
      width: sourceNode.width,
      height: sourceNode.height,
      imageId: lowImageId,
    }),
    parentId: group.id,
  };
  const high = {
    ...createImageNode({
      x: sourceNode.x,
      y: sourceNode.y,
      width: sourceNode.width,
      height: sourceNode.height,
      imageId: highImageId,
    }),
    parentId: group.id,
    blendMode: "linear-light",
  };
  return { group, low, high };
}
