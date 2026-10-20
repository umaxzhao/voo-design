/** HTMLVideoElement ownership and deterministic frame seeking. */
export function createVideoRuntime(onChange, onError) {
  const entries = new Map();
  let disposed = false;
  let playing = false;

  function pauseEntry(entry) {
    // A resumed request must not inherit an AbortError from the play we paused.
    entry.playGeneration = (entry.playGeneration ?? 0) + 1;
    entry.video.pause();
  }

  function release(entry) {
    if (!entry) return;
    entry.settle?.();
    entry.cancelSeek?.();
    entry.cleanup?.();
    pauseEntry(entry);
    entry.video.removeAttribute("src");
    entry.video.load();
  }

  function ensure(node) {
    if (!node.src) {
      onError(node.id, new Error("Video source is unavailable"));
      return Promise.resolve();
    }
    let entry = entries.get(node.id);
    if (entry?.src === node.src) return entry.promise;
    if (entry) release(entry);
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    video.muted = Boolean(node.media?.muted);
    video.volume = node.media?.volume ?? 1;
    entry = {
      id: node.id,
      src: node.src,
      video,
      ready: false,
      error: null,
      playGeneration: 0,
    };
    entries.set(node.id, entry);
    entry.promise = new Promise((resolve) => {
      entry.settle = resolve;
      const loaded = () => {
        if (disposed || entries.get(node.id) !== entry) return;
        entry.ready = true;
        cleanup();
        onChange();
        resolve();
      };
      const failed = () => {
        if (disposed || entries.get(node.id) !== entry) return;
        entry.error = new Error("Video decode failed");
        cleanup();
        onError(node.id, entry.error);
        resolve();
      };
      const cleanup = () => {
        video.removeEventListener("loadeddata", loaded);
        video.removeEventListener("error", failed);
      };
      entry.cleanup = cleanup;
      video.addEventListener("loadeddata", loaded);
      video.addEventListener("error", failed);
      video.src = node.src;
      video.load();
      if (video.readyState >= 2) loaded();
    });
    return entry.promise;
  }

  function sourceTime(node, compositionTime, duration) {
    const media = node.media ?? {};
    const local = Math.max(0, compositionTime - (node.timing?.start ?? 0));
    const target = (media.inPoint ?? 0) + local * (media.speed ?? 1);
    const end = Number.isFinite(media.outPoint)
      ? media.outPoint
      : Number.isFinite(duration)
        ? duration
        : target + 1;
    return Math.min(Math.max(0, target), Math.max(0, end - 0.0001));
  }

  async function seek(node, compositionTime) {
    await ensure(node);
    const entry = entries.get(node.id);
    if (!entry?.ready) throw entry?.error ?? new Error("Video is not ready");
    const video = entry.video;
    video.muted = Boolean(node.media?.muted);
    video.volume = node.media?.volume ?? 1;
    video.playbackRate = node.media?.speed ?? 1;
    const target = sourceTime(node, compositionTime, video.duration);
    if (entry.pendingTarget === target && entry.pendingSeek) {
      await entry.pendingSeek;
      return video;
    }
    entry.cancelSeek?.();
    if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2)
      return video;
    entry.pendingTarget = target;
    entry.pendingSeek = new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener("seeked", succeeded);
        video.removeEventListener("error", failed);
        entry.cancelSeek = null;
        entry.pendingTarget = null;
        entry.pendingSeek = null;
      };
      entry.cancelSeek = () => {
        cleanup();
        resolve();
      };
      const succeeded = () => {
        cleanup();
        onChange();
        resolve();
      };
      const failed = () => {
        cleanup();
        const error = new Error("Video frame seek failed");
        onError(node.id, error);
        reject(error);
      };
      video.addEventListener("seeked", succeeded);
      video.addEventListener("error", failed);
      timer = setTimeout(failed, 10000);
      video.currentTime = target;
    });
    await entry.pendingSeek;
    return video;
  }

  function synchronize(node, compositionTime) {
    const entry = entries.get(node.id);
    if (!entry?.ready) return;
    const video = entry.video;
    if (node.visible === false) {
      pauseEntry(entry);
      return;
    }
    video.muted = Boolean(node.media?.muted);
    video.volume = node.media?.volume ?? 1;
    video.playbackRate = node.media?.speed ?? 1;
    const target = sourceTime(node, compositionTime, video.duration);
    if (Math.abs(video.currentTime - target) > 0.25) video.currentTime = target;
    if (playing && video.paused) {
      const playGeneration = entry.playGeneration ?? 0;
      video.play().catch((error) => {
        // HTML media rejects a pending play when our pause/release interrupts
        // it. Only that invalidated request is cancellation, not media failure.
        if (
          error?.name === "AbortError" &&
          playGeneration !== entry.playGeneration
        )
          return;
        onError(node.id, error);
      });
    } else if (!playing && !video.paused) {
      pauseEntry(entry);
    }
  }

  function frame(node) {
    const entry = entries.get(node.id);
    return entry?.ready && entry.video.readyState >= 2 ? entry.video : null;
  }
  function setPlaying(value) {
    playing = Boolean(value);
    if (!playing) for (const entry of entries.values()) pauseEntry(entry);
  }
  function errorFor(id) {
    return entries.get(id)?.error ?? null;
  }
  function getPlaybackMetadata(id) {
    const entry = entries.get(id);
    if (!entry) return null;
    return {
      ready: entry.ready && !entry.error,
      // Infinity is normal for streaming/MediaRecorder WebM; NaN is unknown,
      // not a decoded zero-length video. Preserve the browser's distinction.
      duration: entry.video.duration,
    };
  }
  function prune(ids) {
    for (const [id, entry] of entries) {
      if (ids.has(id)) continue;
      release(entry);
      entries.delete(id);
    }
  }
  function dispose() {
    disposed = true;
    prune(new Set());
  }
  return {
    ensure,
    seek,
    synchronize,
    frame,
    setPlaying,
    errorFor,
    getPlaybackMetadata,
    prune,
    dispose,
  };
}
