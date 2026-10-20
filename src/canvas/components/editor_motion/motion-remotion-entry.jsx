import { Composition, registerRoot } from "remotion";
import { MotionRemotionComposition } from "./motion-remotion-composition.jsx";
import { MOTION_REMOTION_COMPOSITION_ID } from "./motion-remotion-props.js";

const DEFAULT_PROPS = {
  width: 640,
  height: 360,
  fps: 30,
  durationInFrames: 150,
  backgroundColor: "#000000",
  canvasType: "motion",
  timeline: { duration: 5, fps: 30 },
  nodes: [],
  canvases: {},
  captureSrc: null,
};

function motionMetadata({ props }) {
  return {
    width: props.width,
    height: props.height,
    fps: props.fps,
    durationInFrames: props.durationInFrames,
  };
}

function MotionRemotionRoot() {
  return (
    <Composition
      id={MOTION_REMOTION_COMPOSITION_ID}
      component={MotionRemotionComposition}
      width={DEFAULT_PROPS.width}
      height={DEFAULT_PROPS.height}
      fps={DEFAULT_PROPS.fps}
      durationInFrames={DEFAULT_PROPS.durationInFrames}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={motionMetadata}
    />
  );
}

registerRoot(MotionRemotionRoot);
