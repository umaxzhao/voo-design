// YIQ separates perceived brightness from chroma. A normalized 0.2 threshold
// tolerates font antialiasing without shifting pixel sample positions.
const MAX_YIQ_DISTANCE = 35215;
function coverageColor(pixels, offset, width, channel) {
  const height = pixels.length / 4 / width;
  const x = offset / 4 % width;
  const y = Math.floor(offset / 4 / width);
  let sum = 0;
  let weightSum = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
    const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
    sum += pixels[((y + dy) * width + x + dx) * 4 + channel] * weight;
    weightSum += weight;
  }
  return sum / weightSum;
}

function colorDistance(first, second, offset, width) {
  // Compare local ink coverage rather than backend-specific glyph edge
  // quantization. This never shifts coordinates; alpha is checked separately.
  const red = coverageColor(first, offset, width, 0) - coverageColor(second, offset, width, 0);
  const green = coverageColor(first, offset, width, 1) - coverageColor(second, offset, width, 1);
  const blue = coverageColor(first, offset, width, 2) - coverageColor(second, offset, width, 2);
  const luminance = red * 0.29889531 + green * 0.58662247 + blue * 0.11448223;
  const inPhase = red * 0.59597799 - green * 0.2741761 - blue * 0.32180189;
  const quadrature = red * 0.21147017 - green * 0.52261711 + blue * 0.31114694;
  return 0.5053 * luminance ** 2 + 0.299 * inPhase ** 2 + 0.1957 * quadrature ** 2;
}

export function compareRasterPixels(first, second, width, threshold = 0.2) {
  if (first.length !== second.length || first.length % 4 || width < 1) throw new Error("Invalid raster dimensions");
  let differentPixels = 0;
  let unmatchedPixels = 0;
  let alphaMismatches = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    if (first.subarray(offset, offset + 4).every((value, channel) => value === second[offset + channel])) continue;
    differentPixels++;
    if (Math.abs(first[offset + 3] - second[offset + 3]) > 1) alphaMismatches++;
    if (colorDistance(first, second, offset, width) > MAX_YIQ_DISTANCE * threshold ** 2) unmatchedPixels++;
  }
  // Permit at most 0.01% sparse RGB edge outliers, scaled with device pixels.
  // Transparency remains strict even for one-pixel cutouts.
  const allowance = Math.floor(first.length / 4 * 0.0001);
  return { matches: alphaMismatches === 0 && unmatchedPixels <= allowance,
    differentPixels, unmatchedPixels, alphaMismatches };
}
