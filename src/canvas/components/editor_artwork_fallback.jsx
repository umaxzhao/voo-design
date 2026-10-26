import PropTypes from "prop-types";
import { useLayoutEffect, useRef } from "react";
import { attachArtboardArtwork } from "../editor/workspace-artwork-routing.js";

/** Media, browser fonts, masks and layered paints keep the engine's compositor. */
export default function EditorArtworkFallback({ engine, opacity = 1 }) {
  const canvasRef = useRef(null);
  useLayoutEffect(() => {
    if (!engine || !canvasRef.current) return undefined;
    const connection = attachArtboardArtwork({ canvas: canvasRef.current, engine });
    return connection.dispose;
  }, [engine]);
  return (
    <canvas
      ref={canvasRef}
      data-testid="editor-artwork-fallback"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}

EditorArtworkFallback.propTypes = {
  engine: PropTypes.object,
  opacity: PropTypes.number,
};
