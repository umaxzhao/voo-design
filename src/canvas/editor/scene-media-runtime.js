import { isMediaNode } from "./scene-media.js";
import { normalizeTimeline } from "./scene-motion.js";
import { createAudioRuntime } from "./audio-runtime.js";
import { createModel3dRuntime } from "./model3d-runtime.js";
import { createVideoRuntime } from "./video-runtime.js";
import { getImageBlobMap } from "../store/db.js";

/** One editor owns every decoder, GL context, and media error in its scene. */
export function createSceneMediaRuntime(onChange, host = null) {
  const errors = new Map();
  const reportError = (id, error) => {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    if (errors.get(id)?.message === normalized.message) return;
    errors.set(id, normalized);
    onChange();
  };
  const video = createVideoRuntime(onChange, reportError);
  const model = createModel3dRuntime(onChange, reportError);
  const audio = createAudioRuntime(onChange, reportError);
  let playing = false;
  let disposed = false;
  const blobUrls = new Map();
  const pendingBlobs = new Map();
  let retainedAssetIds = new Set();

  function resolveNode(node) {
    if (node.src || !node.assetId) return node;
    const src =
      host?.resolveImage?.(node.assetId) ?? blobUrls.get(node.assetId);
    return typeof src === "string" && src ? { ...node, src } : node;
  }

  async function hydrateNode(node) {
    const resolved = resolveNode(node);
    if (resolved.src || !node.assetId) return resolved;
    let pending = pendingBlobs.get(node.assetId);
    if (!pending) {
      pending = (async () => {
        const blob =
          (await host?.getImageBlob?.(node.assetId)) ??
          (await getImageBlobMap([node.assetId])).get(node.assetId);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        if (disposed || !retainedAssetIds.has(node.assetId)) {
          URL.revokeObjectURL(url);
          return null;
        }
        blobUrls.set(node.assetId, url);
        onChange();
        return url;
      })().finally(() => pendingBlobs.delete(node.assetId));
      pendingBlobs.set(node.assetId, pending);
    }
    const src = await pending;
    return src ? { ...node, src } : node;
  }

  /** Footage, sound and models each own their decoder; pick by kind. */
  const decoderFor = (kind) =>
    kind === "video" ? video : kind === "audio" ? audio : model;

  async function ensure(node) {
    if (!isMediaNode(node)) return node;
    try {
      const resolved = await hydrateNode(node);
      if (!resolved.src) throw new Error("Media source is unavailable");
      await decoderFor(node.kind).ensure(resolved);
      const error = decoderFor(node.kind).errorFor(node.id);
      if (!error) errors.delete(node.id);
      else reportError(node.id, error);
      return resolved;
    } catch (error) {
      reportError(node.id, error);
      return null;
    }
  }

  function bitmapOf(node, time = 0) {
    if (!isMediaNode(node) || node.kind === "audio") return null;
    const resolved = resolveNode(node);
    void ensure(node);
    if (!resolved.src) return null;
    if (errors.has(node.id)) return null;
    if (node.kind === "video") {
      if (playing) video.synchronize(resolved, time);
      else
        void video
          .seek(resolved, time)
          .catch((error) => reportError(node.id, error));
      return video.frame(resolved);
    }
    try {
      return model.render(resolved, time);
    } catch (error) {
      reportError(node.id, error);
      return null;
    }
  }

  async function prepareFrame(doc, time) {
    const nodes = doc.nodes.filter(
      (node) => isMediaNode(node) && node.visible !== false,
    );
    const resolvedNodes = await Promise.all(nodes.map(ensure));
    const firstError = nodes.map((node) => errors.get(node.id)).find(Boolean);
    if (firstError) throw firstError;
    const duration = normalizeTimeline(doc.timeline).duration;
    await Promise.all(
      resolvedNodes
        .filter((node) => node?.kind === "video")
        .map((node) => video.seek(node, time)),
    );
    // A frame is prepared whether or not the timeline is running, so sound is
    // positioned here and never started: rendering a frame is not playing it.
    await Promise.all(
      resolvedNodes
        .filter((node) => node?.kind === "audio")
        .map((node) => audio.seek(node, time, duration)),
    );
    for (const node of resolvedNodes.filter(
      (item) => item?.kind === "model3d",
    )) {
      try {
        if (!model.render(node, time)) throw new Error("Model is not ready");
      } catch (error) {
        reportError(node.id, error);
        throw error;
      }
    }
    return doc;
  }

  function reconcile(doc) {
    retainedAssetIds = new Set(
      doc.nodes.map((node) => node.assetId).filter(Boolean),
    );
    const videoIds = new Set(
      doc.nodes.filter((node) => node.kind === "video").map((node) => node.id),
    );
    const modelIds = new Set(
      doc.nodes
        .filter((node) => node.kind === "model3d")
        .map((node) => node.id),
    );
    const audioIds = new Set(
      doc.nodes.filter((node) => node.kind === "audio").map((node) => node.id),
    );
    video.prune(videoIds);
    model.prune(modelIds);
    audio.prune(audioIds);
    for (const [assetId, url] of blobUrls) {
      if (retainedAssetIds.has(assetId)) continue;
      URL.revokeObjectURL(url);
      blobUrls.delete(assetId);
    }
    for (const id of errors.keys())
      if (!videoIds.has(id) && !modelIds.has(id) && !audioIds.has(id))
        errors.delete(id);
  }

  function setPlaying(value) {
    playing = Boolean(value);
    video.setPlaying(playing);
    audio.setPlaying(playing);
  }
  function synchronizeFrame(doc, time, active) {
    const duration = normalizeTimeline(doc.timeline).duration;
    for (const node of doc.nodes.filter((item) => item.kind === "video")) {
      const resolved = resolveNode(node);
      if (resolved.visible === false) {
        video.synchronize(resolved, time);
      } else if (!resolved.src) {
        void ensure(node);
      } else if (active) {
        void ensure(resolved);
        video.synchronize(resolved, time);
      } else {
        void video
          .seek(resolved, time)
          .catch((error) => reportError(node.id, error));
      }
    }
    // Sound follows the same two states as picture: the running playhead may
    // start it, a scrub may only move it.
    for (const node of doc.nodes.filter((item) => item.kind === "audio")) {
      const resolved = resolveNode(node);
      if (!resolved.src) {
        void ensure(node);
        continue;
      }
      const task = active
        ? audio.synchronize(resolved, time, duration)
        : audio.seek(resolved, time, duration);
      void task.catch((error) => reportError(node.id, error));
    }
  }
  function getError(id) {
    return errors.get(id) ?? null;
  }
  function getErrors() {
    return Object.fromEntries(errors);
  }
  function getPlaybackMetadata(id) {
    if (errors.has(id)) return null;
    return (
      video.getPlaybackMetadata(id) ??
      audio.getPlaybackMetadata(id) ??
      model.getPlaybackMetadata(id)
    );
  }
  function dispose() {
    disposed = true;
    video.dispose();
    model.dispose();
    audio.dispose();
    for (const url of blobUrls.values()) URL.revokeObjectURL(url);
    blobUrls.clear();
    errors.clear();
  }
  /**
   * The playable URL a layer's bytes produce again.
   *
   * `src` is session-only (`serialiseDocument` strips blob URLs), so a node
   * reloaded from storage only carries its assetId; the runtime is the place
   * that already knows how to marry an assetId back to bytes (hydrate). The
   * timeline's waveform uses this instead of the node's dead `src`.
   */
  async function resolveMediaSrc(node) {
    if (!isMediaNode(node)) return null;
    // The caller renders this layer (timeline waveform), so its asset keeps
    // its URL even when a reconcile beats the promise.
    if (node.assetId)
      retainedAssetIds = new Set([...retainedAssetIds, node.assetId]);
    const resolved = await hydrateNode(node);
    return typeof resolved?.src === "string" && resolved.src
      ? resolved.src
      : null;
  }

  return {
    bitmapOf,
    resolveMediaSrc,
    prepareFrame,
    reconcile,
    setPlaying,
    synchronizeFrame,
    getError,
    getErrors,
    getPlaybackMetadata,
    dispose,
  };
}
