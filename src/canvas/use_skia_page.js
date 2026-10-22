import { useEffect, useRef, useState } from "react";
import { createSkiaHost } from "./editor/skia_host.js";

/**
 * Paints one editor page through Skia instead of the 2D canvas (full mode / single page).
 *
 * Only the painting moves. The engine still owns the document, the tools, the
 * viewport and hit-testing, and still reports every change — this hook just
 * draws what it reports.
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
  const lastDimensionsRef = useRef({ width: 0, height: 0, dpr: 0 });

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
      lastDimensionsRef.current = { width: 0, height: 0, dpr: 0 };
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
    const width = stage.clientWidth;
    const height = stage.clientHeight;

    // Only resize when physical pixel dimensions change; never recreate surface during pan/zoom
    const last = lastDimensionsRef.current;
    if (last.width !== width || last.height !== height || last.dpr !== dpr) {
      lastDimensionsRef.current = { width, height, dpr };
      host.resize(width, height, dpr);
    }

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
          panX: camera.panX,
          panY: camera.panY,
          width,
          height,
          devicePixelRatio: dpr,
        },
        resolveImageUrl: (node) => engine.getNodeBitmap(node)?.src ?? null,
      })
      .catch((error) => {
        console.warn("Skia frame failed", error);
      });
  }, [status, engine, doc, stageRef, revision]);

  return { status, host: hostRef.current };
}

/**
 * Unified Single Workspace Skia hook.
 *
 * Renders all artboards and documents into a single WebGL/Skia surface backed
 * by @voo/canvas-core. Camera pan/zoom is driven purely by 3x3 matrix transforms
 * in Skia viewport without recreating GPU surfaces.
 */
export function useWorkspaceSkia({
  enabled = true,
  canvasRef,
  stageRef,
  docs = [],
  layouts = null,
  camera = null,
  revision = 0,
  spatialIndex = null,
  resolveImageUrl = null,
  backgroundColor = "#1c1c1c",
}) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const lastDimensionsRef = useRef({ width: 0, height: 0, dpr: 0 });

  // Initialize single Skia host on the workspace canvas (1 WebGL context)
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
        console.warn(
          "Workspace Skia renderer unavailable; fallback to individual rendering",
          error,
        );
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      hostRef.current?.dispose();
      hostRef.current = null;
      lastDimensionsRef.current = { width: 0, height: 0, dpr: 0 };
      setStatus("idle");
    };
  }, [enabled, canvasRef]);

  // Handle stage container resize strictly when container dimensions change
  useEffect(() => {
    const host = hostRef.current;
    if (!host || status !== "ready") return;
    const stage = stageRef.current;
    if (!stage) return;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const last = lastDimensionsRef.current;
      if (last.width !== width || last.height !== height || last.dpr !== dpr) {
        lastDimensionsRef.current = { width, height, dpr };
        host.resize(width, height, dpr);
      }
    };

    syncSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => syncSize());
      observer.observe(stage);
      return () => observer.disconnect();
    }
    return undefined;
  }, [status, stageRef]);

  // Repaint on camera transform, document changes, or spatial updates
  useEffect(() => {
    const host = hostRef.current;
    if (!host || status !== "ready" || !docs || docs.length === 0) return;
    const stage = stageRef.current;
    if (!stage) return;

    const dpr = window.devicePixelRatio || 1;
    const width = stage.clientWidth || 1024;
    const height = stage.clientHeight || 768;

    const panX = camera?.panX || 0;
    const panY = camera?.panY || 0;
    const zoom = camera?.zoom || 1;

    void host
      .draw({
        docs,
        layouts,
        viewport: {
          x: panX,
          y: panY,
          zoom,
          panX,
          panY,
          width,
          height,
          devicePixelRatio: dpr,
        },
        revision,
        spatialIndex,
        resolveImageUrl,
        backgroundColor,
      })
      .catch((error) => {
        console.warn("Workspace Skia draw failed", error);
      });
  }, [
    status,
    docs,
    layouts,
    camera?.panX,
    camera?.panY,
    camera?.zoom,
    revision,
    spatialIndex,
    resolveImageUrl,
    backgroundColor,
    stageRef,
  ]);

  return { status, host: hostRef.current };
}
