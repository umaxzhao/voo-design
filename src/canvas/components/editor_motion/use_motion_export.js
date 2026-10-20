import { useCallback } from "react";
import { t } from "../../../shared/i18n.js";
import { getImageBlobMap } from "../../store/db.js";

async function directPayload(
  engine,
  doc,
  resolveCanvas,
  signal,
  buildProps,
  materializeAssets,
) {
  const props = buildProps(doc, { resolveCanvas });
  const allNodes = [
    ...props.nodes,
    ...Object.values(props.canvases).flatMap((canvas) => canvas.nodes),
  ];
  const assetId = (node) =>
    node.kind === "image"
      ? node.imageId
      : node.kind === "canvasInstance"
        ? node.instance?.videoAssetId
        : (node.assetId ?? node.imageId);
  const ids = allNodes.map(assetId).filter(Boolean);
  const blobs = ids.length ? await getImageBlobMap(ids) : new Map();
  return materializeAssets(props, {
    signal,
    resolveNodeSource: (node) => {
      const id = assetId(node);
      return (
        blobs.get(id) ??
        (node.kind === "canvasInstance" ? node.instance?.videoSrc : node.src) ??
        (id ? engine.getHost()?.resolveImage?.(id) : null) ??
        null
      );
    },
  });
}

async function capturedPayload(
  engine,
  doc,
  onProgress,
  signal,
  buildProps,
  resolveCanvas,
) {
  const { exportSceneVideo } =
    await import("../../editor/scene-video-export.js");
  const { blob, extension } = await exportSceneVideo(engine, {
    onProgress: (value) => onProgress?.(value * 0.4),
    signal,
    // Frames are captured from a document that may hold nested canvases, and
    // their sound has to be mixed from the same sources.
    resolveCanvas,
  });
  signal?.throwIfAborted();
  const id = crypto.randomUUID();
  return {
    props: buildProps(doc, { captureSrc: id }),
    assets: [
      {
        id,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mime: blob.type || `video/${extension}`,
      },
    ],
  };
}

async function desktopExport(
  engine,
  title,
  resolveCanvas,
  onProgress,
  signal,
  bridge,
) {
  signal?.throwIfAborted();
  const [
    {
      buildMotionRemotionProps,
      canCaptureMotionCanvas,
      canRenderMotionDirectly,
    },
    { materializeMotionAssets },
  ] = await Promise.all([
    import("./motion-remotion-props.js"),
    import("./motion-remotion-assets.js"),
  ]);
  signal?.throwIfAborted();
  const doc = engine.getDocument();
  const direct = canRenderMotionDirectly(doc);
  if (!direct && !canCaptureMotionCanvas(doc))
    throw new Error(t("editor.motion.exportFailed"));
  const payload = direct
    ? await directPayload(
        engine,
        doc,
        resolveCanvas,
        signal,
        buildMotionRemotionProps,
        materializeMotionAssets,
      )
    : await capturedPayload(
        engine,
        doc,
        onProgress,
        signal,
        buildMotionRemotionProps,
        resolveCanvas,
      );
  signal?.throwIfAborted();
  const jobId = crypto.randomUUID();
  let lastProgress = direct ? 0 : 0.4;
  const abort = () => void bridge.cancelMotionRender?.(jobId);
  const unsubscribe = bridge.onMotionRenderProgress?.((event) => {
    if (event?.jobId !== jobId || !Number.isFinite(event.progress)) return;
    const fraction = Math.max(0, Math.min(1, event.progress));
    const phaseProgress =
      event.phase === "done"
        ? 1
        : event.phase === "render"
          ? 0.15 + 0.85 * fraction
          : event.phase === "download"
            ? 0.05 + 0.1 * fraction
            : 0;
    const total = direct ? phaseProgress : 0.4 + phaseProgress * 0.6;
    lastProgress = Math.max(lastProgress, total);
    onProgress?.(lastProgress);
  });
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await bridge.renderMotionVideo({
      ...payload,
      jobId,
      outputName: String(title),
    });
    signal?.throwIfAborted();
    if (result?.code === "cancelled") return null;
    if (!result?.ok) throw new Error(t("editor.motion.exportFailed"));
    if (result.path) onProgress?.(1);
    return result.path;
  } finally {
    signal?.removeEventListener("abort", abort);
    unsubscribe?.();
  }
}

async function browserExport(engine, title, resolveCanvas, onProgress, signal) {
  const doc = engine.getDocument();
  const hasSpatialLayers =
    doc.canvasType === "3d" ||
    doc.nodes.some((node) =>
      ["mesh3d", "model3d", "canvasInstance"].includes(node.kind),
    );
  let result;
  if (hasSpatialLayers) {
    const [{ buildMotionRemotionProps }, { exportMixedBrowserVideo }] =
      await Promise.all([
        import("./motion-remotion-props.js"),
        import("./motion-browser-mixed-export.js"),
      ]);
    // The mixed exporter paints every node with the 2D canvas, which draws
    // effects, masks and gradients — a document the DOM renderer refuses is
    // still renderable here, so ask for props without the direct-render guard.
    const props = buildMotionRemotionProps(doc, {
      resolveCanvas,
      canvasPainted: true,
    });
    result = await exportMixedBrowserVideo(engine, props, {
      onProgress,
      signal,
    });
  } else {
    const { exportSceneVideo } =
      await import("../../editor/scene-video-export.js");
    result = await exportSceneVideo(engine, {
      onProgress,
      signal,
      // Sound inside a nested canvas is mixed from the instance's own clock,
      // which only this resolver can reach.
      resolveCanvas,
    });
  }
  const { blob, extension } = result;
  signal?.throwIfAborted();
  const name = String(title).replace(/[\\/:*?"<>|]/g, "-");
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

/** Downloads a motion composition without changing the saved scene. */
export default function useMotionExport(engine, title, resolveCanvas = null) {
  return useCallback(
    async (onProgress, signal) => {
      if (!engine) throw new TypeError("An editor engine is required");
      const bridge = globalThis.vooElectron;
      if (typeof bridge?.renderMotionVideo === "function")
        return desktopExport(
          engine,
          title,
          resolveCanvas,
          onProgress,
          signal,
          bridge,
        );
      return browserExport(engine, title, resolveCanvas, onProgress, signal);
    },
    [engine, title, resolveCanvas],
  );
}
