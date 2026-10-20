import { propertiesForNode } from "./motion_properties.js";

export function snapMotionTime(time, duration, fps) {
  return Math.max(0, Math.min(duration, Math.round(time * fps) / fps));
}

export function pointerMotionTime(clientX, rect, duration, fps) {
  if (rect.width <= 0) return 0;
  return snapMotionTime(
    ((clientX - rect.left) / rect.width) * duration,
    duration,
    fps,
  );
}

export function motionRows(doc) {
  return (doc?.nodes ?? []).flatMap((node) => {
    const labels = new Map(propertiesForNode(node));
    const tracks = (node.animations ?? []).filter(
      (track) => labels.has(track.property) && track.keyframes?.length,
    );
    // A Motion canvas is a composition: every visual layer owns a clip span,
    // including still images, text, shapes, 3D objects, and canvas instances.
    return tracks.length ||
      node.kind === "video" ||
      node.kind === "audio" ||
      doc?.canvasType === "motion"
      ? [
          {
            node,
            tracks: tracks.map((track) => ({
              ...track,
              label: labels.get(track.property),
            })),
          },
        ]
      : [];
  });
}

/** Keep timeline labels aligned with the layer list's kind-specific fallback. */
export function motionRowLabel(node, t) {
  const name = typeof node?.name === "string" ? node.name.trim() : "";
  if (name) return name;
  if (node?.kind === "mesh3d") return t("editor.three.object");
  return t("editor.motion.unnamedObject");
}

/** A source row is identified by both its instance and source node IDs. */
export function motionRowKey(row) {
  if (row.scope !== "source") return JSON.stringify(["host", row.node.id]);
  return JSON.stringify([
    "source",
    row.identity?.instanceId ?? row.instanceId,
    row.identity?.sourceCanvasId ?? row.sourceCanvasId,
    row.identity?.nodeId ?? row.node.id,
  ]);
}

/** Match the scene clock while keeping an untrimmed video within the composition. */
export function videoClipRange(node, duration, mediaDuration) {
  // Footage, sound included: the span is the source's, not the composition's.
  const footage = node?.kind === "video" || node?.kind === "audio";
  if (!footage || !(duration > 0)) return null;
  const start = Math.max(0, node.timing?.start ?? 0);
  const inPoint = Math.max(0, node.media?.inPoint ?? 0);
  const speed = node.media?.speed > 0 ? node.media.speed : 1;
  const sourceEnd = Math.min(
    Number.isFinite(node.media?.outPoint) ? node.media.outPoint : Infinity,
    Number.isFinite(mediaDuration) ? mediaDuration : Infinity,
  );
  const end = Math.min(
    duration,
    Number.isFinite(node.timing?.end) ? node.timing.end : Infinity,
    Number.isFinite(sourceEnd)
      ? start + Math.max(0, sourceEnd - inPoint) / speed
      : Infinity,
  );
  return end > start ? { start, end } : null;
}

/** A thumbnail samples the middle of its visible slice, not a keyframe. */
export function videoFilmstripTimes(node, clip, count) {
  if (!clip || !Number.isInteger(count) || count < 1) return [];
  const inPoint = Math.max(0, node.media?.inPoint ?? 0);
  const speed = node.media?.speed > 0 ? node.media.speed : 1;
  const start = node.timing?.start ?? 0;
  return Array.from({ length: count }, (_, index) => {
    const compositionTime =
      clip.start + ((index + 0.5) / count) * (clip.end - clip.start);
    return inPoint + Math.max(0, compositionTime - start) * speed;
  });
}

export function selectedMotionFrame(doc, selected) {
  if (!selected) return null;
  return (
    doc?.nodes
      .find((node) => node.id === selected.nodeId)
      ?.animations?.find((track) => track.property === selected.property)
      ?.keyframes?.find((frame) => frame.time === selected.time) ?? null
  );
}

export function motionRulerTicks(duration) {
  const targetStep = duration / 8;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(targetStep, 0.001)));
  const step = [1, 2, 5, 10]
    .map((value) => value * magnitude)
    .find((value) => value >= targetStep);
  const ticks = [];
  for (let time = 0; time <= duration; time += step)
    ticks.push(Number(time.toFixed(4)));
  return ticks;
}

/**
 * Which action a plain key asks the timeline for.
 *
 * `use_editor_shortcuts` hands these keys over by name while the event target
 * is inside the timeline, so everything this returns the timeline must also
 * *do* — a key claimed here and left unhandled would be dead, and a key
 * ignored here never reaches the canvas either.
 *
 * @param {object} event
 * @param {boolean|object} selection `true` for the legacy "a keyframe is
 *   selected", or `{ frame, node, stale }`: `frame` a keyframe that still
 *   exists, `node` a selected layer, `stale` a keyframe selection whose frame
 *   has since vanished (an undo) — that one is consumed but never acted on,
 *   so Delete cannot fall through to the layer underneath it.
 * @returns {string|null}
 */
export function timelineShortcut(event, selection = false) {
  if (
    event.target?.closest?.("input, select, textarea, [contenteditable='true']")
  )
    return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.code === "Space" || event.key === " ") return "play";

  const pick =
    typeof selection === "boolean"
      ? { frame: selection, node: false, stale: false }
      : {
          frame: Boolean(selection?.frame),
          node: Boolean(selection?.node),
          stale: Boolean(selection?.stale),
        };
  const destructive = ["Delete", "Backspace"].includes(event.key);
  if (pick.stale && (destructive || event.key === "Escape")) return "swallow";
  if (destructive) {
    if (pick.frame) return "delete";
    if (pick.node) return "deleteLayer";
    return null;
  }
  if (event.key === "Escape") {
    if (pick.frame) return "deselect";
    if (pick.node) return "deselectLayer";
    return null;
  }
  if (event.key.toLowerCase() === "s" && (pick.frame || pick.node))
    return "split";
  if (event.key === "ArrowLeft") return "seekBack";
  if (event.key === "ArrowRight") return "seekFwd";
  if (event.key === "Home") return "seekStart";
  if (event.key === "End") return "seekEnd";
  return null;
}

export const MIN_TIMELINE_ZOOM = 1;
export const MAX_TIMELINE_ZOOM = 8;
/** The composition's own bounds, shared by every field that writes them. */
export const MAX_TIMELINE_DURATION = 86400;
export const MAX_TIMELINE_FPS = 120;
const MIN_CLIP_LENGTH_FRAMES = 1;

/**
 * The value a timeline field may commit, or `null` when the input is outside
 * what the composition can take.
 *
 * The transport row's duration field already refused out-of-range numbers
 * through `MotionNumber`; the inspector's raw `<input type="number">` did
 * not, so one document could hold a duration or an fps that neither control
 * would ever offer again.
 *
 * @param {string} key `"duration"` or `"fps"`
 * @param {string|number} raw the field's text
 * @param {{fps?: number}} context the current fps, which sets the shortest
 *   duration there is — one frame
 * @returns {number|null}
 */
export function timelineFieldValue(key, raw, { fps = 30 } = {}) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (key === "fps")
    return value >= 1 && value <= MAX_TIMELINE_FPS ? value : null;
  if (key === "duration") {
    const min = 1 / Math.max(1, fps);
    return value >= min && value <= MAX_TIMELINE_DURATION ? value : null;
  }
  return null;
}

export function clampTimelineZoom(zoom) {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return MIN_TIMELINE_ZOOM;
  return Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, value));
}

/** mm:ss.ff timecode, the way a video editor reads a playhead. */
export function formatTimecode(time, fps) {
  const safeFps = Math.max(1, Math.round(fps) || 1);
  const totalFrames = Math.max(0, Math.round(time * safeFps));
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(minutes)}:${pad(seconds)}.${pad(frames)}`;
}

/** The visible span of a layer on the timeline; untimed layers fill it. */
export function layerClipRange(node, duration) {
  const start = Math.max(0, node?.timing?.start ?? 0);
  const end = Number.isFinite(node?.timing?.end)
    ? Math.min(duration, node.timing.end)
    : duration;
  return { start: Math.min(start, duration), end: Math.max(end, start) };
}

/** Every distinct keyframe time on a layer, for its collapsed summary lane. */
export function layerKeyframeTimes(node) {
  const times = new Set();
  for (const track of node?.animations ?? [])
    for (const frame of track.keyframes ?? []) times.add(frame.time);
  return [...times].sort((a, b) => a - b);
}

/**
 * Move a preset's tracks from composition time onto the layer's own clip.
 *
 * Presets are authored against the composition — the ramp starts at 0 and its
 * tail lands on `duration`. A layer that does not span the composition would
 * run that ramp while `evaluateSceneAtTime` still has it hidden: a fade-in on
 * a clip starting at 2s plays out before the layer appears, and a fade-out
 * keyed to the composition's end lands past a tail that was trimmed earlier.
 *
 * Remapping `[0, duration]` onto the clip's span puts the ramp where the layer
 * can be seen, and is a no-op for the layer that fills the composition.
 *
 * @param {object} node the layer the tracks are about to be written onto
 * @param {Array} animations tracks keyed in composition time
 * @param {number} duration the composition length the preset assumed
 * @returns {Array} the same array when nothing needs moving
 */
export function reanchorAnimationsToClip(node, animations, duration) {
  if (!(duration > 0) || !Array.isArray(animations)) return animations;
  const clip = layerClipRange(node, duration);
  const span = clip.end - clip.start;
  if (span <= 0 || (clip.start === 0 && clip.end >= duration)) return animations;
  return animations.map((track) => ({
    ...track,
    keyframes: (track.keyframes ?? []).map((frame) => ({
      ...frame,
      time:
        clip.start +
        (Math.max(0, Math.min(duration, frame.time)) / duration) * span,
    })),
  }));
}

/**
 * Move or trim a clip. `edge` is "start", "end" or "move"; the result stays
 * inside the composition, keeps at least one frame, and snaps to frames.
 * `end` is only written when the layer is not open-ended, so a layer that
 * still runs to the end of the composition keeps following its duration.
 */
export function dragClipTiming(range, edge, delta, duration, fps) {
  const minLength = MIN_CLIP_LENGTH_FRAMES / fps;
  const snap = (time) => snapMotionTime(time, duration, fps);
  if (edge === "start") {
    return {
      start: snap(Math.min(range.start + delta, range.end - minLength)),
      end: range.end,
    };
  }
  if (edge === "end") {
    return {
      start: range.start,
      end: snap(Math.max(range.end + delta, range.start + minLength)),
    };
  }
  const length = range.end - range.start;
  // An open-ended clip's tail *is* the composition's end (see `clipSpan`):
  // it owns no length to preserve, so it slides right by giving up head and
  // keeps following the composition instead of leaving a gap behind it.
  const maxStart = range.open ? duration - minLength : duration - length;
  const start = snap(Math.max(0, Math.min(range.start + delta, maxStart)));
  return { start, end: range.open ? range.end : start + length };
}

export const MIN_TIMELINE_HEIGHT = 160;
export const MAX_TIMELINE_VIEWPORT_FRACTION = 0.6;
export const TIMELINE_HEIGHT_STEP = 16;
export const TIMELINE_HEIGHT_STORAGE_KEY = "voo.motionTimelineHeight";

/** Keep a dragged timeline height between a usable minimum and 60% of the window. */
export function clampTimelineHeight(value, viewportHeight) {
  const height = Number(value);
  if (!Number.isFinite(height)) return null;
  const max = Math.max(
    MIN_TIMELINE_HEIGHT,
    Math.floor((Number(viewportHeight) || 0) * MAX_TIMELINE_VIEWPORT_FRACTION),
  );
  return Math.round(Math.max(MIN_TIMELINE_HEIGHT, Math.min(max, height)));
}
