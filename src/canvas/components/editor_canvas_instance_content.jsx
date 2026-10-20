import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { documentToSvg } from "../editor/editor_svg.js";
import {
  evaluateSceneAtTime,
  normalizeTimeline,
} from "../editor/scene-motion.js";
import { getCanvasType } from "../editor/canvas-composition-model.js";
import { sourceTimeForHost } from "../editor/instance-motion-time.js";
import { applyInstanceOverrides } from "../editor/instance-overrides.js";
import {
  withInstanceCamera,
  withInstanceView,
} from "../editor/instance-view.js";
import { normalizeCornerRadius } from "../editor/scene_model_core.js";
import ThreeSceneViewport from "./editor-3d/three-scene-viewport.jsx";
import { mixedLayerSegments } from "./editor-mixed-layer-segments.js";

function vectorSource(node) {
  const svg = documentToSvg({
    width: Math.max(1, node.width),
    height: Math.max(1, node.height),
    backgroundColor: "transparent",
    nodes: [{ ...node, x: 0, y: 0, rotation: 0 }],
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function sourceSize(sourceDoc) {
  return {
    width: Math.max(1, sourceDoc.width || 1),
    height: Math.max(1, sourceDoc.height || 1),
  };
}

function fitTransform(sourceDoc, targetWidth, targetHeight, layoutMode) {
  const source = sourceSize(sourceDoc);
  const scaleX = targetWidth / source.width;
  const scaleY = targetHeight / source.height;
  if (layoutMode === "fill") {
    return { scaleX, scaleY, left: 0, top: 0 };
  }
  const scale = Math.min(scaleX, scaleY);
  return {
    scaleX: scale,
    scaleY: scale,
    left: (targetWidth - source.width * scale) / 2,
    top: (targetHeight - source.height * scale) / 2,
  };
}

function usePlaybackTime(sourceDoc, enabled, start = 0) {
  const [time, setTime] = useState(start);
  useEffect(() => {
    if (!enabled) return undefined;
    const duration = normalizeTimeline(sourceDoc.timeline).duration;
    let frame = 0;
    let previousTick = 0;
    const startedAt = performance.now();
    const tick = (now) => {
      if (now - previousTick >= 1000 / 30) {
        setTime((start + (now - startedAt) / 1000) % duration);
        previousTick = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, sourceDoc.timeline, start]);
  return time;
}

function SceneLayers({
  doc,
  resolveCanvas,
  visited,
  depth,
  selectedNodeId,
  hostTime,
}) {
  const nodesById = new Map(doc.nodes.map((node) => [node.id, node]));
  return mixedLayerSegments(doc.nodes).flatMap((segment) => {
    if (segment.kind === "3d") {
      return (
        <div
          key={segment.ids.join(":")}
          className="pointer-events-none absolute inset-0"
        >
          <ThreeSceneViewport
            doc={{ ...doc, nodes: segment.ids.map((id) => nodesById.get(id)) }}
            selectedId={
              segment.ids.includes(selectedNodeId) ? selectedNodeId : null
            }
            interactive={false}
            readOnly
            xyProjection
          />
        </div>
      );
    }
    const ids = segment.id ? [segment.id] : segment.ids;
    return ids.map((id) => {
      const node = nodesById.get(id);
      if (node.visible === false || node.kind === "group") return null;
      if (node.kind === "canvasInstance") {
        const nested = resolveCanvas(node.sourceCanvasId);
        if (!nested || visited.has(node.sourceCanvasId)) return null;
        const fullscreen = node.instance?.layoutMode === "fill";
        const box = fullscreen
          ? { x: 0, y: 0, width: doc.width, height: doc.height }
          : node;
        return (
          <div
            key={node.id}
            className="absolute overflow-hidden"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
          >
            <CanvasInstanceContent
              sourceDoc={nested}
              instance={node.instance}
              width={box.width}
              height={box.height}
              resolveCanvas={resolveCanvas}
              visited={new Set([...visited, node.sourceCanvasId])}
              depth={depth + 1}
              hostTime={hostTime}
            />
          </div>
        );
      }
      const commonStyle = {
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        opacity: node.opacity ?? 1,
        transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
      };
      if (node.kind === "video" && node.src) {
        return (
          <video
            key={node.id}
            src={node.src}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            style={{ ...commonStyle, objectFit: "cover" }}
          />
        );
      }
      if (node.kind === "image" && node.src) {
        return (
          <img
            key={node.id}
            src={node.src}
            alt=""
            style={{ ...commonStyle, objectFit: "cover" }}
          />
        );
      }
      if (node.kind === "text") {
        return (
          <div
            key={node.id}
            style={{
              ...commonStyle,
              color: node.fill || "#fff",
              fontFamily: node.fontFamily,
              fontSize: node.fontSize,
              lineHeight: node.lineHeight,
              whiteSpace: "pre-wrap",
            }}
          >
            {node.text}
          </div>
        );
      }
      if (node.kind === "rect" || node.kind === "ellipse") {
        return (
          <div
            key={node.id}
            style={{
              ...commonStyle,
              background: node.fill,
              borderRadius:
                node.kind === "ellipse"
                  ? "50%"
                  : normalizeCornerRadius(node.cornerRadius),
            }}
          />
        );
      }
      if (node.width > 0 && node.height > 0) {
        return (
          <img
            key={node.id}
            src={vectorSource(node)}
            alt=""
            style={commonStyle}
          />
        );
      }
      return null;
    });
  });
}

SceneLayers.propTypes = {
  doc: PropTypes.object.isRequired,
  resolveCanvas: PropTypes.func.isRequired,
  visited: PropTypes.instanceOf(Set).isRequired,
  depth: PropTypes.number.isRequired,
  selectedNodeId: PropTypes.string,
  hostTime: PropTypes.number,
};

export default function CanvasInstanceContent({
  sourceDoc: componentDoc,
  instance,
  width,
  height,
  resolveCanvas,
  visited,
  depth,
  selectedNodeId = null,
  selectedNodeIds = null,
  hostTime = null,
  threeInputTarget = null,
  threeInteractionEnabled = false,
  onSelectThreeNode = null,
  adjustingView = false,
  onInstanceCameraChange = null,
}) {
  // Per-instance overrides of the component's text, colours and visibility.
  const sourceDoc = applyInstanceOverrides(componentDoc, instance);
  const type = getCanvasType(sourceDoc);
  const hasTracks = sourceDoc.nodes.some((node) => node.animations?.length);
  const liveMotion =
    hasTracks &&
    instance?.playbackMode !== "video" &&
    (hostTime !== null || type === "motion" || type === "3d");
  const independentPlayback =
    (type === "motion" || type === "3d") &&
    instance?.playbackMode !== "video" &&
    hostTime === null;
  const independentTime = usePlaybackTime(
    sourceDoc,
    independentPlayback,
    instance?.playbackStart ?? 0,
  );
  const duration = normalizeTimeline(sourceDoc.timeline).duration;
  const time =
    hostTime === null
      ? independentTime
      : sourceTimeForHost(hostTime, duration, instance?.playbackStart ?? 0);
  const evaluated = liveMotion
    ? evaluateSceneAtTime(sourceDoc, time)
    : sourceDoc;
  const selectedNode = evaluated.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  if (instance?.playbackMode === "video" && instance.videoSrc) {
    return (
      <video
        className="h-full w-full"
        src={instance.videoSrc}
        poster={instance.poster || undefined}
        autoPlay
        loop
        muted
        playsInline
        style={{
          objectFit: instance.layoutMode === "fill" ? "cover" : "contain",
        }}
      />
    );
  }
  if (type === "3d") {
    return (
      <ThreeSceneViewport
        doc={withInstanceCamera(
          withInstanceView(evaluated, instance),
          instance,
        )}
        preferProvidedDocument
        selectedId={selectedNodeId}
        selectedIds={
          Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0
            ? selectedNodeIds
            : selectedNodeId
              ? [selectedNodeId]
              : []
        }
        interactive={threeInteractionEnabled || adjustingView}
        inputElement={threeInputTarget}
        allowReadOnlyInteraction={adjustingView}
        onInstanceCameraChange={adjustingView ? onInstanceCameraChange : null}
        onSelect={onSelectThreeNode}
        readOnly
      />
    );
  }
  const source = sourceSize(sourceDoc);
  const fit = fitTransform(sourceDoc, width, height, instance?.layoutMode);
  return (
    <div
      className="absolute origin-top-left overflow-hidden"
      style={{
        left: fit.left,
        top: fit.top,
        width: source.width,
        height: source.height,
        transform: `scale(${fit.scaleX}, ${fit.scaleY})`,
        background: sourceDoc.backgroundColor || "transparent",
      }}
    >
      <SceneLayers
        doc={evaluated}
        resolveCanvas={resolveCanvas}
        visited={visited}
        depth={depth}
        selectedNodeId={selectedNodeId}
        hostTime={hostTime !== null || independentPlayback ? time : null}
      />
      {selectedNode &&
      selectedNode.kind !== "mesh3d" &&
      selectedNode.kind !== "model3d" ? (
        <div
          data-testid="editor-instance-child-selection"
          data-source-node-id={selectedNode.id}
          className="pointer-events-none absolute ring-1 ring-[#E5B2FF]"
          style={{
            left: selectedNode.x,
            top: selectedNode.y,
            width: selectedNode.width,
            height: selectedNode.height,
            transform: selectedNode.rotation
              ? `rotate(${selectedNode.rotation}deg)`
              : undefined,
          }}
        />
      ) : null}
    </div>
  );
}

CanvasInstanceContent.propTypes = {
  sourceDoc: PropTypes.object.isRequired,
  instance: PropTypes.object,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  resolveCanvas: PropTypes.func.isRequired,
  visited: PropTypes.instanceOf(Set).isRequired,
  depth: PropTypes.number.isRequired,
  selectedNodeId: PropTypes.string,
  selectedNodeIds: PropTypes.arrayOf(PropTypes.string),
  hostTime: PropTypes.number,
  threeInputTarget: PropTypes.instanceOf(Element),
  threeInteractionEnabled: PropTypes.bool,
  onSelectThreeNode: PropTypes.func,
  adjustingView: PropTypes.bool,
  onInstanceCameraChange: PropTypes.func,
};
