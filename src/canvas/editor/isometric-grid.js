/** The triangular lattice uses alternating rows separated by half a grid cell. */
export function nearestIsometricVertex(x, y, size) {
  const dx = size * Math.sqrt(3) / 2;
  const dy = size / 2;
  const row = Math.round(y / dy);
  let nearest = null;
  // Rounding Y alone can select a distant staggered row even when a vertex
  // in the adjacent row is closer. Three rows cover the nearest of each parity.
  // Evaluate the rounded row first to retain stable choices at exact ties.
  for (const candidateRow of [row, row - 1, row + 1]) {
    const offset = Math.abs(candidateRow % 2) === 1 ? dx : 0;
    const column = Math.round((x - offset) / (2 * dx));
    const candidateX = column * 2 * dx + offset;
    const candidateY = candidateRow * dy;
    const dist = Math.hypot(x - candidateX, y - candidateY);
    if (!nearest || dist < nearest.dist) nearest = { x: candidateX, y: candidateY, dist };
  }
  return nearest;
}
