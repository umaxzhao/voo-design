/**
 * Editing a layer's span on the timeline, the way a video editor does.
 *
 * A clip occupies [start, end) on the timeline. For a video, the source time
 * at timeline time t is `inPoint + (t - start) * speed`, so trimming the head
 * moves `inPoint` along with `timing.start`, and the picture under the
 * playhead does not slide. Every function returns a patch (or new nodes) and
 * never mutates its input.
 */
import { evaluateTrack } from "../../editor/scene-motion.js";
import { layerClipRange, videoClipRange } from "./motion-timeline-model.js";

const EPSILON = 1e-6;

const isVideo = (node) => node?.kind === "video";
/** Footage clips (sound and picture alike) follow their source, not the comp. */
const isFootage = (node) => node?.kind === "video" || node?.kind === "audio";
const speedOf = (node) => (node.media?.speed > 0 ? node.media.speed : 1);
const inPointOf = (node) => Math.max(0, node.media?.inPoint ?? 0);

/**
 * A clip with no explicit `timing.end` whose tail already reaches the
 * composition's end has no length of its own to keep: it is open-ended, so it
 * slides by giving up head while its end stays open. Only that shape may move
 * right — anything else must preserve the length its timing describes.
 */
function isOpenEnded(node, range, duration) {
  return !Number.isFinite(node?.timing?.end) && range.end >= duration;
}

/** The span a layer really occupies, and the furthest its tail can reach. */
export function clipSpan(node, duration, mediaDuration = undefined) {
  if (isFootage(node)) {
    const range = videoClipRange(node, duration, mediaDuration);
    if (!range) return { start: 0, end: 0, limit: 0, open: false };
    const sourceEnd = Math.min(
      Number.isFinite(node.media?.outPoint) ? node.media.outPoint : Infinity,
      Number.isFinite(mediaDuration) ? mediaDuration : Infinity,
    );
    const limit = Number.isFinite(sourceEnd)
      ? Math.min(
          duration,
          range.start +
            Math.max(0, sourceEnd - inPointOf(node)) / speedOf(node),
        )
      : duration;
    return { ...range, limit, open: isOpenEnded(node, range, duration) };
  }
  const range = layerClipRange(node, duration);
  return {
    ...range,
    limit: duration,
    open: isOpenEnded(node, range, duration),
  };
}

function assertInside(time, low, high, label) {
  if (!(time > low - EPSILON && time < high + EPSILON))
    throw new RangeError(`${label} must stay inside the clip`);
}

/**
 * Slide the whole clip by `delta` seconds. A clip with an end keeps its
 * length; an open-ended one (see {@link clipSpan}) is pinned to the
 * composition's end instead, so it slides by shortening and `minLength` is
 * what stops it clearing the timeline altogether.
 */
export function moveClipPatch(
  node,
  delta,
  duration,
  mediaDuration,
  minLength = 0,
) {
  const span = clipSpan(node, duration, mediaDuration);
  const length = span.end - span.start;
  const maxStart = span.open
    ? Math.max(0, duration - minLength)
    : duration - length;
  const start = Math.max(0, Math.min(maxStart, span.start + delta));
  const timing = { start };
  if (Number.isFinite(node.timing?.end)) timing.end = start + length;
  const shift = start - span.start;
  return {
    timing,
    ...(shift && node.animations?.length
      ? {
          animations: node.animations.map((track) => ({
            ...track,
            keyframes: (track.keyframes ?? []).map((frame) => ({
              ...frame,
              time: frame.time + shift,
            })),
          })),
        }
      : {}),
  };
}

/** Pull the head to `time`; a video's source in-point follows. */
export function trimStartPatch(node, time, duration, mediaDuration, minLength) {
  const span = clipSpan(node, duration, mediaDuration);
  assertInside(time, span.start, span.end - minLength, "The new start");
  const patch = { timing: { start: time } };
  if (isFootage(node)) {
    patch.media = {
      inPoint: inPointOf(node) + (time - span.start) * speedOf(node),
    };
  }
  return patch;
}

/**
 * Pull the tail to `time`. A tail at the clip's natural end drops its
 * explicit end so the clip keeps following the composition or the source.
 */
export function trimEndPatch(node, time, duration, mediaDuration, minLength) {
  const span = clipSpan(node, duration, mediaDuration);
  const end = Math.min(span.limit, Math.max(span.start + minLength, time));
  return { timing: { end: end >= span.limit - EPSILON ? null : end } };
}

/** Preserve the footage under a trimmed clip when its playback rate changes. */
export function retimeVideoClipPatch(node, speed, duration, mediaDuration) {
  if (!isVideo(node) || !(speed > 0) || !Number.isFinite(speed))
    throw new RangeError("A video clip needs a positive playback speed");
  const media = { ...node.media, speed };
  if (speed === speedOf(node)) return { media };
  if (!Number.isFinite(node.timing?.end)) return { media };

  const span = clipSpan(node, duration, mediaDuration);
  const end = span.start + ((span.end - span.start) * speedOf(node)) / speed;
  if (end > duration + EPSILON)
    throw new RangeError("The retimed clip exceeds the composition duration");
  return { media, timing: { ...node.timing, end } };
}

/** Cut the clip in two at `time`. */
export function splitClip(node, time, duration, mediaDuration, minLength, id) {
  const span = clipSpan(node, duration, mediaDuration);
  if (!(time > span.start + minLength && time < span.end - minLength))
    throw new RangeError("Move the playhead inside the clip to split it");
  // Fades are composed against the UNCUT clip's edges, so a verbatim copy
  // would re-fade both pieces at the cut: the tail part dips to silence at
  // the playhead (the original fadeIn), the head half spends its whole (now
  // shorter) length ramping toward an end that no longer exists. The head
  // keeps its start ramp; the tail keeps its end ramp.
  const media = { ...node.media };
  delete media.fadeIn;
  delete media.fadeOut;
  const splitAnimations = (node.animations ?? []).map((track) => {
    const cutValue = evaluateTrack(track, time);
    if (cutValue === null) return { first: track, second: track };
    const existingCut = track.keyframes.find((frame) => frame.time === time);
    const outgoing = track.keyframes
      .filter((frame) => frame.time < time)
      .sort((left, right) => left.time - right.time)
      .at(-1)?.easing;
    // A hold segment must remain held after the cut.
    const cut = existingCut ?? {
      time,
      value: cutValue,
      easing: outgoing ?? "linear",
    };
    return {
      first: {
        ...track,
        keyframes: [
          ...track.keyframes.filter((frame) => frame.time < time),
          cut,
        ],
      },
      second: {
        ...track,
        keyframes: [
          cut,
          ...track.keyframes.filter((frame) => frame.time > time),
        ],
      },
    };
  });
  const first = {
    ...node,
    timing: { ...node.timing, end: time },
    ...(node.animations
      ? { animations: splitAnimations.map((part) => part.first) }
      : {}),
    ...(isFootage(node)
      ? { media: { ...media, fadeIn: node.media?.fadeIn ?? 0, fadeOut: 0 } }
      : {}),
  };
  const second = {
    ...node,
    id,
    timing: { ...node.timing, start: time, end: node.timing?.end ?? null },
    ...(node.animations
      ? { animations: splitAnimations.map((part) => part.second) }
      : {}),
    ...(isFootage(node)
      ? {
          media: {
            ...media,
            inPoint: inPointOf(node) + (time - span.start) * speedOf(node),
            fadeIn: 0,
            fadeOut: node.media?.fadeOut ?? 0,
          },
        }
      : {}),
  };
  return { first, second };
}
