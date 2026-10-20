import { useEffect, useRef, useState } from "react";
import { createSkiaHost } from "./editor/skia_host.js";

/**
 * Paints one editor page through Skia instead of the 2D canvas.
 *
 * Only the painting moves. The engine still owns the document, the tools, the
 * viewport and hit-testing, and still reports every change — this hook just
 * draws what it reports. Swapping the whole engine at once would mean
 * rewriting selection, crop and matte editing before anything could be seen on
 * screen; swapping the painter first puts the scene adapter under real
 * documents immediately, and either renderer can draw the same page.
 *
 * The 2D canvas stays in the tree while this runs. The engine measures text
 * against it and sizes it from the stage, so removing it would take the font
 * metrics with it.
 */
export function useSkiaPage({
  enabled,
  engine,
  doc,
  canvasRef,
  stageRef,
  revision,
}) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState("idle");

  // Bring the renderer up once per canvas, and take it down with the page.
  useEffect(() => {
    if (!enabled || !canvasRef.current) return undefined;
    let cancelled = false;
    setStatus("loading");
    createSkiaHost(canvasRef.current)
      .then((host) => {
        if (cancelled) {
          host.dispose();
          return;
        }
        hostRef.current = host;
        setStatus("ready");
      })
      .catch((error) => {
        // A missing runtime or a machine without WebGL is a reason to keep
        // drawing the old way, not to lose the page.
        console.warn(
          "Skia renderer unavailable; staying on the 2D path",
          error,
        );
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      hostRef.current?.dispose();
      hostRef.current = null;
      setStatus("idle");
    };
  }, [enabled, canvasRef]);

  // Repaint whenever the engine reports the document or the camera moved.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || status !== "ready" || !engine || !doc) return;
    const stage = stageRef.current;
    if (!stage) return;

    const dpr = window.devicePixelRatio || 1;
    host.resize(stage.clientWidth, stage.clientHeight, dpr);

    const camera = engine.getViewport();
    void host
      .draw({
        docs: [doc],
        axis: "horizontal",
        revision,
        viewport: {
          x: camera.panX,
          y: camera.panY,
          zoom: camera.zoom,
          width: stage.clientWidth,
          height: stage.clientHeight,
          devicePixelRatio: dpr,
        },
        // The engine already decoded every bitmap; asking it again is what
        // keeps the two renderers showing the same picture.
        resolveImageUrl: (node) => engine.getNodeBitmap(node)?.src ?? null,
      })
      .catch((error) => {
        console.warn("Skia frame failed", error);
      });
  }, [status, engine, doc, stageRef, revision]);

  return { status };
}
