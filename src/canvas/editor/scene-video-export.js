import { normalizeTimeline } from "./scene-motion.js";
import { createSceneExportAudio } from "./scene-export-audio.js";
import { t } from "../../shared/i18n.js";

export function sceneVideoMimeType(Recorder = globalThis.MediaRecorder) {
  return (
    [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ].find((type) => Recorder?.isTypeSupported?.(type)) ?? null
  );
}

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

/** Browser video export uses the same evaluated canvas as saved artwork. */
export async function exportSceneVideo(
  engine,
  { onProgress, signal, resolveCanvas = null } = {},
) {
  const mimeType = sceneVideoMimeType();
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream)
    throw new Error(t("editor.motion.exportUnsupported"));
  signal?.throwIfAborted();
  const doc = engine.getDocument();
  const saved = engine.getPlaybackState();
  const { duration, fps } = normalizeTimeline(doc.timeline);
  const signature = JSON.stringify(engine.serialise());
  let stream;
  let recorder;
  let audio;
  let completion;
  engine.pause();
  try {
    await engine.flushMasks?.();
    await engine.prepareFrame(0);
    const initial = await engine.exportPngCanvasAsync(1, resolveCanvas, 0);
    if (!initial) throw new Error(t("editor.motion.exportFailed"));
    const canvas = document.createElement("canvas");
    canvas.width = initial.width;
    canvas.height = initial.height;
    const context = canvas.getContext("2d");
    const paint = (frame) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle =
        doc.backgroundColor === "transparent"
          ? "#000000"
          : doc.backgroundColor || "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(frame, 0, 0);
    };
    paint(initial);
    audio = await createSceneExportAudio(engine, doc, signal, resolveCanvas);
    stream = canvas.captureStream(fps);
    for (const track of audio.tracks) stream.addTrack(track);
    recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    completion = new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener(
        "error",
        (event) =>
          reject(event.error ?? new Error(t("editor.motion.exportFailed"))),
        { once: true },
      );
      recorder.addEventListener(
        "stop",
        () => resolve(new Blob(chunks, { type: mimeType })),
        { once: true },
      );
    });
    // Observe rejection immediately, including while media seeking is pending.
    let recordingError;
    completion.catch((error) => {
      recordingError = error;
    });
    await audio.sync(0);
    recorder.start();
    const start = performance.now();
    onProgress?.(0);
    while (recorder.state === "recording") {
      signal?.throwIfAborted();
      if (recordingError) throw recordingError;
      if (document.hidden) throw new Error(t("editor.motion.exportBackground"));
      if (JSON.stringify(engine.serialise()) !== signature)
        throw new Error(t("editor.motion.exportChanged"));
      const time = (performance.now() - start) / 1000;
      if (time >= duration) break;
      await engine.prepareFrame(Math.floor(time * fps) / fps);
      await audio.sync(time);
      paint(await engine.exportPngCanvasAsync(1, resolveCanvas, time));
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
    engine.seekToTime(saved.time);
    if (saved.playing) engine.play();
  }
}
