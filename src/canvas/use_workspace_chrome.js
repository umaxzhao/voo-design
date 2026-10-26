import { useEffect, useRef } from "react";
import { useDesignStore } from "../store/design_store.js";

/** Keep one transparent chrome surface in sync with engine and camera frames. */
export function attachWorkspaceChrome({ canvas, stage, engine, getLayout, store }) {
  const paint = () => {
    const { panX = 0, panY = 0, zoom = 1 } = store.getState().editorCamera ?? {};
    const layout = getLayout();
    // Page engines use local document coordinates; Skia places each page at
    // its workspace layout offset before applying the shared camera.
    engine.renderChrome(canvas, {
      zoom,
      panX: panX + (layout?.x ?? 0) * zoom,
      panY: panY + (layout?.y ?? 0) * zoom,
    }, stage.clientWidth, stage.clientHeight);
  };
  const unsubscribeEngine = engine.subscribeRender(paint);
  const unsubscribeCamera = store.subscribe((state, previous) => {
    if (state.editorCamera !== previous.editorCamera) paint();
  });
  const observer = new ResizeObserver(paint);
  observer.observe(stage);
  window.addEventListener("resize", paint);
  paint();
  return {
    paint,
    dispose() {
      unsubscribeEngine();
      unsubscribeCamera();
      observer.disconnect();
      window.removeEventListener("resize", paint);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Workspace chrome requires a 2D context");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

export function useWorkspaceChrome({ enabled, canvasRef, stageRef, engine, layout }) {
  const layoutRef = useRef(layout);
  const connectionRef = useRef(null);
  layoutRef.current = layout;

  useEffect(() => {
    if (!enabled || !engine || !canvasRef.current || !stageRef.current) return undefined;
    const connection = attachWorkspaceChrome({
      canvas: canvasRef.current,
      stage: stageRef.current,
      engine,
      getLayout: () => layoutRef.current,
      store: useDesignStore,
    });
    connectionRef.current = connection;
    return () => {
      connection.dispose();
      connectionRef.current = null;
    };
  }, [enabled, engine, canvasRef, stageRef]);

  useEffect(() => {
    connectionRef.current?.paint();
  }, [layout?.x, layout?.y]);
}
