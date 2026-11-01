import PropTypes from "prop-types";
import { useLayoutEffect, useRef } from "react";
import { attachArtboardArtwork } from "../editor/workspace-artwork-routing.js";
import { useDesignStore } from "../../store/design_store.js";

/** Media, browser fonts, masks and layered paints keep the engine's compositor. */
export default function EditorArtworkFallback({ engine, opacity = 1, includeFrame = false, paintArtwork = true, tool }) {
  const canvasRef = useRef(null);
  const connectionRef = useRef(null);
  const canvasRoot = engine?.getDocument?.()?.isCanvasRoot === true;
  useLayoutEffect(() => {
    if (!engine || !canvasRef.current) return undefined;
    const connection = attachArtboardArtwork({ canvas: canvasRef.current, engine, includeFrame, paintArtwork, store: useDesignStore });
    connectionRef.current = connection;
    return () => { connection.dispose(); connectionRef.current = null; };
  }, [engine, includeFrame, paintArtwork, canvasRoot]);
  // Tool changes notify React without painting the detached page engine.
  // Refresh the hit plane while retaining its bounded artwork cache.
  useLayoutEffect(() => { if (tool !== undefined) connectionRef.current?.paint(false); }, [tool]);
  return (
    <canvas
      ref={canvasRef}
      data-testid={paintArtwork ? "editor-artwork-fallback" : "editor-free-pointer-surface"}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}

EditorArtworkFallback.propTypes = {
  engine: PropTypes.object,
  opacity: PropTypes.number,
  includeFrame: PropTypes.bool,
  paintArtwork: PropTypes.bool,
  tool: PropTypes.string,
};
