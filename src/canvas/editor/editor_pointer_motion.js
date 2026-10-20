/** Keyframed position edits shared by pointer gesture start and move. */

import { keyframeAtTime, upsertNodeKeyframe } from "./scene-motion.js";

export function moveGestureIds(api, doc, base) {
  const baseIds = base.map((node) => node.id);
  const expanded = api.expandMoveSet?.(baseIds);
  const locked = (id) =>
    doc.nodes.find((node) => node.id === id)?.locked === true;
  const ids = expanded && !expanded.some(locked) ? expanded : baseIds;
  return ids.some(
    (id) => doc.nodes.find((node) => node.id === id)?.lockPosition === true,
  )
    ? []
    : ids;
}

export function captureMoveGestureFrame(api, doc, ids) {
  const before = api.getPlaybackState?.();
  if (before?.playing) api.pause?.();
  const playback = api.getPlaybackState?.() ?? before;
  const visibleDoc = api.getEvaluatedDocument?.() ?? doc;
  const origins = ids.flatMap((id) => {
    const node = visibleDoc.nodes.find((entry) => entry.id === id);
    return node ? [{ id, x: node.x, y: node.y }] : [];
  });
  return {
    origins,
    time: playback?.time ?? null,
    fps: playback?.fps ?? 30,
  };
}

export function positionPatchAtPlayhead(
  savedNode,
  visibleNode,
  position,
  time,
  fps,
) {
  let updated = savedNode;
  const patch = {};
  for (const property of ["x", "y"]) {
    const value = position[property];
    const track = savedNode.animations?.find(
      (entry) => entry.property === property && entry.keyframes?.length,
    );
    if (!track) {
      patch[property] = value;
      continue;
    }
    if (value === visibleNode[property]) continue;
    if (!Number.isFinite(time))
      throw new TypeError("Animated pointer moves require a playback time");
    const frame = keyframeAtTime(savedNode, property, time, fps);
    updated = upsertNodeKeyframe(updated, property, {
      time: frame?.time ?? time,
      value,
      ...(frame ? { easing: frame.easing } : {}),
    });
  }
  if (updated !== savedNode) patch.animations = updated.animations;
  return patch;
}
