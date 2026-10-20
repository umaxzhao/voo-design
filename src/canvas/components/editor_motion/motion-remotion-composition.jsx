import PropTypes from "prop-types";
import { useLayoutEffect, useRef } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
} from "remotion";
import { applyInstanceOverrides } from "../../editor/instance-overrides.js";
import {
  withInstanceCamera,
  withInstanceView,
} from "../../editor/instance-view.js";
import { audioGainFrames } from "./audio-envelope.js";
import { evaluateSceneAtTime } from "../../editor/scene-motion.js";
import { drawNode } from "../../editor/scene_renderer.js";
import { normalizeCornerRadius } from "../../editor/scene_model_core.js";
import { mixedRenderSegments } from "./motion-mixed-segments.js";
import { MotionThreeLayer } from "./motion-remotion-three.jsx";

const MAX_NESTING = 8;

function layerStyle(node) {
  return {
    position: "absolute",
    boxSizing: "border-box",
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    opacity: node.opacity ?? 1,
    transform: `rotate(${node.rotation ?? 0}deg)`,
    transformOrigin: "center center",
  };
}

function videoRange(node, fps, totalFrames) {
  const media = node.media ?? {};
  const start = Math.max(0, node.timing?.start ?? 0);
  const from = Math.min(totalFrames - 1, Math.ceil(start * fps));
  const sourceLength = Number.isFinite(media.outPoint)
    ? Math.max(0, (media.outPoint - (media.inPoint ?? 0)) / (media.speed ?? 1))
    : Infinity;
  const end = Math.min(node.timing?.end ?? Infinity, start + sourceLength);
  const to = Number.isFinite(end)
    ? Math.min(totalFrames, Math.ceil(end * fps))
    : totalFrames;
  return { from, durationInFrames: Math.max(1, to - from) };
}

function MotionLayer({ node, fps, durationInFrames }) {
  const style = layerStyle(node);
  if (node.kind === "rect" || node.kind === "ellipse") {
    return (
      <div
        style={{
          ...style,
          background: node.fill,
          borderRadius:
            node.kind === "ellipse"
              ? "50%"
              : normalizeCornerRadius(node.cornerRadius),
          border:
            node.strokeWidth > 0
              ? `${node.strokeWidth}px solid ${node.stroke}`
              : undefined,
        }}
      />
    );
  }
  if (node.kind === "text") {
    return (
      <div
        style={{
          ...style,
          color: node.fill,
          fontSize: node.fontSize,
          fontFamily: node.fontFamily,
          fontWeight: node.fontWeight,
          textAlign: node.align ?? "left",
          lineHeight: node.lineHeight,
          letterSpacing: node.letterSpacing,
          whiteSpace: "pre-wrap",
        }}
      >
        {node.text}
      </div>
    );
  }
  if (node.kind === "image") {
    return <Img src={node.src} style={{ ...style, objectFit: "cover" }} />;
  }
  if (node.kind === "audio") {
    // Sound has no picture: the sequence carries its own span and its own
    // in-point, and nothing needs a box because it draws nothing.
    const media = node.media ?? {};
    const range = videoRange(node, fps, durationInFrames);
    return (
      <Sequence
        from={range.from}
        durationInFrames={range.durationInFrames}
        layout="none"
      >
        <Audio
          src={node.src}
          trimBefore={Math.round((media.inPoint ?? 0) * fps)}
          playbackRate={media.speed ?? 1}
          volume={audioGainFrames(media, fps, range.durationInFrames)}
        />
      </Sequence>
    );
  }
  if (node.kind === "video") {
    const media = node.media ?? {};
    const range = videoRange(node, fps, durationInFrames);
    return (
      <Sequence from={range.from} durationInFrames={range.durationInFrames}>
        <OffthreadVideo
          src={node.src}
          trimBefore={Math.round((media.inPoint ?? 0) * fps)}
          playbackRate={media.speed ?? 1}
          volume={media.muted ? 0 : (media.volume ?? 1)}
          style={{ ...style, objectFit: "cover" }}
        />
      </Sequence>
    );
  }
  throw new TypeError(`Unsupported Motion layer: ${node.kind}`);
}

MotionLayer.propTypes = {
  node: PropTypes.object.isRequired,
  fps: PropTypes.number.isRequired,
  durationInFrames: PropTypes.number.isRequired,
};

function MotionVectorLayer({ node, doc }) {
  const canvasRef = useRef(null);
  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) throw new Error("2D vector canvas is unavailable");
    context.clearRect(0, 0, doc.width, doc.height);
    drawNode(context, node, () => null, null, null, false);
  }, [node, doc.width, doc.height]);
  return (
    <canvas
      ref={canvasRef}
      width={doc.width}
      height={doc.height}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

MotionVectorLayer.propTypes = {
  node: PropTypes.object.isRequired,
  doc: PropTypes.object.isRequired,
};

function wrapTime(time, duration) {
  return ((time % duration) + duration) % duration;
}

function CanvasInstanceLayer({
  node,
  doc,
  canvases,
  time,
  frame,
  fps,
  visited,
}) {
  const instance = node.instance ?? {};
  const fill = instance.layoutMode === "fill";
  const box = fill
    ? { x: 0, y: 0, width: doc.width, height: doc.height }
    : node;
  const style = {
    ...layerStyle({ ...node, ...box }),
    overflow: "hidden",
  };
  if (instance.playbackMode === "video") {
    if (!instance.videoSrc)
      throw new Error(`Rendered canvas video is missing: ${node.id}`);
    const sourceDuration =
      canvases[node.sourceCanvasId]?.timeline?.duration ??
      doc.timeline?.duration ??
      5;
    const sourceTime = wrapTime(
      time + (instance.playbackStart ?? 0),
      sourceDuration,
    );
    const timeShift = Math.round((time - sourceTime) * fps);
    return (
      <div style={style}>
        <Sequence from={timeShift} layout="none">
          <OffthreadVideo
            src={instance.videoSrc}
            volume={instance.muted ? 0 : 1}
            style={{
              width: "100%",
              height: "100%",
              objectFit: fill ? "cover" : "contain",
            }}
          />
        </Sequence>
      </div>
    );
  }
  const rawSource = canvases[node.sourceCanvasId];
  if (!rawSource)
    throw new Error(`Canvas source is missing: ${node.sourceCanvasId}`);
  const source = withInstanceCamera(
    withInstanceView(
      applyInstanceOverrides(rawSource, node.instance),
      node.instance,
    ),
    node.instance,
  );
  if (visited.has(node.sourceCanvasId) || visited.size >= MAX_NESTING)
    throw new Error(
      `Canvas instance nesting is invalid: ${node.sourceCanvasId}`,
    );
  const scaleX = box.width / source.width;
  const scaleY = box.height / source.height;
  const scale = Math.min(scaleX, scaleY);
  const transform = fill
    ? { x: 0, y: 0, scaleX, scaleY }
    : {
        x: (box.width - source.width * scale) / 2,
        y: (box.height - source.height * scale) / 2,
        scaleX: scale,
        scaleY: scale,
      };
  const duration = source.timeline?.duration ?? 5;
  const sourceTime = wrapTime(time + (instance.playbackStart ?? 0), duration);
  const timeShift = Math.round((time - sourceTime) * fps);
  return (
    <div style={style}>
      <div
        style={{
          position: "absolute",
          left: transform.x,
          top: transform.y,
          width: source.width,
          height: source.height,
          transformOrigin: "top left",
          transform: `scale(${transform.scaleX}, ${transform.scaleY})`,
        }}
      >
        <Sequence from={timeShift} layout="none">
          <SceneLayers
            doc={source}
            canvases={canvases}
            time={sourceTime}
            frame={frame}
            fps={fps}
            visited={new Set([...visited, node.sourceCanvasId])}
          />
        </Sequence>
      </div>
    </div>
  );
}

CanvasInstanceLayer.propTypes = {
  node: PropTypes.object.isRequired,
  doc: PropTypes.object.isRequired,
  canvases: PropTypes.object.isRequired,
  time: PropTypes.number.isRequired,
  frame: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  visited: PropTypes.instanceOf(Set).isRequired,
};

function SceneLayers({ doc, canvases, time, frame, fps, visited }) {
  const evaluated = evaluateSceneAtTime(doc, time);
  return (
    <div
      style={{
        position: "relative",
        width: doc.width,
        height: doc.height,
        overflow: "hidden",
        backgroundColor: doc.backgroundColor,
      }}
    >
      {mixedRenderSegments(evaluated.nodes).map((segment) => {
        if (segment.kind === "3d") {
          return (
            <MotionThreeLayer
              key={segment.nodes[0].id}
              doc={evaluated}
              nodes={segment.nodes}
              frame={frame}
              fps={fps}
            />
          );
        }
        const { node } = segment;
        if (node.kind === "canvasInstance") {
          return (
            <CanvasInstanceLayer
              key={node.id}
              node={node}
              doc={doc}
              canvases={canvases}
              time={time}
              frame={frame}
              fps={fps}
              visited={visited}
            />
          );
        }
        if (node.kind === "path" || node.kind === "boolean") {
          return <MotionVectorLayer key={node.id} node={node} doc={doc} />;
        }
        return (
          <MotionLayer
            key={node.id}
            node={node}
            fps={fps}
            durationInFrames={Math.ceil((doc.timeline?.duration ?? 5) * fps)}
          />
        );
      })}
    </div>
  );
}

SceneLayers.propTypes = {
  doc: PropTypes.object.isRequired,
  canvases: PropTypes.object.isRequired,
  time: PropTypes.number.isRequired,
  frame: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  visited: PropTypes.instanceOf(Set).isRequired,
};

/** The scene graph uses one frame clock for every nested surface. */
export function MotionRemotionComposition(props) {
  const frame = useCurrentFrame();
  if (props.captureSrc) {
    return (
      <AbsoluteFill>
        <OffthreadVideo
          src={props.captureSrc}
          style={{ width: "100%", height: "100%", objectFit: "fill" }}
        />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: props.backgroundColor }}>
      <SceneLayers
        doc={props}
        canvases={props.canvases ?? {}}
        time={frame / props.fps}
        frame={frame}
        fps={props.fps}
        visited={new Set(props.canvasId ? [props.canvasId] : [])}
      />
    </AbsoluteFill>
  );
}

MotionRemotionComposition.propTypes = {
  canvasId: PropTypes.string,
  nodes: PropTypes.arrayOf(PropTypes.object).isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  durationInFrames: PropTypes.number.isRequired,
  backgroundColor: PropTypes.string.isRequired,
  canvases: PropTypes.object,
  captureSrc: PropTypes.string,
};
