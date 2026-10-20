import { sourceTimeForHost } from "../../editor/instance-motion-time.js";
import { applyInstanceOverrides } from "../../editor/instance-overrides.js";
import {
  evaluateSceneAtTime,
  normalizeTimeline,
  removeNodeKeyframe,
  upsertNodeKeyframe,
} from "../../editor/scene-motion.js";
import { snapMotionTime } from "./motion-timeline-model.js";
import { keyframeAtTime, numericPropertyValue } from "./motion_properties.js";
import { withInstanceAnimationTrackOverride } from "./motion-instance-controller.js";

export function sourceDocumentForIdentity(
  hostDoc,
  sourceDoc,
  instanceSources,
  identity,
) {
  if (!identity?.instanceId) return hostDoc;
  const instance = hostDoc.nodes?.find(
    (node) =>
      node.id === identity.instanceId &&
      node.kind === "canvasInstance" &&
      node.sourceCanvasId === identity.sourceCanvasId,
  );
  const entry = instanceSources.find(
    (item) =>
      item.instanceId === identity.instanceId &&
      item.sourceCanvasId === identity.sourceCanvasId,
  );
  const rawDoc = entry?.doc ?? sourceDoc;
  return instance && rawDoc
    ? applyInstanceOverrides(rawDoc, instance.instance)
    : null;
}

export function localSourceState(engine, source, property, hostTime) {
  if (!source?.instance || !source.rawDoc) return null;
  const instance = engine
    .getDocument()
    .nodes.find(
      (node) =>
        node.id === source.instance.id &&
        node.kind === "canvasInstance" &&
        node.sourceCanvasId === source.instance.sourceCanvasId,
    );
  if (!instance) return null;
  const doc = applyInstanceOverrides(source.rawDoc, instance.instance);
  const { duration, fps } = normalizeTimeline(doc.timeline);
  const sourceTime = sourceTimeForHost(
    hostTime,
    duration,
    instance.instance?.playbackStart ?? 0,
  );
  const time = snapMotionTime(sourceTime, duration, fps);
  const node = doc.nodes.find((item) => item.id === source.sourceNode.id);
  if (!node) return null;
  const evaluated = evaluateSceneAtTime(doc, time).nodes.find(
    (item) => item.id === node.id,
  );
  return {
    instance,
    doc,
    node,
    evaluated,
    time,
    keyframe: keyframeAtTime(node, property, time, fps),
    track: node.animations?.find((item) => item.property === property) ?? null,
    value: numericPropertyValue(evaluated, property),
    fps,
  };
}

export function updateLocalSourceTrack(
  engine,
  source,
  property,
  hostTime,
  update,
) {
  engine.pause();
  const state = localSourceState(engine, source, property, hostTime);
  if (!state) return null;
  const nextNode = update(state.node, state);
  const track =
    nextNode.animations?.find((item) => item.property === property) ?? null;
  const instance = withInstanceAnimationTrackOverride(
    state.instance,
    state.node,
    property,
    track,
  );
  engine.updateNode(state.instance.id, { instance: instance.instance });
  return { ...state, node: nextNode, track };
}

export function toggleLocalSourceKeyframe(engine, source, property) {
  engine.pause();
  const currentHostTime = engine.getPlaybackState().time;
  const state = localSourceState(engine, source, property, currentHostTime);
  if (!state) return null;
  const next = state.keyframe
    ? removeNodeKeyframe(state.node, property, state.keyframe.time)
    : state.value === null
      ? null
      : upsertNodeKeyframe(state.node, property, {
          time: state.time,
          value: state.value,
        });
  if (!next) throw new TypeError(`Non-numeric motion property: ${property}`);
  updateLocalSourceTrack(engine, source, property, currentHostTime, () => next);
  return state.keyframe ? null : { time: state.time };
}

export function setLocalSourceKeyframeValue(engine, source, property, value) {
  engine.pause();
  const currentHostTime = engine.getPlaybackState().time;
  const state = localSourceState(engine, source, property, currentHostTime);
  if (!state) return null;
  const next = upsertNodeKeyframe(state.node, property, {
    time: state.keyframe?.time ?? state.time,
    value,
    ...(state.keyframe ? { easing: state.keyframe.easing } : {}),
  });
  updateLocalSourceTrack(engine, source, property, currentHostTime, () => next);
  return { time: state.keyframe?.time ?? state.time };
}
