/** Small path helpers shared by the Magnetic Lasso draft state machine. */

export function appendMagneticPath(target, segment) {
  if (!segment?.length) return target;
  const start = target.length > 0 ? 1 : 0;
  for (let index = start; index < segment.length; index += 1) {
    target.push(segment[index]);
  }
  return target;
}

export function magneticPolygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area) / 2;
}

export function sameMagneticPoint(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}
