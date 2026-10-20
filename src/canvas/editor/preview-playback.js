import { isGroupNode, isHiddenByGroup } from "./scene_model_groups.js";
import {
  evaluateTrack,
  isAnimatableProperty,
  normalizeTimeline,
} from "./scene-motion.js";

function hasChangingTrack(node, start, end) {
  return (node.animations ?? []).some((track) => {
    if (!isAnimatableProperty(node, track.property)) return false;
    const keyframes = (
      Array.isArray(track.keyframes) ? track.keyframes : []
    ).filter(
      (frame) =>
        Number.isFinite(frame.time) &&
        frame.time >= 0 &&
        Number.isFinite(frame.value),
    );
    if (keyframes.length < 2) return false;
    const validTrack = { ...track, keyframes };
    const initial = evaluateTrack(validTrack, start);
    return [end, ...keyframes.map((frame) => frame.time)]
      .filter((time) => time > start && time <= end)
      .some((time) => evaluateTrack(validTrack, time) !== initial);
  });
}

/** Default timelines and renderer fallbacks do not make still artwork playable. */
export function hasPreviewPlayback(doc, getMediaMetadata = () => null) {
  if (!Array.isArray(doc?.nodes)) return false;
  const duration = normalizeTimeline(doc.timeline).duration;
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  return doc.nodes.some((node) => {
    if (
      node.visible === false ||
      isGroupNode(node) ||
      isHiddenByGroup(doc, node)
    )
      return false;
    const media = getMediaMetadata(node.id);
    if ((node.kind === "video" || node.kind === "model3d") && !media?.ready)
      return false;
    let start = 0;
    let end = duration;
    let timedVisibility = false;
    const seen = new Set();
    for (
      let ancestor = node;
      ancestor && !seen.has(ancestor.id);
      ancestor = byId.get(ancestor.parentId)
    ) {
      seen.add(ancestor.id);
      start = Math.max(start, ancestor.timing?.start ?? 0);
      if (Number.isFinite(ancestor.timing?.end)) {
        end = Math.min(end, ancestor.timing.end);
        timedVisibility ||= ancestor.timing.end <= duration;
      }
    }
    if (!(end > start)) return false;
    // The evaluator hides timed artwork before start and at/after end.
    if (start > 0 || timedVisibility) return true;
    if (hasChangingTrack(node, start, end)) return true;
    if (!media?.ready) return false;
    if (node.kind === "video") {
      const sourceEnd = Math.min(
        media.duration,
        node.media?.outPoint ?? media.duration,
      );
      return sourceEnd > (node.media?.inPoint ?? 0);
    }
    return node.kind === "model3d" && media.hasAnimation === true;
  });
}

/** Inspect decoded GLTF clips, not the mere presence of a model or mixer. */
export function getModelAnimationMetadata(clips = []) {
  const playable = clips.filter(
    (clip) =>
      Number.isFinite(clip.duration) &&
      clip.duration > 0 &&
      clip.tracks?.some((track) => {
        const { times, values } = track;
        if (!times || times.length < 2 || !values?.length) return false;
        if (typeof track.createInterpolant === "function") {
          const interpolant = track.createInterpolant();
          // GLTF cubic tracks store tangent/value/tangent triples. Equal keys
          // can still move between endpoints, so inspect the actual evaluator.
          // Copy its reusable result buffer before evaluating later samples.
          const initial = Array.from(interpolant.evaluate(times[0]));
          for (let index = 1; index < times.length; index += 1) {
            const left = times[index - 1];
            const right = times[index];
            if (!(right > left)) continue;
            for (const fraction of [0.25, 0.5, 0.75, 1]) {
              const sample = interpolant.evaluate(
                left + (right - left) * fraction,
              );
              if (
                Array.from(sample).some(
                  (value, component) => value !== initial[component],
                )
              )
                return true;
            }
          }
          return false;
        }
        const stride = values.length / times.length;
        if (!Number.isInteger(stride) || stride < 1) return false;
        return Array.from(times).some(
          (time, index) =>
            index > 0 &&
            time > times[0] &&
            Array.from(values.slice(index * stride, (index + 1) * stride)).some(
              (value, component) => value !== values[component],
            ),
        );
      }),
  );
  return {
    hasAnimation: playable.length > 0,
    duration: Math.max(0, ...playable.map((clip) => clip.duration)),
  };
}
