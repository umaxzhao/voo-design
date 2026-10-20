const MEDIA_EVENT_TIMEOUT_MS = 10000;
const DEFAULT_CACHE_ENTRIES = 120;

export const VIDEO_THUMBNAIL_WIDTH = 96;
export const VIDEO_THUMBNAIL_HEIGHT = 54;

function abortError() {
  const error = new Error("Video preview sampling was cancelled");
  error.name = "AbortError";
  return error;
}

function waitForMediaEvent(video, eventName, action, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      video.removeEventListener(eventName, succeeded);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    };
    const succeeded = () => finish(null);
    const failed = () =>
      finish(new Error("Video preview frame could not load"));
    const aborted = () => finish(abortError());
    video.addEventListener(eventName, succeeded);
    video.addEventListener("error", failed);
    signal?.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(
      () => finish(new Error("Video preview frame timed out")),
      MEDIA_EVENT_TIMEOUT_MS,
    );
    try {
      action();
    } catch (error) {
      finish(error);
    }
  });
}

function drawCoverFrame(context, video, width, height) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    video,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

/** Decode thumbnails on a private, muted video so timeline sampling never seeks playback. */
export function createVideoFilmstripService({
  createVideo = () => document.createElement("video"),
  createCanvas = () => document.createElement("canvas"),
  maxEntries = DEFAULT_CACHE_ENTRIES,
} = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1)
    throw new TypeError("Video preview cache size must be positive");
  const cache = new Map();

  function cacheKey(src, time, width, height) {
    return JSON.stringify([src, Math.round(time * 1000), width, height]);
  }

  function cached(key) {
    if (!cache.has(key)) return null;
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function remember(key, value) {
    cache.set(key, value);
    if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  async function sample(
    src,
    times,
    {
      signal,
      width = VIDEO_THUMBNAIL_WIDTH,
      height = VIDEO_THUMBNAIL_HEIGHT,
    } = {},
  ) {
    if (typeof src !== "string" || !src)
      throw new TypeError("Video preview source is required");
    if (!Array.isArray(times) || times.some((time) => !Number.isFinite(time)))
      throw new TypeError("Video preview times must be finite");
    if (!(width > 0 && height > 0))
      throw new TypeError("Video preview dimensions must be positive");
    if (signal?.aborted) throw abortError();

    const keys = times.map((time) => cacheKey(src, time, width, height));
    const frames = keys.map(cached);
    if (frames.every(Boolean)) return frames;

    const video = createVideo();
    const canvas = createCanvas();
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Video preview canvas is unavailable");
      canvas.width = width;
      canvas.height = height;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.playsInline = true;
      video.muted = true;
      await waitForMediaEvent(
        video,
        "loadeddata",
        () => {
          video.src = src;
          video.load();
        },
        signal,
      );
      for (let index = 0; index < times.length; index += 1) {
        if (frames[index]) continue;
        if (signal?.aborted) throw abortError();
        const target =
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.min(Math.max(0, times[index]), video.duration - 0.0001)
            : Math.max(0, times[index]);
        if (
          Math.abs(video.currentTime - target) >= 0.001 ||
          video.readyState < 2
        )
          await waitForMediaEvent(
            video,
            "seeked",
            () => {
              video.currentTime = target;
            },
            signal,
          );
        context.clearRect(0, 0, width, height);
        drawCoverFrame(context, video, width, height);
        const frame = canvas.toDataURL("image/jpeg", 0.72);
        frames[index] = frame;
        remember(keys[index], frame);
      }
      return frames;
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return { sample, clear: () => cache.clear() };
}
