/** Deterministic transparent WebGL layer for one Remotion frame. */
import PropTypes from "prop-types";
import { useLayoutEffect, useMemo, useRef } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { createThreeFrameSession } from "./motion-three-frame.js";

/** WebGL must finish before Remotion screenshots this exact timeline frame. */
export function MotionThreeLayer({ doc, nodes, frame, fps }) {
  const canvasRef = useRef(null);
  const sessionRef = useRef(null);
  const handle = useMemo(
    () => delayRender(`Rendering 3D frame ${frame}`),
    [frame],
  );

  useLayoutEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      cancelRender(new Error("3D canvas is unavailable"));
      return undefined;
    }
    let active = true;
    try {
      if (!sessionRef.current)
        sessionRef.current = createThreeFrameSession(canvas);
      void sessionRef.current.renderFrame(doc, nodes, undefined, frame / fps).then(
        () => {
          if (active) continueRender(handle);
        },
        (error) => {
          if (active) cancelRender(error);
        },
      );
    } catch (error) {
      cancelRender(error);
    }
    return () => {
      active = false;
    };
  }, [doc, nodes, frame, fps, handle]);

  return (
    <canvas
      ref={canvasRef}
      width={doc.width}
      height={doc.height}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

MotionThreeLayer.propTypes = {
  doc: PropTypes.object.isRequired,
  nodes: PropTypes.arrayOf(PropTypes.object).isRequired,
  frame: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
};
