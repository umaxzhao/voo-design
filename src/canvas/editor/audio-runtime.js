/**
 * HTMLAudioElement ownership and playhead synchronisation for a scene's
 * sound layers.
 *
 * Mirrors `video-runtime.js` — one element per layer, hydrated by asset id,
 * pruned with the document — with two differences that follow from sound having
 * no picture: there is no frame to return, and the playhead decides *gain* as
 * well as position, because a fade lives in the clip rather than in the file.
 *
 * The two decisions that matter, "where does it start playing" and "how loud",
 * are pure (`audioSyncPlan`) so they can be asserted without a DOM.
 */

/** Where this clip's sound actually ends: its tail, its footage or the comp. */
function clipEnd(node, duration) {
  const start = node?.timing?.start ?? 0;
  const media = node?.media ?? {};
  const speed = media.speed > 0 ? media.speed : 1;
  const source = Number.isFinite(media.outPoint)
    ? start + Math.max(0, media.outPoint - (media.inPoint ?? 0)) / speed
    : Infinity;
  const composed = Number.isFinite(node?.timing?.end)
    ? node.timing.end
    : duration;
  const bounds = [source, composed];
  if (Number.isFinite(duration)) bounds.push(duration);
  return bounds
    .filter(Number.isFinite)
    .reduce((a, b) => Math.min(a, b), Infinity);
}

/**
 * The clip's gain at a composition time: its own volume, shaped by the
 * fade in and fade out it carries. Clamped to 0..1 so a fade longer than the
 * clip cannot drive the element negative or past full level.
 *
 * @param {object} node an audio layer
 * @param {number} time composition time in seconds
 * @param {number} duration the composition's length
 * @returns {number} 0..1
 */
export function audioGainAt(node, time, duration) {
  const start = node?.timing?.start ?? 0;
  const end = clipEnd(node, duration);
  const media = node?.media ?? {};
  const fadeIn = Math.max(0, media.fadeIn ?? 0);
  const fadeOut = Math.max(0, media.fadeOut ?? 0);
  let gain = 1;
  if (fadeIn > 0 && time < start + fadeIn)
    gain = Math.min(gain, (time - start) / fadeIn);
  if (fadeOut > 0 && time > end - fadeOut)
    gain = Math.min(gain, (end - time) / fadeOut);
  return Math.max(0, Math.min(1, Number.isFinite(gain) ? gain : 0));
}

/**
 * What one layer's element should be doing at this playhead position.
 *
 * @param {object} node an audio layer
 * @param {number} time composition time in seconds
 * @param {number} duration the composition's length
 * @param {boolean} playing whether the timeline is running
 * @returns {{play: boolean, time: number, volume: number}}
 */
export function audioSyncPlan(node, time, duration, playing) {
  const start = node?.timing?.start ?? 0;
  const end = clipEnd(node, duration);
  const media = node?.media ?? {};
  const speed = media.speed > 0 ? media.speed : 1;
  const inside = time >= start && time < end;
  return {
    play: Boolean(playing && inside),
    time: Math.max(0, (media.inPoint ?? 0) + Math.max(0, time - start) * speed),
    volume: media.muted
      ? 0
      : Math.max(
          0,
          Math.min(1, (media.volume ?? 1) * audioGainAt(node, time, duration)),
        ),
  };
}

/** How far the element may drift from the plan before it is corrected. */
const DRIFT_TOLERANCE = 0.25;

/** One editor owns every audio element in its scene. */
export function createAudioRuntime(onChange, onError) {
  const entries = new Map();
  let disposed = false;
  let playing = false;

  function pauseEntry(entry) {
    if (!entry || entry.audio.paused) return;
    entry.audio.pause();
  }

  function release(entry) {
    if (!entry) return;
    pauseEntry(entry);
    entry.audio.removeAttribute("src");
    entry.audio.load();
  }

  function ensure(node) {
    if (!node.src) {
      onError(node.id, new Error("Audio source is unavailable"));
      return Promise.resolve();
    }
    let entry = entries.get(node.id);
    if (entry?.src === node.src) return entry.promise;
    if (entry) release(entry);
    // No crossOrigin: sound is never read back into a canvas, and requiring
    // CORS headers the hosted assets may not send would break playback.
    const audio = document.createElement("audio");
    audio.preload = "auto";
    entry = { id: node.id, src: node.src, audio, ready: false, error: null };
    entries.set(node.id, entry);
    entry.promise = new Promise((resolve) => {
      const cleanup = () => {
        audio.removeEventListener("loadeddata", loaded);
        audio.removeEventListener("error", failed);
      };
      const loaded = () => {
        if (disposed || entries.get(node.id) !== entry) {
          cleanup();
          return;
        }
        entry.ready = true;
        cleanup();
        onChange();
        resolve();
      };
      const failed = () => {
        if (disposed || entries.get(node.id) !== entry) {
          cleanup();
          return;
        }
        entry.error = new Error("Audio decode failed");
        cleanup();
        onError(node.id, entry.error);
        resolve();
      };
      audio.addEventListener("loadeddata", loaded);
      audio.addEventListener("error", failed);
      audio.src = node.src;
      audio.load();
      if (audio.readyState >= 2) loaded();
    });
    return entry.promise;
  }

  function apply(entry, plan) {
    const { audio } = entry;
    audio.volume = plan.volume;
    if (!plan.play) {
      pauseEntry(entry);
      // Position without auditioning: a scrub moves the head and stays silent.
      if (Math.abs(audio.currentTime - plan.time) > DRIFT_TOLERANCE / 5)
        audio.currentTime = plan.time;
      return;
    }
    if (Math.abs(audio.currentTime - plan.time) > DRIFT_TOLERANCE)
      audio.currentTime = plan.time;
    if (audio.paused) {
      const generation = (entry.playGeneration ?? 0) + 1;
      entry.playGeneration = generation;
      audio.play().catch((error) => {
        // A pause or release of ours invalidates a pending play; only that
        // cancellation is ours to ignore.
        if (error?.name === "AbortError" && entry.playGeneration !== generation)
          return;
        onError(entry.id, error);
      });
    }
  }

  /** Position only — the playhead visits while paused must stay silent. */
  async function seek(node, time, duration) {
    await ensure(node);
    const entry = entries.get(node.id);
    if (!entry?.ready) throw entry?.error ?? new Error("Audio is not ready");
    pauseEntry(entry);
    apply(entry, audioSyncPlan(node, time, duration, false));
  }

  /** Follow the running playhead: this is the call that may start sound. */
  async function synchronize(node, time, duration) {
    await ensure(node);
    const entry = entries.get(node.id);
    if (!entry?.ready) return;
    if (node.visible === false) {
      pauseEntry(entry);
      return;
    }
    apply(entry, audioSyncPlan(node, time, duration, playing));
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
      duration: entry.audio.duration,
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
    playing = false;
    prune(new Set());
  }
  return {
    ensure,
    seek,
    synchronize,
    setPlaying,
    errorFor,
    getPlaybackMetadata,
    prune,
    dispose,
  };
}
