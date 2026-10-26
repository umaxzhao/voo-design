import { useDesignStore } from "../store/design_store.js";
import { useEffect, useRef, useState } from "react";
import { createSkiaHost } from "./editor/skia_host.js";
import { WORKSPACE_BACKGROUND } from "./editor/render_canvas_base.js";
import { THEME_CHANGED_EVENT } from "./theme_events.js";

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
      // doc/revision trigger React resubscription, but may lag engine edits.
      // Read document and camera together from the live engine in this rAF so
      // artwork stays in sync with chrome, even before React receives the update.
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
    const onWindowResize = () => paint();
    // jsdom-style harnesses expose a partial window; the listeners are opt-in.
    window.addEventListener?.("resize", onWindowResize);
    let dprQuery = null;
    const watchDpr = () => {
      if (typeof window.matchMedia !== "function") return;
      dprQuery?.removeEventListener?.("change", onDprChange);
      dprQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      );
      dprQuery?.addEventListener?.("change", onDprChange);
    };
    const onDprChange = () => {
      watchDpr();
      paint();
    };
    watchDpr();
    paint();
    return () => {
      unsubscribe();
      window.removeEventListener?.("resize", onWindowResize);
      dprQuery?.removeEventListener?.("change", onDprChange);
    };
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
  backgroundColor = null,
  liveEngine = null,
  livePageId = null,
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
  latestRef.current = { docs, layouts, camera, revision, spatialIndex, resolveImageUrl, backgroundColor, liveEngine, livePageId };
  const scheduleRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || status !== "ready" || !stage) return;
    let frame = null;
    // `cameraOverride` is the exact camera the store just published, so the
    // canvas and the DOM overlay (synced from the same store event) share it.
    const paint = (cameraOverride) => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const liveStage = stageRef.current;
      if (!liveStage) return;
      const latest = latestRef.current;
      const dpr = window.devicePixelRatio || 1;
      const width = liveStage.clientWidth || 1024;
      const height = liveStage.clientHeight || 768;
      const last = lastDimensionsRef.current;
      if (last.width !== width || last.height !== height || last.dpr !== dpr) {
        lastDimensionsRef.current = { width, height, dpr };
        host.resize(width, height, dpr);
      }
      const live = cameraOverride?.zoom !== undefined ? cameraOverride : null;
      const cam = (live ?? (subscribeCamera ? useDesignStore.getState().editorCamera : latest.camera)) ?? {};
      const { panX = 0, panY = 0, zoom = 1 } = cam;
      const editor = liveStage.closest?.('[data-testid="design-editor"]');
      const themeBackground = editor && window.getComputedStyle?.(editor).backgroundColor;
      const ground = latest.backgroundColor ??
        (themeBackground && themeBackground !== "rgba(0, 0, 0, 0)" ? themeBackground : WORKSPACE_BACKGROUND);
      // Drag previews replace the engine document without a React notification.
      // Read the same live document that paints selection chrome in this frame.
      const liveDoc = latest.liveEngine?.getDocument?.();
      const priorDoc = latest.docs.find((doc) => doc.id === latest.livePageId);
      const liveDocs = liveDoc && priorDoc
        ? latest.docs.map((doc) => doc === priorDoc ? { ...liveDoc, id: doc.id } : doc)
        : latest.docs;
      const liveIndex = liveDoc && priorDoc?.nodes !== liveDoc.nodes ? null : latest.spatialIndex;
      void host.draw({ ...latest, docs: liveDocs, spatialIndex: liveIndex, backgroundColor: ground, viewport: {
        x: panX, y: panY, panX, panY, zoom, width, height, devicePixelRatio: dpr,
      } }).catch(error => console.warn("Workspace Skia draw failed", error));
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(() => paint());
    };
    scheduleRef.current = schedule;
    // Camera changes already arrive coalesced to one per frame (camera_raf.js),
    // and the DOM overlay transform is applied in its own store subscriber in
    // the same tick. Paint synchronously here: deferring to another rAF would
    // show the artboard one frame behind the frame outline, labels and handles.
    const unsubscribe = subscribeCamera ? useDesignStore.subscribe((state, previous) => {
      if (state.editorCamera !== previous.editorCamera) paint(state.editorCamera);
    }) : null;
    const unsubscribeEngine = liveEngine?.subscribeRender?.(() => paint());
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(stage);
    // A DPR change (moving the window between displays) and a plain window
    // resize must resize the surface even when neither the document nor the
    // camera changed.
    const onWindowResize = () => schedule();
    window.addEventListener?.("resize", onWindowResize);
    window.addEventListener?.(THEME_CHANGED_EVENT, schedule);
    let dprQuery = null;
    const onDprChange = () => {
      watchDpr();
      schedule();
    };
    const watchDpr = () => {
      if (typeof window.matchMedia !== "function") return;
      dprQuery?.removeEventListener?.("change", onDprChange);
      dprQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      );
      dprQuery?.addEventListener?.("change", onDprChange);
    };
    watchDpr();
    schedule();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scheduleRef.current = null;
      unsubscribe?.();
      unsubscribeEngine?.();
      observer?.disconnect();
      window.removeEventListener?.("resize", onWindowResize);
      window.removeEventListener?.(THEME_CHANGED_EVENT, schedule);
      dprQuery?.removeEventListener?.("change", onDprChange);
    };
  }, [status, stageRef, subscribeCamera, liveEngine]);

  useEffect(() => {
    scheduleRef.current?.();
  }, [docs, layouts, camera, revision, spatialIndex, resolveImageUrl, backgroundColor]);

  return { status, host: hostRef.current };
}
