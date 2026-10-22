/**
 * Owns one HTMLVideoElement per video layer. Each layer plays on its own loop;
 * the stage asks for the current frame and is asked to repaint while any clip
 * is playing. There is no shared timeline.
 */
export function createVideoLayerRuntime(onChange, onError) {
  const entries = new Map();
  let disposed = false;
  let frameRequest = 0;

  function paintLoop() {
    frameRequest = 0;
    if (disposed) return;
    const anyPlaying = [...entries.values()].some((entry) => entry.ready && !entry.video.paused);
    onChange();
    if (anyPlaying) frameRequest = requestAnimationFrame(paintLoop);
  }

  function schedulePaint() {
    if (!frameRequest && typeof requestAnimationFrame === "function") {
      frameRequest = requestAnimationFrame(paintLoop);
    }
  }

  function ensure(node) {
    if (!node.src) {
      onError(node.id, new Error("Video source is unavailable"));
      return;
    }
    const current = entries.get(node.id);
    if (current?.src === node.src) return;
    if (current) {
      current.video.pause();
      current.video.removeAttribute("src");
      current.video.load();
    }
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    video.loop = node.media?.loop !== false;
    video.muted = Boolean(node.media?.muted);
    video.volume = node.media?.volume ?? 1;
    const entry = { src: node.src, video, ready: false };
    entries.set(node.id, entry);
    video.addEventListener("loadeddata", () => {
      if (disposed || entries.get(node.id) !== entry) return;
      entry.ready = true;
      video.play().catch(() => {});
      schedulePaint();
      onChange();
    });
    video.addEventListener("error", () => {
      if (disposed || entries.get(node.id) !== entry) return;
      onError(node.id, new Error("Video decode failed"));
    });
    video.src = node.src;
  }

  /** The element to draw for this layer, or null while it is still loading. */
  function frame(node) {
    const entry = entries.get(node.id);
    return entry?.ready ? entry.video : null;
  }

  function prune(ids) {
    for (const [id, entry] of entries) {
      if (ids.has(id)) continue;
      entry.video.pause();
      entry.video.removeAttribute("src");
      entry.video.load();
      entries.delete(id);
    }
  }

  function dispose() {
    disposed = true;
    if (frameRequest && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRequest);
    prune(new Set());
  }

  return { ensure, frame, prune, dispose };
}
