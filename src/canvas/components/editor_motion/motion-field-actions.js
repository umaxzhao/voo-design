import { keyframeAtTime, numericPropertyValue } from "./motion_properties.js";
import { snapMotionTime } from "./motion-timeline-model.js";

export function animatedTrack(node, property) {
  return (
    node?.animations?.find(
      (track) => track.property === property && track.keyframes?.length,
    ) ?? null
  );
}

/** Always read live engine state: a second edit can precede React's render. */
export function motionFieldState(engine, nodeId, property, sampleTime = null) {
  const playback = engine.getPlaybackState();
  const time = sampleTime ?? playback.time ?? 0;
  const fps = playback.fps ?? 30;
  const node = engine.getDocument().nodes.find((entry) => entry.id === nodeId);
  const evaluated = engine
    .getEvaluatedDocument(time)
    .nodes.find((entry) => entry.id === nodeId);
  return {
    node,
    evaluated,
    time,
    track: animatedTrack(node, property),
    keyframe: keyframeAtTime(node, property, time, fps),
    value: numericPropertyValue(evaluated, property),
  };
}

export function editMotionField(engine, nodeId, property, value) {
  const state = motionFieldState(engine, nodeId, property);
  if (!state.track) return false;
  engine.pause();
  // Omitting easing for a new frame uses the engine default; editing an
  // existing frame must retain its outgoing interpolation.
  engine.upsertKeyframe(
    nodeId,
    property,
    {
      time: state.keyframe?.time ?? state.time,
      value,
      ...(state.keyframe ? { easing: state.keyframe.easing } : {}),
    },
    { commit: false },
  );
  return true;
}

export function toggleMotionField(engine, nodeId, property) {
  const state = motionFieldState(engine, nodeId, property);
  engine.pause();
  if (state.keyframe) {
    engine.removeKeyframe(nodeId, property, state.keyframe.time);
  } else {
    if (state.value === null)
      throw new TypeError(`Non-numeric motion property: ${property}`);
    engine.upsertKeyframe(nodeId, property, {
      time: state.time,
      value: state.value,
    });
  }
}

/** Read the playhead at action time; external seeks can precede React's next render. */
function currentTimelineField(engine, nodeId, property) {
  engine.pause();
  const { time, duration, fps } = engine.getPlaybackState();
  engine.seekToTime(snapMotionTime(time, duration, fps));
  return motionFieldState(engine, nodeId, property);
}

export function toggleTimelineKeyframe(engine, nodeId, property) {
  const state = currentTimelineField(engine, nodeId, property);
  toggleMotionField(engine, nodeId, property);
  return state.keyframe ? null : { nodeId, property, time: state.time };
}

export function setTimelineKeyframeValue(engine, nodeId, property, value) {
  const state = currentTimelineField(engine, nodeId, property);
  const frameTime = state.keyframe?.time ?? state.time;
  engine.upsertKeyframe(nodeId, property, {
    time: frameTime,
    value,
    ...(state.keyframe ? { easing: state.keyframe.easing } : {}),
  });
  return { nodeId, property, time: frameTime };
}
