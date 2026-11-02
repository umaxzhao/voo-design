/** Coalesce continuous camera changes while discrete setters remain immediate. */
export function createCameraRafBatcher({
  getCamera,
  setCamera,
  panBy = (camera, dx, dy) => ({
    ...camera,
    panX: (camera.panX || 0) + dx,
    panY: (camera.panY || 0) + dy,
  }),
  requestAnimationFrame = globalThis.requestAnimationFrame,
}) {
  let dx = 0;
  let dy = 0;
  let patches = [];
  let scheduled = false;
  let disposed = false;
  let generation = 0;

  const flush = () => {
    // Invalidate queued callbacks, including callbacks from an earlier flush.
    generation += 1;
    scheduled = false;
    if (disposed || (!dx && !dy && !patches.length)) return;
    let camera = panBy(getCamera(), dx, dy);
    dx = dy = 0;
    const pending = patches;
    patches = [];
    for (const patch of pending) {
      camera = {
        ...camera,
        ...(typeof patch === "function" ? patch(camera) : patch),
      };
    }
    setCamera(camera);
  };

  const schedule = () => {
    if (disposed || scheduled) return;
    scheduled = true;
    const token = ++generation;
    if (typeof requestAnimationFrame !== "function") {
      flush();
      return;
    }
    requestAnimationFrame(() => {
      if (token === generation) flush();
    });
  };

  return {
    pan(dxValue, dyValue) {
      if (disposed) return;
      dx += dxValue;
      dy += dyValue;
      schedule();
    },
    zoom(patch) {
      if (disposed) return;
      patches.push(patch);
      schedule();
    },
    flush,
    dispose() {
      disposed = true;
      dx = dy = 0;
      patches = [];
      generation += 1;
      scheduled = false;
    },
  };
}
