import { useDesignStore } from "../store/design_store.js";
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
    const paint = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const dpr = window.devicePixelRatio || 1;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const last = lastDimensionsRef.current;
      if (last.width !== width || last.height !== height || last.dpr !== dpr) {
        lastDimensionsRef.current = { width, height, dpr };
        host.resize(width, height, dpr);
      }
      const camera = engine.getViewport();
      void host.draw({
        docs: [engine.getDocument()],
        axis: "horizontal",
        revision,
        viewport: {
          x: camera.panX, y: camera.panY, ...camera,
          width, height, devicePixelRatio: dpr,
        },
        resolveImageUrl: (node) => engine.getNodeBitmap(node)?.src ?? null,
      }).catch(error => console.warn("Skia frame failed", error));
    };
    // The engine calls listeners after painting chrome, inside the same rAF.
    // Camera-only frames deliberately do not notify React while moving.
    const unsubscribe = engine.subscribeRender(paint);
    paint();
    return unsubscribe;
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
  subscribeCamera = false,
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

  const latestRef = useRef(null);
  latestRef.current = { docs, layouts, camera, revision, spatialIndex, resolveImageUrl, backgroundColor };
  const scheduleRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || status !== "ready" || !stage) return;
    let frame = null;
    const paint = () => {
      frame = null;
      const latest = latestRef.current;
      const dpr = window.devicePixelRatio || 1;
      const width = stage.clientWidth || 1024;
      const height = stage.clientHeight || 768;
      const last = lastDimensionsRef.current;
      if (last.width !== width || last.height !== height || last.dpr !== dpr) {
        lastDimensionsRef.current = { width, height, dpr };
        host.resize(width, height, dpr);
      }
      const cam = (subscribeCamera ? useDesignStore.getState().editorCamera : latest.camera) ?? {};
      const { panX = 0, panY = 0, zoom = 1 } = cam;
      void host.draw({ ...latest, viewport: {
        x: panX, y: panY, panX, panY, zoom, width, height, devicePixelRatio: dpr,
      } }).catch(error => console.warn("Workspace Skia draw failed", error));
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(paint);
    };
    scheduleRef.current = schedule;
    const unsubscribe = subscribeCamera ? useDesignStore.subscribe((state, previous) => {
      if (state.editorCamera !== previous.editorCamera) schedule();
    }) : null;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(stage);
    schedule();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scheduleRef.current = null;
      unsubscribe?.();
      observer?.disconnect();
    };
  }, [status, stageRef, subscribeCamera]);

  useEffect(() => {
    scheduleRef.current?.();
  }, [docs, layouts, camera, revision, spatialIndex, resolveImageUrl, backgroundColor]);

  return { status, host: hostRef.current };
}
