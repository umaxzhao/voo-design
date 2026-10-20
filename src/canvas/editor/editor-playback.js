import { findNode } from "./scene_model.js";
import {
  evaluateSceneAtTime,
  moveNodeKeyframe,
  normalizeTimeline,
  removeNodeKeyframe,
  upsertNodeKeyframe,
} from "./scene-motion.js";
import { commitEditorDocument } from "../undo-action-contracts.js";

/** Composition clock and undoable timeline operations for one editor. */
export function createEditorPlayback({
  getDoc,
  setDoc,
  updateNode,
  mediaRuntime,
  synchronizeMedia,
  requestRender,
  notify,
}) {
  let time = 0;
  let playing = false;
  let frame = 0;
  let stamp = 0;
  let disposed = false;

  function getPlaybackState() {
    return { time, ...normalizeTimeline(getDoc().timeline), playing };
  }

  function getEvaluatedDocument(seconds = time) {
    return evaluateSceneAtTime(getDoc(), seconds);
  }

  function seekToTime(seconds) {
    if (!Number.isFinite(seconds))
      throw new TypeError("Playback time must be finite");
    time = Math.min(getPlaybackState().duration, Math.max(0, seconds));
    stamp = performance.now();
    synchronizeMedia(time, playing);
    requestRender();
    notify();
    return time;
  }

  function pause() {
    if (!playing) return;
    playing = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    mediaRuntime.setPlaying(false);
    synchronizeMedia(time, false);
    notify();
  }

  function tick(now) {
    if (!playing || disposed) return;
    const { duration, loop } = getPlaybackState();
    const next = time + Math.max(0, (now - stamp) / 1000);
    stamp = now;
    time = loop ? next % duration : Math.min(duration, next);
    synchronizeMedia(time, true);
    requestRender();
    notify();
    if (!loop && time >= duration) {
      pause();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function play() {
    if (playing || disposed) return;
    if (time >= getPlaybackState().duration) time = 0;
    playing = true;
    stamp = performance.now();
    mediaRuntime.setPlaying(true);
    synchronizeMedia(time, true);
    frame = requestAnimationFrame(tick);
    notify();
  }

  async function prepareFrame(seconds = time) {
    seekToTime(seconds);
    const evaluated = getEvaluatedDocument();
    await mediaRuntime.prepareFrame(evaluated, time);
    requestRender();
    return evaluated;
  }

  function setTimeline(timeline) {
    const doc = getDoc();
    commitEditorDocument("editor.document.set", setDoc, {
      ...doc,
      timeline: normalizeTimeline({ ...doc.timeline, ...timeline }),
    });
    seekToTime(time);
  }

  function upsertKeyframe(nodeId, property, value, options) {
    const node = findNode(getDoc(), nodeId);
    if (!node) throw new TypeError(`Unknown node: ${nodeId}`);
    const updated = upsertNodeKeyframe(node, property, value);
    updateNode(nodeId, { animations: updated.animations }, options);
  }

  function removeKeyframe(nodeId, property, keyframeTime, options) {
    const node = findNode(getDoc(), nodeId);
    if (!node) throw new TypeError(`Unknown node: ${nodeId}`);
    const updated = removeNodeKeyframe(node, property, keyframeTime);
    updateNode(nodeId, { animations: updated.animations }, options);
  }

  function moveKeyframe(nodeId, property, fromTime, toTime, options) {
    const node = findNode(getDoc(), nodeId);
    if (!node) throw new TypeError(`Unknown node: ${nodeId}`);
    const updated = moveNodeKeyframe(node, property, fromTime, toTime);
    if (updated !== node)
      updateNode(nodeId, { animations: updated.animations }, options);
  }

  function dispose() {
    disposed = true;
    pause();
  }

  return {
    getPlaybackState,
    getEvaluatedDocument,
    seekToTime,
    play,
    pause,
    prepareFrame,
    setTimeline,
    upsertKeyframe,
    removeKeyframe,
    moveKeyframe,
    dispose,
  };
}
