/** Audio graph for videos and sound inside nested live canvases. */
import { t } from "../../../shared/i18n.js";
import { audioGainAt } from "../../editor/audio-runtime.js";

function wrapTime(time, duration) {
  return ((time % duration) + duration) % duration;
}

export function collectVideoLayers(doc, canvases, mapTime, output, visited) {
  const ownDuration = doc.timeline?.duration ?? 5;
  for (const node of doc.nodes) {
    if (node.visible === false) continue;
    if (node.kind === "video" || node.kind === "audio") {
      output.push({
        kind: node.kind,
        src: node.src,
        mapTime,
        timing: node.timing,
        media: node.media,
        node,
        duration: ownDuration,
      });
      continue;
    }
    if (node.kind !== "canvasInstance") continue;
    const source = canvases[node.sourceCanvasId];
    if (!source) throw new Error(t("editor.motion.exportFailed"));
    const duration = source.timeline?.duration ?? 5;
    const localTime = (rootTime) =>
      wrapTime(
        mapTime(rootTime) + (node.instance?.playbackStart ?? 0),
        duration,
      );
    if (node.instance?.playbackMode === "video") {
      output.push({
        kind: "video",
        src: node.instance.videoSrc,
        mapTime: localTime,
        timing: null,
        media: { muted: node.instance.muted ?? false, volume: 1, speed: 1 },
      });
      continue;
    }
    if (visited.has(node.sourceCanvasId))
      throw new Error(t("editor.motion.exportFailed"));
    collectVideoLayers(
      source,
      canvases,
      localTime,
      output,
      new Set([...visited, node.sourceCanvasId]),
    );
  }
}

function ready(video, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
    };
    const loaded = () => {
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
    video.addEventListener("loadeddata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(failed, 30000);
    video.load();
    if (signal?.aborted) aborted();
  });
}

/** One Web Audio destination mixes root and nested video tracks. */
export async function createMixedBrowserAudio(props, signal) {
  const layers = [];
  collectVideoLayers(
    props,
    props.canvases ?? {},
    (time) => time,
    layers,
    new Set(),
  );
  const audible = layers.filter(
    (layer) =>
      layer.src && !layer.media?.muted && (layer.media?.volume ?? 1) > 0,
  );
  if (!audible.length)
    return { tracks: [], sync: async () => {}, dispose: async () => {} };
  const duration = props.timeline?.duration;
  const AudioContextClass =
    globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error(t("editor.motion.audioUnsupported"));
  const context = new AudioContextClass();
  const destination = context.createMediaStreamDestination();
  const entries = [];
  const dispose = async () => {
    for (const { element, source, gain } of entries) {
      element.pause();
      element.removeAttribute("src");
      element.load();
      source.disconnect();
      gain.disconnect();
    }
    destination.stream.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") await context.close();
  };
  try {
    await context.resume();
    for (const layer of audible) {
      signal?.throwIfAborted();
      const element = document.createElement(
        layer.kind === "audio" ? "audio" : "video",
      );
      // Only a film is ever read back into a canvas, so only it needs CORS.
      if (layer.kind !== "audio") element.crossOrigin = "anonymous";
      element.preload = "auto";
      element.playsInline = true;
      element.src = layer.src;
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      gain.gain.value = layer.media?.volume ?? 1;
      source.connect(gain);
      gain.connect(destination);
      entries.push({ ...layer, element, source, gain, active: false });
      await ready(element, signal);
    }
    return {
      tracks: destination.stream.getAudioTracks(),
      async sync(rootTime) {
        for (const entry of entries) {
          const { element, timing, media, node } = entry;
          const time = entry.mapTime(rootTime);
          const start = timing?.start ?? 0;
          const sourceTime =
            (media?.inPoint ?? 0) +
            Math.max(0, time - start) * (media?.speed ?? 1);
          const end = Math.min(media?.outPoint ?? Infinity, element.duration);
          const active =
            time >= start &&
            time < (timing?.end ?? Infinity) &&
            sourceTime < end;
          // Sound carries the same fade the editor plays; a rendered film has
          // no fades of its own, so the envelope is a no-op for it.
          entry.gain.gain.value =
            (media?.volume ?? 1) *
            (node ? audioGainAt(node, time, entry.duration ?? duration) : 1);
          if (active) {
            if (
              !entry.active ||
              Math.abs(element.currentTime - sourceTime) > 0.2
            )
              element.currentTime = sourceTime;
            if (!entry.active) await element.play();
          } else if (entry.active) {
            element.pause();
          }
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
