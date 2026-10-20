import { sourceTimeForHost } from "../../editor/instance-motion-time.js";
import {
  applyInstanceOverrides,
  setNodeAnimationTrackOverride,
} from "../../editor/instance-overrides.js";

/** Resolve the expanded master by its workflow source id, not the document's id. */
export function selectedInstanceContext(hostDoc, sourceDoc, selection) {
  if (!selection || !sourceDoc) return null;
  const instance = hostDoc?.nodes?.find(
    (node) =>
      node.id === selection.instanceId && node.kind === "canvasInstance",
  );
  if (!instance || instance.sourceCanvasId !== selection.sourceCanvasId)
    return null;
  const effectiveDoc = applyInstanceOverrides(sourceDoc, instance.instance);
  const sourceNode = effectiveDoc.nodes?.find(
    (node) => node.id === selection.nodeId,
  );
  return {
    instance,
    rawDoc: sourceDoc,
    doc: effectiveDoc,
    sourceNode: sourceNode ?? null,
  };
}

/** Source engines stay paused; host seek and play drive their exact sample time. */
export function syncInstanceSourceTime(hostEngine, sourceEngine, instance) {
  if (!sourceEngine || !instance) return null;
  if (hostEngine === sourceEngine)
    throw new TypeError("An instance source must have its own editor engine");
  const hostTime = hostEngine.getPlaybackState().time;
  const sourcePlayback = sourceEngine.getPlaybackState();
  const sourceTime = sourceTimeForHost(
    hostTime,
    sourcePlayback.duration,
    instance.instance?.playbackStart ?? 0,
  );
  sourceEngine.pause();
  if (sourcePlayback.time !== sourceTime) sourceEngine.seekToTime(sourceTime);
  return sourceTime;
}

/** Persist one source object's local property track on its placed instance. */
export function withInstanceAnimationTrackOverride(
  instanceNode,
  sourceNode,
  property,
  track,
) {
  if (instanceNode?.kind !== "canvasInstance")
    throw new TypeError("A canvas instance is required");
  return {
    ...instanceNode,
    instance: setNodeAnimationTrackOverride(
      instanceNode.instance,
      sourceNode,
      property,
      track,
    ),
  };
}
