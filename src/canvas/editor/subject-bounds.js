/**
 * Calculates subject bounding box and weighted centroid from single-channel weights.
 * Returns null if the weights array is empty (all zeroes or max <= 0).
 */
export function subjectBounds(weights, width, height) {
  if (!weights || weights.length === 0) return null;
  if (weights.length !== width * height) {
    throw new Error(`Weights length (${weights.length}) mismatch image dimensions (${width}x${height})`);
  }
  let maxWeight = 0;
  for (let i = 0; i < weights.length; i += 1) {
    if (weights[i] > maxWeight) maxWeight = weights[i];
  }
  if (maxWeight <= 0) return null;

  // Threshold at 8% of max value to filter out matte noise while capturing soft edges
  const threshold = Math.max(1e-4, maxWeight * 0.08);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let totalWeight = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const w = weights[rowOffset + x];
      if (w >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x * w;
        sumY += y * w;
        totalWeight += w;
      }
    }
  }
  if (maxX < minX || maxY < minY || totalWeight <= 0) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    cx: sumX / totalWeight,
    cy: sumY / totalWeight,
    totalWeight,
    maxWeight,
  };
}

