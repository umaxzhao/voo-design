import { t } from "../../shared/i18n.js";
import { getImageBlobMap } from "../store/db.js";
import { audioGainAt } from "./audio-runtime.js";
import { isHiddenByGroup } from "./scene_model_groups.js";
import { normalizeTimeline } from "./scene-motion.js";

function loaded(video, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error(t("editor.motion.audioLoadFailed")));
    };
    const aborted = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(failed, 30000);
    video.load();
    if (signal?.aborted) aborted();
  });
}

/**
 * Where an audio layer's bytes live.
 *
 * A saved document has no `src` (blob URLs never persist), and the shared
 * image resolver answers with a picture URL — sound has to come back through
 * the blob store the editor itself reads it from.
 */
async function soundSourceOf(engine, node, ownedUrls) {
  if (typeof node.src === "string" && node.src) return node.src;
  if (!node.assetId) return "";
  // Await the host first, then fall back: the host answers a promise, and a
  // null from it must still reach the blob store the editor itself reads.
  const fromHost = await engine.getHost?.()?.getImageBlob?.(node.assetId);
  const blob =
    fromHost ??
    (await getImageBlobMap([node.assetId]).then((map) =>
      map.get(node.assetId),
    ));
  if (!blob || typeof blob.arrayBuffer !== "function") return "";
  // Only a URL this function minted is ours to revoke.
  const url = URL.createObjectURL(blob);
  ownedUrls.push(url);
  return url;
}

function wrapTime(time, duration) {
  return ((time % duration) + duration) % duration;
}

function collect(doc, resolveCanvas, mapTime, output, visited) {
  const ownDuration = normalizeTimeline(doc.timeline).duration;
  for (const node of doc.nodes ?? []) {
    if (node.visible === false) continue;
    if (node.kind === "video" || node.kind === "audio") {
      output.push({ node, mapTime, duration: ownDuration });
      continue;
    }
    if (node.kind !== "canvasInstance") continue;
    // What the host shows is what the export sounds. A silenced, transparent
    // or folder-hidden instance feeds the mix nothing at all — and unlike the
    // rendered branch, recursing into it would carry every nested track
    // through regardless of the instance's own mute.
    if (
      node.instance?.muted ||
      (node.opacity ?? 1) <= 0 ||
      isHiddenByGroup(doc, node)
    )
      continue;
    const sourceCanvasId = node.sourceCanvasId;
    // Without a resolver a caller could only ever have the root's own nodes,
    // which is what this function did before nested canvases were walked.
    const source = resolveCanvas?.(sourceCanvasId) ?? null;
    if (!source || visited.has(sourceCanvasId)) continue;
    const sourceDuration = normalizeTimeline(source.timeline).duration;
    const localTime = (rootTime) =>
      wrapTime(
        mapTime(rootTime) + (node.instance?.playbackStart ?? 0),
        sourceDuration,
      );
    if (node.instance?.playbackMode === "video") {
      output.push({
        node: {
          ...node,
          kind: "video",
          src: node.instance.videoSrc,
          timing: null,
          media: { muted: node.instance.muted ?? false, volume: 1, speed: 1 },
        },
        mapTime: localTime,
        duration: sourceDuration,
      });
      continue;
    }
    collect(
      source,
      resolveCanvas,
      localTime,
      output,
      new Set([...visited, sourceCanvasId]),
    );
  }
}

/**
 * Every layer a video export has to sound: the composition's own footage and
 * every nested canvas instance's, each with the clock its own timeline runs on.
 *
 * Instance audio lives inside the instance, so a mixer that only walks the
 * root document leaves it out of the exported file entirely.
 *
 * @param {object} doc the root composition
 * @param {Function} [resolveCanvas] `sourceCanvasId` → document; omitted,
 *   only the root's own nodes are returned
 * @returns {{node: object, mapTime: (time: number) => number, duration: number}[]}
 */
export function collectAudioLayers(doc, resolveCanvas) {
  const output = [];
  collect(doc, resolveCanvas, (time) => time, output, new Set());
  return output.filter((layer) => {
    const media = layer.node.media ?? {};
    return (
      layer.node.visible !== false && !media.muted && (media.volume ?? 1) > 0
    );
  });
}

/** Separate elements keep export mixing from changing the editor's audio graph. */
export async function createSceneExportAudio(
  engine,
  doc,
  signal,
  resolveCanvas = null,
) {
  const layers = collectAudioLayers(doc, resolveCanvas);
  if (!layers.length)
    return { tracks: [], sync: async () => {}, dispose: async () => {} };
  const AudioContextClass =
    globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error(t("editor.motion.audioUnsupported"));
  const context = new AudioContextClass();
  const destination = context.createMediaStreamDestination();
  const entries = [];
  const ownedUrls = [];
  const dispose = async () => {
    for (const { element, source, gain } of entries) {
      element.pause();
      element.removeAttribute("src");
      element.load();
      source.disconnect();
      gain.disconnect();
    }
    for (const url of ownedUrls) URL.revokeObjectURL(url);
    ownedUrls.length = 0;
    destination.stream.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") await context.close();
  };
  try {
    await context.resume();
    for (const layer of layers) {
      const node = layer.node;
      // Sound has no picture to decode; only the film needs CORS, because only
      // the film is ever read back into a canvas.
      const element = document.createElement(
        node.kind === "audio" ? "audio" : "video",
      );
      if (node.kind !== "audio") element.crossOrigin = "anonymous";
      element.preload = "auto";
      element.playsInline = true;
      const bitmap = node.kind === "video" ? engine.getNodeBitmap(node) : null;
      const mediaSrc =
        node.kind === "audio"
          ? await soundSourceOf(engine, node, ownedUrls)
          : bitmap?.currentSrc ||
            bitmap?.src ||
            engine.getHost()?.resolveImage(node.assetId) ||
            node.src;
      element.src = mediaSrc;
      if (!element.src) throw new Error(t("editor.motion.audioLoadFailed"));
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      gain.gain.value = node.media?.volume ?? 1;
      source.connect(gain);
      gain.connect(destination);
      entries.push({ layer, element, source, gain, active: false });
      await loaded(element, signal);
      element.currentTime = node.media?.inPoint ?? 0;
      element.playbackRate = node.media?.speed ?? 1;
    }
    return {
      tracks: destination.stream.getAudioTracks(),
      async sync(time) {
        for (const entry of entries) {
          const { layer, element } = entry;
          const node = layer.node;
          // The root's clock is only the root's: a nested canvas runs on the
          // offset, wrapping clock its instance asks for.
          const local = layer.mapTime(time);
          const start = node.timing?.start ?? 0;
          const sourceTime =
            (node.media?.inPoint ?? 0) +
            Math.max(0, local - start) * (node.media?.speed ?? 1);
          const end = Math.min(
            node.media?.outPoint ?? Infinity,
            element.duration,
          );
          const active =
            local >= start &&
            local < (node.timing?.end ?? Infinity) &&
            sourceTime < end;
          // The exported stream carries the same envelope the editor plays:
          // level rides the fade rather than jumping at its ends.
          entry.gain.gain.value =
            (node.media?.volume ?? 1) *
            audioGainAt(node, local, layer.duration);
          if (active && !entry.active) {
            element.currentTime = sourceTime;
            await element.play();
          } else if (!active && entry.active) element.pause();
          entry.active = active;
        }
      },
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
