/**
 * Peaks and bar geometry for the timeline's audio waveform.
 *
 * The peaks are extracted once per source and cached, because decoding a file
 * per render would make scrubbing the timeline expensive; the geometry is a
 * pure mapping so the shape of a wave can be asserted without a browser.
 */

const WAVEFORM_BUCKETS = 96;

/** Highest absolute sample in each of `buckets` equal slices, scaled 0..1. */
export function peaksFromSamples(samples, buckets) {
  const count = Math.floor(Number(buckets));
  if (!samples?.length || !(count > 0)) return [];
  const per = samples.length / count;
  const peaks = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const from = Math.floor(index * per);
    const to = Math.max(from + 1, Math.floor((index + 1) * per));
    let peak = 0;
    for (
      let sample = from;
      sample < to && sample < samples.length;
      sample += 1
    ) {
      const value = Math.abs(samples[sample]);
      if (value > peak) peak = value;
    }
    peaks[index] = Math.min(1, peak);
  }
  return peaks;
}

/**
 * One rectangle per peak, mirrored about the lane's middle: `x` and `width`
 * fill the clip, `y` and `height` are centred so a loud passage grows both
 * ways at once.
 *
 * @param {number[]} peaks values in 0..1
 * @param {number} width lane width in user units
 * @param {number} height lane height in user units
 * @returns {{x: number, y: number, width: number, height: number}[]}
 */
export function waveformBars(peaks, width, height) {
  if (!peaks?.length || !(width > 0) || !(height > 0)) return [];
  const step = width / peaks.length;
  const barWidth = Math.max(1, step * 0.7);
  const centre = height / 2;
  return peaks.map((peak, index) => {
    const value = Math.max(0, Math.min(1, Number.isFinite(peak) ? peak : 0));
    const barHeight = value * height;
    return {
      x: index * step + (step - barWidth) / 2,
      y: centre - barHeight / 2,
      width: barWidth,
      height: barHeight,
    };
  });
}

export const MAX_WAVEFORM_CACHE = 16;

/** src → decoded peaks. One entry per source, capped to MAX_WAVEFORM_CACHE with LRU eviction. */
const waveformCache = new Map();

/** Current size of the waveform cache. */
export function getWaveformCacheSize() {
  return waveformCache.size;
}

/**
 * Decode `src` and reduce it to peaks, or `[]` when the browser cannot (no
 * AudioContext, a blocked fetch, an undecodable file): a missing wave must
 * never break the timeline that is only showing it.
 *
 * @param {string} src
 * @param {number} [buckets]
 * @returns {Promise<number[]>}
 */
export function loadWaveform(src, buckets = WAVEFORM_BUCKETS) {
  if (!src) return Promise.resolve([]);
  const key = `${src}#${buckets}`;
  const cached = waveformCache.get(key);
  if (cached) {
    waveformCache.delete(key);
    waveformCache.set(key, cached);
    return cached;
  }
  const pending = (async () => {
    const AudioContextClass =
      globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass || typeof fetch !== "function") return [];
    const context = new AudioContextClass();
    try {
      const response = await fetch(src);
      if (!response.ok) return [];
      const buffer = await context.decodeAudioData(
        await response.arrayBuffer(),
      );
      return peaksFromSamples(buffer.getChannelData(0), buckets);
    } catch {
      return [];
    } finally {
      if (context.state !== "closed") await context.close();
    }
  })().catch(() => []);
  // A failed decode is cached too: retrying it on every re-render would cost
  // more than the wave it never produces.
  if (waveformCache.has(key)) {
    waveformCache.delete(key);
  } else if (waveformCache.size >= MAX_WAVEFORM_CACHE) {
    const oldestKey = waveformCache.keys().next().value;
    if (oldestKey !== undefined) waveformCache.delete(oldestKey);
  }
  waveformCache.set(key, pending);
  return pending;
}

/** Test seam: forget every decoded source. */
export function clearWaveformCache() {
  waveformCache.clear();
}

