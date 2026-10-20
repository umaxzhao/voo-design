/** One host clock drives every live canvas instance and its editable source. */
export function sourceTimeForHost(hostTime, sourceDuration, playbackStart = 0) {
  if (!Number.isFinite(hostTime) || hostTime < 0)
    throw new RangeError("Host time must be finite and non-negative");
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0)
    throw new RangeError("Source duration must be finite and positive");
  if (!Number.isFinite(playbackStart) || playbackStart < 0)
    throw new RangeError("Playback start must be finite and non-negative");
  return (hostTime + playbackStart) % sourceDuration;
}

const MAX_FRAME_OCCURRENCES = 128;

/** Project a source keyframe onto the host ruler's half-open visible interval. */
export function hostTimesForSourceFrame(
  frameTime,
  hostDuration,
  sourceDuration,
  playbackStart = 0,
) {
  if (!Number.isFinite(frameTime) || frameTime < 0) return [];
  if (!Number.isFinite(hostDuration) || hostDuration <= 0) return [];
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return [];
  if (!Number.isFinite(playbackStart) || playbackStart < 0) return [];
  // The source clock is half-open: the terminal frame samples as frame zero.
  if (frameTime >= sourceDuration) return [];
  const first = frameTime - playbackStart;
  const startLoop = Math.ceil(-first / sourceDuration);
  // The host clip ends at hostDuration; a marker exactly there is not visible.
  const endLoop = Math.ceil((hostDuration - first) / sourceDuration) - 1;
  if (endLoop < startLoop) return [];
  const count = endLoop - startLoop + 1;
  const stride = Math.max(1, Math.ceil(count / MAX_FRAME_OCCURRENCES));
  const times = [];
  for (let loop = startLoop; loop <= endLoop; loop += stride)
    times.push(first + loop * sourceDuration);
  const last = first + endLoop * sourceDuration;
  if (times.at(-1) !== last) times.push(last);
  return times;
}
