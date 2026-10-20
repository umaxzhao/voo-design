import { evaluateLinearArrayModifiers } from "./scene-linear-array.js";
import {
  markEvaluatedFrame,
  getCanonicalSource,
} from "./scene-evaluated-frame.js";

const BASE_PROPERTIES = new Set([
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
]);
const MODEL_PROPERTIES = new Set([
  "model.rotation.x",
  "model.rotation.y",
  "model.rotation.z",
  "model.scale",
  "model.exposure",
  "model.metalness",
  "model.roughness",
  "model.camera.azimuth",
  "model.camera.elevation",
  "model.camera.distance",
  "model.camera.fov",
]);
const SPATIAL_PROPERTIES = new Set([
  "spatial.z",
  "spatial.rotationX",
  "spatial.rotationY",
]);
const MODIFIER_PROPERTIES = new Set([
  "modifier.step.x",
  "modifier.step.y",
  "modifier.step.z",
  "modifier.radius",
  "modifier.startAngle",
]);

/**
 * The animated properties a MODIFIER KIND actually owns.
 *
 * Kind-aware rather than one merged allowlist. A linear array spaces with `step.x/y/z`; a circular array has
 * no step and places its ring with `radius` and `startAngle`. Merging them would let a caller animate a
 * property the kind does not have. `count` and `arcSpan` are absent from BOTH lists on purpose: they stay
 * static, which is why an unsupported track is rejected rather than ignored.
 *
 * @param {object} modifier
 * @returns {string[]}
 */
export function allowedModifierProperties(modifier) {
  if (modifier?.type === "circularArray") return ["radius", "startAngle"];
  return ["step.x", "step.y", "step.z"];
}
const MESH_PROPERTIES = new Set([
  "geometry.depth",
  "material.metalness",
  "material.roughness",
]);
const EASINGS = new Set([
  "linear",
  "hold",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);

/** CSS cubic-bezier control points; bounded handles keep edits predictable. */
export function parseCubicBezier(value) {
  if (typeof value !== "string") return null;
  const match = /^cubic-bezier\((.*)\)$/.exec(value.trim());
  if (!match) return null;
  const parts = match[1].split(",").map((part) => part.trim());
  if (
    parts.length !== 4 ||
    !parts.every((part) =>
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(part),
    )
  )
    return null;
  const points = parts.map(Number);
  if (
    !points.every(Number.isFinite) ||
    points[0] < 0 ||
    points[0] > 1 ||
    points[2] < 0 ||
    points[2] > 1 ||
    Math.abs(points[1]) > 2 ||
    Math.abs(points[3]) > 2
  )
    return null;
  return points;
}

function normalizeEasing(value) {
  if (EASINGS.has(value)) return value;
  const points = parseCubicBezier(value);
  if (points) return `cubic-bezier(${points.join(",")})`;
  if (typeof value === "string" && value.startsWith("cubic-bezier"))
    throw new TypeError("Invalid cubic-bezier easing");
  return "linear";
}

export function normalizeTimeline(timeline) {
  return {
    duration:
      Number.isFinite(timeline?.duration) && timeline.duration > 0
        ? timeline.duration
        : 5,
    fps: Number.isFinite(timeline?.fps) && timeline.fps > 0 ? timeline.fps : 30,
    // Only present when on, so a plain timeline keeps its two-field shape.
    ...(timeline?.loop === true ? { loop: true } : {}),
  };
}

/**
 * The document a timeline edit writes: the normalized timeline plus every
 * keyframe the new composition can no longer reach, moved onto its end.
 *
 * A frame past `duration` is a trap rather than data. The ruler stops short
 * of it, its diamond draws clamped to the lane's right edge as though it sat
 * at the very end, and the playhead can never travel to its stored time — so
 * it reads as a frame at the end while holding a value from outside the
 * composition. A shorter composition carries those frames to the end instead
 * of stranding them, and keeps the last of any that land on one another.
 *
 * @param {object} doc
 * @param {object} patch `{ duration?, fps?, loop? }`, the shape `setTimeline` takes
 * @returns {object} a new document
 */
export function applyTimelinePatch(doc, patch = {}) {
  const timeline = normalizeTimeline({ ...doc?.timeline, ...patch });
  const nodes = (doc?.nodes ?? []).map((node) =>
    clampKeyframesToDuration(node, timeline.duration),
  );
  return { ...doc, timeline, nodes };
}

/** One layer's tracks with every frame past `duration` pulled onto it. */
function clampKeyframesToDuration(node, duration) {
  if (!node?.animations?.length) return node;
  let stranded = false;
  const animations = node.animations.map((track) => {
    const keyframes = track.keyframes ?? [];
    if (!keyframes.some((frame) => frame.time > duration)) return track;
    stranded = true;
    return { ...track, keyframes: collapseOnto(keyframes, duration) };
  });
  return stranded ? { ...node, animations } : node;
}

/** Frames sharing a time collapse onto the last one that claimed it. */
function collapseOnto(keyframes, time) {
  const collapsed = [...keyframes]
    .sort((left, right) => left.time - right.time)
    .map((frame) => (frame.time > time ? { ...frame, time } : frame));
  const seen = new Set();
  const kept = [];
  for (let index = collapsed.length - 1; index >= 0; index -= 1) {
    const frame = collapsed[index];
    if (seen.has(frame.time)) continue;
    seen.add(frame.time);
    kept.unshift(frame);
  }
  return kept;
}

export function isAnimatableProperty(node, property) {
  return (
    BASE_PROPERTIES.has(property) ||
    SPATIAL_PROPERTIES.has(property) ||
    MODIFIER_PROPERTIES.has(property) ||
    (node?.kind === "model3d" && MODEL_PROPERTIES.has(property)) ||
    (node?.kind === "mesh3d" && MESH_PROPERTIES.has(property))
  );
}

function normalizeKeyframe(frame) {
  if (
    !Number.isFinite(frame?.time) ||
    frame.time < 0 ||
    !Number.isFinite(frame.value)
  ) {
    throw new TypeError(
      "Keyframes require finite non-negative time and numeric value",
    );
  }
  return {
    time: frame.time,
    value: frame.value,
    easing: normalizeEasing(frame.easing),
  };
}

export function upsertNodeKeyframe(node, property, frame) {
  if (!isAnimatableProperty(node, property))
    throw new TypeError(`Unsupported animated property: ${property}`);
  const nextFrame = normalizeKeyframe(frame);
  const animations = Array.isArray(node.animations) ? node.animations : [];
  const previous = animations.find((track) => track.property === property);
  const keyframes = [
    ...(previous?.keyframes ?? []).filter(
      (item) => item.time !== nextFrame.time,
    ),
    nextFrame,
  ].sort((a, b) => a.time - b.time);
  return {
    ...node,
    animations: [
      ...animations.filter((track) => track.property !== property),
      { property, keyframes },
    ],
  };
}

export function removeNodeKeyframe(node, property, time) {
  if (!isAnimatableProperty(node, property))
    throw new TypeError(`Unsupported animated property: ${property}`);
  if (!Number.isFinite(time))
    throw new TypeError("Keyframe time must be finite");
  const animations = (node.animations ?? []).flatMap((track) => {
    if (track.property !== property) return [track];
    const keyframes = track.keyframes.filter((frame) => frame.time !== time);
    return keyframes.length ? [{ ...track, keyframes }] : [];
  });
  return { ...node, animations };
}

/** Move a stored frame atomically, preserving its value and outgoing easing. */
export function moveNodeKeyframe(node, property, fromTime, toTime) {
  if (!isAnimatableProperty(node, property))
    throw new TypeError(`Unsupported animated property: ${property}`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime < 0)
    throw new TypeError("Keyframe times must be finite and non-negative");
  const frame = node.animations
    ?.find((track) => track.property === property)
    ?.keyframes.find((entry) => entry.time === fromTime);
  if (!frame) throw new TypeError("Keyframe not found");
  if (fromTime === toTime) return node;
  return upsertNodeKeyframe(
    removeNodeKeyframe(node, property, fromTime),
    property,
    {
      ...frame,
      time: toTime,
    },
  );
}

/** A playhead within half a frame edits the stored frame, not a near-duplicate. */
export function keyframeAtTime(node, property, time, fps) {
  const tolerance = 0.5 / Math.max(1, fps);
  return (
    node?.animations
      ?.find((entry) => entry.property === property)
      ?.keyframes?.find((frame) => Math.abs(frame.time - time) <= tolerance) ??
    null
  );
}

/** Invert the monotone x curve, then sample y at that parameter. */
export function cubicBezierProgress(progress, points) {
  const sample = (time, first, second) => {
    const inverse = 1 - time;
    return (
      3 * inverse * inverse * time * first +
      3 * inverse * time * time * second +
      time * time * time
    );
  };
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const middle = (low + high) / 2;
    if (sample(middle, points[0], points[2]) < progress) low = middle;
    else high = middle;
  }
  return sample((low + high) / 2, points[1], points[3]);
}

export function easingProgress(progress, easing) {
  if (easing === "hold") return 0;
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return 1 - (1 - progress) ** 2;
  if (easing === "ease-in-out")
    return progress < 0.5
      ? 2 * progress * progress
      : 1 - (-2 * progress + 2) ** 2 / 2;
  const points = parseCubicBezier(easing);
  if (points) return cubicBezierProgress(progress, points);
  if (typeof easing === "string" && easing.startsWith("cubic-bezier"))
    throw new TypeError("Invalid cubic-bezier easing");
  return progress;
}

export function evaluateTrack(track, time) {
  const frames =
    track?.keyframes
      ?.filter(
        (frame) => Number.isFinite(frame.time) && Number.isFinite(frame.value),
      )
      .sort((a, b) => a.time - b.time) ?? [];
  if (!frames.length) return null;
  if (time <= frames[0].time) return frames[0].value;
  for (let index = 1; index < frames.length; index += 1) {
    const left = frames[index - 1];
    const right = frames[index];
    if (time > right.time) continue;
    if (time === right.time) return right.value;
    const span = right.time - left.time;
    if (span <= 0) return right.value;
    const progress = easingProgress((time - left.time) / span, left.easing);
    return left.value + (right.value - left.value) * progress;
  }
  return frames.at(-1).value;
}

function setNestedNumber(node, path, value) {
  const parts = path.split(".");
  if (parts.length === 1) return { ...node, [path]: value };
  const copy = { ...node };
  let target = copy;
  let source = node;
  for (const part of parts.slice(0, -1)) {
    target[part] = { ...(source?.[part] ?? {}) };
    target = target[part];
    source = source?.[part];
  }
  target[parts.at(-1)] = value;
  return copy;
}

export function upsertModifierKeyframe(modifier, property, frame) {
  const allowedProperties = new Set(allowedModifierProperties(modifier));
  if (!allowedProperties.has(property)) {
    throw new TypeError(
      `Unsupported animated modifier property: ${property}. Counts remain static.`,
    );
  }
  const nextFrame = normalizeKeyframe(frame);
  const animations = Array.isArray(modifier.animations)
    ? modifier.animations
    : [];
  const previous = animations.find((track) => track.property === property);
  const keyframes = [
    ...(previous?.keyframes ?? []).filter(
      (item) => item.time !== nextFrame.time,
    ),
    nextFrame,
  ].sort((a, b) => a.time - b.time);
  return {
    ...modifier,
    animations: [
      ...animations.filter((track) => track.property !== property),
      { property, keyframes },
    ],
  };
}

export function removeModifierKeyframe(modifier, property, time) {
  const allowedProperties = new Set(allowedModifierProperties(modifier));
  if (!allowedProperties.has(property)) {
    throw new TypeError(
      `Unsupported animated modifier property: ${property}. Counts remain static.`,
    );
  }
  if (!Number.isFinite(time)) {
    throw new TypeError("Keyframe time must be finite");
  }
  const animations = (modifier.animations ?? []).flatMap((track) => {
    if (track.property !== property) return [track];
    const keyframes = track.keyframes.filter((frame) => frame.time !== time);
    return keyframes.length ? [{ ...track, keyframes }] : [];
  });
  return { ...modifier, animations };
}

export function keyframeAtTimeForModifier(modifier, property, time, fps) {
  const tolerance = 0.5 / Math.max(1, fps);
  return (
    modifier?.animations
      ?.find((entry) => entry.property === property)
      ?.keyframes?.find((frame) => Math.abs(frame.time - time) <= tolerance) ??
    null
  );
}

/** Evaluate a composition second without writing into the saved scene. */
export function evaluateSceneAtTime(doc, time) {
  if (!doc || !Array.isArray(doc.nodes))
    throw new TypeError("A scene document is required");
  if (!Number.isFinite(time))
    throw new TypeError("Composition time must be finite");

  // If doc is an already evaluated frame, evaluate from its underlying canonical document
  // so repeated calls (e.g. evaluateSceneAtTime(evaluateSceneAtTime(doc, t1), t2))
  // evaluate cleanly at t2 without stacking motion or double-expanding modifiers.
  const canonicalDoc = getCanonicalSource(doc) || doc;
  const targetDoc = canonicalDoc;

  const bounded = Math.min(
    normalizeTimeline(targetDoc.timeline).duration,
    Math.max(0, time),
  );
  let changed = false;
  const nodes = targetDoc.nodes.map((node) => {
    let result = node;
    const inferredVideoEnd =
      node.kind === "video" && Number.isFinite(node.media?.outPoint)
        ? (node.timing?.start ?? 0) +
          Math.max(0, node.media.outPoint - (node.media.inPoint ?? 0)) /
            (node.media.speed ?? 1)
        : null;
    const end = Number.isFinite(node.timing?.end)
      ? node.timing.end
      : inferredVideoEnd;
    if (
      node.timing &&
      (bounded < (node.timing.start ?? 0) ||
        (Number.isFinite(end) && bounded >= end))
    ) {
      result = { ...result, visible: false };
    }
    for (const track of node.animations ?? []) {
      if (!isAnimatableProperty(node, track.property)) continue;
      const value = evaluateTrack(track, bounded);
      if (value === null) continue;
      result = setNestedNumber(result, track.property, value);
    }
    if (result !== node) changed = true;
    return result;
  });

  // Evaluate modifier animation tracks at bounded time before expanding instances.
  // Modifiers evaluate spacing (step.x, step.y, step.z) non-destructively for this frame.
  let evaluatedModifiers = targetDoc.modifiers;
  if (Array.isArray(targetDoc.modifiers) && targetDoc.modifiers.length > 0) {
    evaluatedModifiers = targetDoc.modifiers.map((mod) => {
      if (!Array.isArray(mod.animations) || mod.animations.length === 0) {
        return mod;
      }
      let modEvaluated = mod;
      for (const track of mod.animations) {
        if (!allowedModifierProperties(mod).includes(track.property)) {
          continue;
        }
        const val = evaluateTrack(track, bounded);
        if (val === null || !Number.isFinite(val)) continue;
        if (mod.type === "circularArray") {
          // radius / startAngle are FLAT circular fields. The canonical source and every STATIC field
          // stay untouched: this writes an evaluated copy for THIS frame only, so nothing destructive is
          // stamped back onto the document and count/arcSpan are never animated.
          modEvaluated = { ...modEvaluated, [track.property]: val };
        } else {
          const axis = track.property.slice("step.".length);
          modEvaluated = {
            ...modEvaluated,
            step: {
              ...modEvaluated.step,
              [axis]: val,
            },
          };
        }
        changed = true;
      }
      return modEvaluated;
    });
  }

  const withModifiers =
    evaluatedModifiers !== undefined
      ? evaluateLinearArrayModifiers(nodes, evaluatedModifiers)
      : nodes;
  if (withModifiers !== nodes) changed = true;

  const hasModifiers =
    targetDoc.modifiers !== undefined && targetDoc.modifiers.length > 0;
  if (!changed && !hasModifiers && targetDoc === doc) {
    return doc;
  }

  const frameDoc = {
    ...targetDoc,
    nodes: withModifiers,
    ...(evaluatedModifiers !== undefined
      ? { modifiers: evaluatedModifiers }
      : {}),
  };
  frameDoc.isEvaluatedFrame = true;
  return markEvaluatedFrame(frameDoc, targetDoc);
}
