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

    // The focused artboard outline belongs to the same camera frame as the
    // artwork. Draw it on the chrome canvas instead of a DOM ring so zooming
    // can never leave the border one layout ahead of the canvas.
    // Unbounded roots have no page edge; only explicit Frame layers own bounds.
    if (!engine.getDocument?.()?.isCanvasRoot && layout?.width > 0 && layout?.height > 0) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = stage.clientWidth ? canvas.width / stage.clientWidth : 1;
        const x = panX + layout.x * zoom;
        const y = panY + layout.y * zoom;
        const w = layout.width * zoom;
        const h = layout.height * zoom;
        const radius = Math.max(0, (engine.getDocument?.()?.cornerRadius ?? 0) * zoom);
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "#b2ffd6";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1), Math.min(radius, w / 2, h / 2));
        } else {
          ctx.rect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
        }
        ctx.stroke();
        ctx.restore();
      }
    }
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
