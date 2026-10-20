import { createSceneMediaRuntime } from "./scene-media-runtime.js";
import { createEditorPlayback } from "./editor-playback.js";
import { isMediaNode } from "./scene-media.js";
import { mergeMediaNodePatch } from "./scene-media.js";
import { findNode } from "./scene_model.js";
import { evaluateSceneAtTime } from "./scene-motion.js";

/** Keep the stage, export, and public timeline API on one evaluated frame. */
export function createEditorMediaBridge({
  getDoc,
  setDoc,
  getNodesController,
  requestRender,
  notify,
  isDisposed,
  host,
}) {
  const mediaRuntime = createSceneMediaRuntime(() => {
    if (!isDisposed()) {
      requestRender();
      notify();
    }
  }, host);
  const playback = createEditorPlayback({
    getDoc,
    setDoc,
    updateNode: (id, patch, options) =>
      getNodesController().updateNode(id, patch, options),
    mediaRuntime,
    synchronizeMedia: (time, playing) =>
      mediaRuntime.synchronizeFrame(
        evaluateSceneAtTime(getDoc(), time),
        time,
        playing,
      ),
    requestRender,
    notify,
  });

  function bitmapOf(node) {
    return isMediaNode(node)
      ? mediaRuntime.bitmapOf(node, playback.getPlaybackState().time)
      : null;
  }

  const api = {
    getEvaluatedDocument: playback.getEvaluatedDocument,
    getPlaybackState: playback.getPlaybackState,
    seekToTime: playback.seekToTime,
    play: playback.play,
    pause: playback.pause,
    prepareFrame: playback.prepareFrame,
    setTimeline: playback.setTimeline,
    upsertKeyframe: playback.upsertKeyframe,
    removeKeyframe: playback.removeKeyframe,
    moveKeyframe: playback.moveKeyframe,
    getMediaError: mediaRuntime.getError,
    getMediaErrors: mediaRuntime.getErrors,
    getMediaPlaybackMetadata: mediaRuntime.getPlaybackMetadata,
    getMediaSrc: (node) => mediaRuntime.resolveMediaSrc(node),
    updateNode(id, patch, options) {
      const node = findNode(getDoc(), id);
      return getNodesController().updateNode(
        id,
        node && isMediaNode(node) ? mergeMediaNodePatch(node, patch) : patch,
        options,
      );
    },
  };

  function dispose() {
    playback.dispose();
    mediaRuntime.dispose();
  }
  return {
    ...api,
    api,
    bitmapOf,
    reconcile: mediaRuntime.reconcile,
    dispose,
  };
}
