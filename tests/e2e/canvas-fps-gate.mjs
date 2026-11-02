export function fpsThreshold(value) {
  const threshold = Number(value ?? 30);
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Invalid VOO_FPS_MIN");
  return threshold;
}

/** Missing measurements and invalid samples must never silently pass a gate. */
export function assertFpsThreshold(results, minimumFps = 30) {
  if (!results.length) throw new Error("No canvas FPS samples were collected");
  for (const result of results) {
    if (!Number.isFinite(result.avgFps) || result.avgFps <= 0 || result.frames < 1) {
      throw new Error(`Invalid canvas FPS sample: ${result.scenario}/${result.nodeCount}`);
    }
  }
  const failures = results.filter(result => result.avgFps < minimumFps);
  if (failures.length) throw new Error(`Canvas FPS below ${minimumFps}: ${failures.map(result =>
    `${result.scenario}/${result.nodeCount}=${result.avgFps}`).join(", ")}`);
}
