/** Browser recording of the same ordered scene graph as desktop Remotion. */
import { t } from "../../../shared/i18n.js";
import { getImageBlobMap } from "../../store/db.js";
import { applyInstanceOverrides } from "../../editor/instance-overrides.js";
import {
  withInstanceCamera,
  withInstanceView,
} from "../../editor/instance-view.js";
import { evaluateSceneAtTime } from "../../editor/scene-motion.js";
import { drawNode } from "../../editor/scene_renderer.js";
import { createMixedBrowserAudio } from "./motion-browser-audio.js";
import { mixedRenderSegments } from "./motion-mixed-segments.js";
import { createThreeFrameSession } from "./motion-three-frame.js";

const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function nextFrame(signal) {
  return new Promise((resolve, reject) => {
    let frame;
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    frame = requestAnimationFrame(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function mediaId(node) {
  if (node.kind === "image") return node.imageId;
  if (node.kind === "canvasInstance") return node.instance?.videoAssetId;
  return node.assetId ?? node.imageId;
}

function mediaSource(node) {
  return node.kind === "canvasInstance" ? node.instance?.videoSrc : node.src;
}

function allDocuments(props) {
  return [props, ...Object.values(props.canvases ?? {})];
}

async function resolveMediaSources(props, engine, signal) {
  const ids = allDocuments(props)
    .flatMap((doc) => doc.nodes.map(mediaId))
    .filter(Boolean);
  const blobs = ids.length ? await getImageBlobMap(ids) : new Map();
  const urls = [];
  const sourceByNode = new Map();
  for (const doc of allDocuments(props)) {
    for (const node of doc.nodes) {
      signal?.throwIfAborted();
      if (!["image", "video", "model3d", "canvasInstance"].includes(node.kind))
        continue;
      if (
        node.kind === "canvasInstance" &&
        node.instance?.playbackMode !== "video"
      )
        continue;
      const id = mediaId(node);
      const source =
        blobs.get(id) ??
        mediaSource(node) ??
        (id ? engine.getHost()?.resolveImage?.(id) : null);
      if (!source) throw new Error(t("editor.motion.exportFailed"));
      if (source instanceof Blob) {
        const url = URL.createObjectURL(source);
        urls.push(url);
        sourceByNode.set(node, url);
      } else {
        sourceByNode.set(node, source);
      }
    }
  }
  return {
    props: {
      ...props,
      nodes: props.nodes.map((node) => patchSource(node, sourceByNode)),
      canvases: Object.fromEntries(
        Object.entries(props.canvases ?? {}).map(([id, doc]) => [
          id,
          {
            ...doc,
            nodes: doc.nodes.map((node) => patchSource(node, sourceByNode)),
          },
        ]),
      ),
    },
    dispose: () => urls.forEach((url) => URL.revokeObjectURL(url)),
  };
}

function patchSource(node, sourceByNode) {
  const source = sourceByNode.get(node);
  if (!source) return node;
  if (node.kind === "canvasInstance")
    return { ...node, instance: { ...node.instance, videoSrc: source } };
  return { ...node, src: source };
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t("editor.motion.exportFailed")));
    image.src = source;
  });
}

function loadVideo(source) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error(t("editor.motion.exportFailed")));
    video.src = source;
  });
}

async function seekVideo(video, time) {
  const target = Math.max(
    0,
    Math.min(time, Math.max(0, video.duration - 0.001)),
  );
  if (Math.abs(video.currentTime - target) < 0.001) {
    if (video.readyState >= 2) return video;
    await new Promise((resolve, reject) => {
      video.addEventListener("loadeddata", resolve, { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error(t("editor.motion.exportFailed"))),
        { once: true },
      );
    });
    return video;
  }
  await new Promise((resolve, reject) => {
    video.addEventListener("seeked", resolve, { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error(t("editor.motion.exportFailed"))),
      { once: true },
    );
    video.currentTime = target;
  });
  return video;
}

function instanceRect(node, doc) {
  return node.instance?.layoutMode === "fill"
    ? { x: 0, y: 0, width: doc.width, height: doc.height }
    : node;
}

function paintInstance(ctx, source, node, doc) {
  const box = instanceRect(node, doc);
  const fill = node.instance?.layoutMode === "fill";
  const scaleX = box.width / source.width;
  const scaleY = box.height / source.height;
  const scale = Math.min(scaleX, scaleY);
  const width = fill ? box.width : source.width * scale;
  const height = fill ? box.height : source.height * scale;
  ctx.save();
  ctx.globalAlpha = node.opacity ?? 1;
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
  ctx.rotate(((node.rotation ?? 0) * Math.PI) / 180);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function createFramePainter(props, signal) {
  const canvases = new Map();
  const imagePromises = new Map();
  const videoPromises = new Map();
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = props.width;
  outputCanvas.height = props.height;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error(t("editor.motion.exportFailed"));
  const threeCanvas = document.createElement("canvas");
  const three = createThreeFrameSession(threeCanvas);

  async function bitmap(node, time) {
    if (node.kind === "image") {
      if (!imagePromises.has(node.src))
        imagePromises.set(node.src, loadImage(node.src));
      return imagePromises.get(node.src);
    }
    const source =
      node.kind === "canvasInstance" ? node.instance.videoSrc : node.src;
    if (!videoPromises.has(source))
      videoPromises.set(source, loadVideo(source));
    const video = await videoPromises.get(source);
    const media = node.media ?? {};
    const start = node.timing?.start ?? 0;
    const offset =
      node.kind === "canvasInstance"
        ? (node.instance?.playbackStart ?? 0)
        : (media.inPoint ?? 0);
    const speed = node.kind === "canvasInstance" ? 1 : (media.speed ?? 1);
    const sourceTime = offset + Math.max(0, time - start) * speed;
    return seekVideo(
      video,
      node.kind === "canvasInstance" && video.duration > 0
        ? sourceTime % video.duration
        : sourceTime,
    );
  }

  async function paintDocument(doc, time, ancestry = new Set()) {
    signal?.throwIfAborted();
    const key = doc.canvasId ?? "root";
    let canvas = canvases.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = doc.width;
      canvas.height = doc.height;
      canvases.set(key, canvas);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t("editor.motion.exportFailed"));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (doc.backgroundColor !== "transparent") {
      ctx.fillStyle = doc.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const evaluated = evaluateSceneAtTime(doc, time);
    for (const segment of mixedRenderSegments(evaluated.nodes)) {
      signal?.throwIfAborted();
      if (segment.kind === "3d") {
        await three.renderFrame(evaluated, segment.nodes, signal, time);
        ctx.drawImage(threeCanvas, 0, 0, doc.width, doc.height);
        continue;
      }
      const { node } = segment;
      if (node.kind === "canvasInstance") {
        if (node.instance?.playbackMode === "video") {
          paintInstance(ctx, await bitmap(node, time), node, doc);
          continue;
        }
        const source = withInstanceCamera(
          withInstanceView(
            applyInstanceOverrides(
              props.canvases[node.sourceCanvasId],
              node.instance,
            ),
            node.instance,
          ),
          node.instance,
        );
        if (!source || ancestry.has(node.sourceCanvasId))
          throw new Error(t("editor.motion.exportFailed"));
        const duration = source.timeline?.duration ?? 5;
        const localTime =
          (time + (node.instance?.playbackStart ?? 0)) % duration;
        const child = await paintDocument(
          source,
          localTime,
          new Set([...ancestry, node.sourceCanvasId]),
        );
        paintInstance(ctx, child, node, doc);
        continue;
      }
      if (node.kind === "video") {
        const start = node.timing?.start ?? 0;
        const end = node.timing?.end ?? Infinity;
        if (time < start || time >= end) continue;
      }
      const source = ["image", "video"].includes(node.kind)
        ? await bitmap(node, time)
        : null;
      drawNode(ctx, node, () => source, null, null, false);
    }
    return canvas;
  }

  return {
    async paint(time) {
      const completed = await paintDocument(
        props,
        time,
        new Set(props.canvasId ? [props.canvasId] : []),
      );
      // Capture only complete compositions. Recursive media seeks can yield
      // after the work canvas is cleared; exposing it records partial frames.
      outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
      outputContext.drawImage(completed, 0, 0);
      return outputCanvas;
    },
    dispose() {
      three.dispose();
      for (const value of videoPromises.values()) {
        void value.then(
          (video) => {
            video.pause();
            video.removeAttribute("src");
            video.load();
          },
          () => {},
        );
      }
    },
  };
}

/** Records ordered mixed frames; MP4 is selected whenever the browser supports it. */
export async function exportMixedBrowserVideo(
  engine,
  props,
  { onProgress, signal } = {},
) {
  const Recorder = globalThis.MediaRecorder;
  const mimeType = VIDEO_TYPES.find((type) => Recorder?.isTypeSupported(type));
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream)
    throw new Error(t("editor.motion.exportUnsupported"));
  signal?.throwIfAborted();
  const media = await resolveMediaSources(props, engine, signal);
  let painter;
  let audio;
  let stream;
  let recorder;
  let completion;
  try {
    painter = createFramePainter(media.props, signal);
    audio = await createMixedBrowserAudio(media.props, signal);
    const canvas = await painter.paint(0);
    stream = canvas.captureStream(props.fps);
    for (const track of audio.tracks) stream.addTrack(track);
    recorder = new Recorder(stream, { mimeType });
    const chunks = [];
    completion = new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("error", (event) =>
        reject(event.error ?? new Error(t("editor.motion.exportFailed"))),
      );
      recorder.addEventListener("stop", () =>
        resolve(new Blob(chunks, { type: mimeType })),
      );
    });
    completion.catch(() => {});
    await audio.sync(0);
    recorder.start();
    const duration = props.durationInFrames / props.fps;
    const startedAt = performance.now();
    while (recorder.state === "recording") {
      signal?.throwIfAborted();
      if (document.hidden) throw new Error(t("editor.motion.exportBackground"));
      const time = (performance.now() - startedAt) / 1000;
      if (time >= duration) break;
      const frameTime = Math.floor(time * props.fps) / props.fps;
      await painter.paint(frameTime);
      await audio.sync(time);
      onProgress?.(Math.min(1, time / duration));
      await nextFrame(signal);
    }
    recorder.stop();
    const blob = await completion;
    if (!blob.size) throw new Error(t("editor.motion.exportFailed"));
    onProgress?.(1);
    return {
      blob,
      extension: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
    };
  } finally {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    await completion?.catch(() => {});
    stream?.getTracks().forEach((track) => track.stop());
    await audio?.dispose();
    painter?.dispose();
    media.dispose();
  }
}
