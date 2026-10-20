import PropTypes from "prop-types";
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { docToScreenRect } from "../editor/chrome_coords.js";
import { effectivePage } from "../editor/scene_model_geometry.js";
import { getCanvasType } from "../editor/canvas-composition-model.js";
import { useI18n } from "../use_i18n.js";
import { mixedLayerSegments } from "./editor-mixed-layer-segments.js";

export { mixedLayerSegments } from "./editor-mixed-layer-segments.js";

const ThreeSceneViewport = lazy(
  () => import("./editor-3d/three-scene-viewport.jsx"),
);
const EditorCanvasInstances = lazy(
  () => import("./editor_canvas_instances.jsx"),
);
function TwoDimensionalPass({ engine, ids, revision }) {
  const canvasRef = useRef(null);
  useLayoutEffect(() => {
    if (canvasRef.current) engine.renderLayerPass(canvasRef.current, ids);
  }, [engine, ids, revision]);
  return (
    <canvas
      ref={canvasRef}
      data-testid="editor-mixed-2d-pass"
      data-mixed-pass-id={ids.join(",")}
      className="absolute inset-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    />
  );
}

TwoDimensionalPass.propTypes = {
  engine: PropTypes.object.isRequired,
  ids: PropTypes.arrayOf(PropTypes.string).isRequired,
  revision: PropTypes.number.isRequired,
};

/** Each child is its own stacking context, so DOM order matches doc.nodes. */
export default function EditorMixedLayers({
  doc,
  engine,
  resolveCanvas,
  selectedId = null,
  selectedInstanceChild = null,
  active = true,
  onSelectInstanceChild = null,
  adjustingInstanceId = null,
  onInstanceCameraChange = null,
}) {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const [threeInputTargets, setThreeInputTargets] = useState(() => new Map());
  const inputRefs = useRef(new Map());
  const inputRefFor = useCallback((id) => {
    if (!inputRefs.current.has(id)) {
      inputRefs.current.set(id, (element) => {
        setThreeInputTargets((current) => {
          if (current.get(id) === element) return current;
          const next = new Map(current);
          if (element) next.set(id, element);
          else next.delete(id);
          return next;
        });
      });
    }
    return inputRefs.current.get(id);
  }, []);
  useEffect(() => {
    const unsubscribe = engine.subscribeRender(() =>
      setRevision((value) => value + 1),
    );
    setRevision((value) => value + 1);
    return unsubscribe;
  }, [engine]);

  const segments = mixedLayerSegments(doc.nodes);
  const frameDoc = engine.getEvaluatedDocument?.() ?? doc;
  const frameNodes = new Map(frameDoc.nodes.map((node) => [node.id, node]));
  const viewport = engine.getViewport();
  const hostTime = engine.getPlaybackState().time;
  const motionHost = getCanvasType(doc) === "motion";
  const pageRect = docToScreenRect(effectivePage(doc), viewport);
  const selectedInstanceId = active
    ? (selectedId ?? selectedInstanceChild?.instanceId)
    : null;
  const selectedInstance = frameDoc.nodes.find(
    (node) =>
      node.id === selectedInstanceId &&
      node.kind === "canvasInstance" &&
      node.visible !== false &&
      node.instance?.playbackMode !== "video" &&
      getCanvasType(resolveCanvas?.(node.sourceCanvasId)) === "3d",
  );
  const threeInstances = frameDoc.nodes.filter(
    (node) =>
      node.kind === "canvasInstance" &&
      node.visible !== false &&
      node.instance?.playbackMode !== "video" &&
      getCanvasType(resolveCanvas?.(node.sourceCanvasId)) === "3d",
  );

  return (
    <Fragment>
      <div
        data-testid="editor-mixed-layers"
        className="pointer-events-none absolute inset-0 isolate z-30"
        aria-hidden="true"
      >
        <div
          className="pointer-events-none absolute"
          style={{
            left: pageRect.x,
            top: pageRect.y,
            width: pageRect.width,
            height: pageRect.height,
            background: doc.backgroundColor || "transparent",
          }}
        />
        {segments.map((segment, index) => {
          const key = segment.id ?? segment.ids.join(":");
          const threeNodes =
            segment.kind === "3d"
              ? segment.ids
                  .map((id) => frameNodes.get(id))
                  .filter((node) => node && node.visible !== false)
              : [];
          return (
            <div
              key={key}
              className="pointer-events-none absolute inset-0 isolate"
              style={{ zIndex: index + 1 }}
              data-mixed-layer-kind={segment.kind}
              data-mixed-layer-id={segment.id ?? undefined}
            >
              {segment.kind === "2d" ? (
                <TwoDimensionalPass
                  engine={engine}
                  ids={segment.ids}
                  revision={revision}
                />
              ) : segment.kind === "3d" ? (
                <div
                  data-testid="editor-inline-3d"
                  className="pointer-events-none absolute overflow-hidden"
                  style={{
                    left: pageRect.x,
                    top: pageRect.y,
                    width: pageRect.width,
                    height: pageRect.height,
                  }}
                >
                  <Suspense fallback={null}>
                    <ThreeSceneViewport
                      doc={{
                        ...frameDoc,
                        nodes: threeNodes,
                      }}
                      readOnly
                      interactive={false}
                      xyProjection
                    />
                  </Suspense>
                </div>
              ) : segment.kind === "canvasInstance" && resolveCanvas ? (
                <Suspense fallback={null}>
                  <EditorCanvasInstances
                    doc={frameDoc}
                    viewport={viewport}
                    selectedId={selectedId}
                    nodeIds={[segment.id]}
                    interactive={false}
                    threeInputTarget={threeInputTargets.get(segment.id) ?? null}
                    onSelectThreeNode={(instance, sourceNodeId, meta = {}) => {
                      if (!sourceNodeId) {
                        if (!meta.shiftKey && !meta.metaKey && !meta.ctrlKey) {
                          onSelectInstanceChild?.(null);
                          engine.selectExactly([instance.id]);
                        }
                        return;
                      }
                      const isModifier =
                        meta.shiftKey || meta.metaKey || meta.ctrlKey;
                      const isCurrentInstance =
                        selectedInstanceChild?.instanceId === instance.id &&
                        selectedInstanceChild?.sourceCanvasId ===
                          instance.sourceCanvasId;
                      const currentIds = isCurrentInstance
                        ? Array.isArray(selectedInstanceChild.nodeIds) &&
                          selectedInstanceChild.nodeIds.length > 0
                          ? selectedInstanceChild.nodeIds
                          : selectedInstanceChild.nodeId
                            ? [selectedInstanceChild.nodeId]
                            : []
                        : [];
                      let nextIds;
                      if (isModifier && isCurrentInstance) {
                        if (currentIds.includes(sourceNodeId)) {
                          nextIds = currentIds.filter(
                            (id) => id !== sourceNodeId,
                          );
                        } else {
                          nextIds = [...currentIds, sourceNodeId];
                        }
                      } else {
                        nextIds = [sourceNodeId];
                      }
                      if (nextIds.length === 0) {
                        onSelectInstanceChild?.(null);
                      } else {
                        onSelectInstanceChild?.({
                          instanceId: instance.id,
                          sourceCanvasId: instance.sourceCanvasId,
                          nodeId: nextIds[0],
                          nodeIds: nextIds,
                        });
                      }
                    }}
                    resolveCanvas={resolveCanvas}
                    selectedInstanceChild={selectedInstanceChild}
                    adjustingInstanceId={adjustingInstanceId}
                    onInstanceCameraChange={onInstanceCameraChange}
                    hostTime={
                      motionHost ||
                      selectedInstanceChild?.instanceId === segment.id
                        ? hostTime
                        : null
                    }
                  />
                </Suspense>
              ) : null}
            </div>
          );
        })}
      </div>
      {threeInstances.map((instance) => {
        const box =
          instance.instance?.layoutMode === "fill"
            ? { x: 0, y: 0, width: doc.width, height: doc.height }
            : instance;
        const rect = docToScreenRect(box, viewport);
        const selected = selectedInstance?.id === instance.id;
        return (
          <div
            key={instance.id}
            ref={inputRefFor(instance.id)}
            data-testid="editor-three-instance-input"
            data-instance-id={instance.id}
            data-active={selected ? "true" : "false"}
            className={`absolute z-[21] touch-none outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF] ${selected ? "pointer-events-auto" : "pointer-events-none"}`}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              transform: instance.rotation
                ? `rotate(${instance.rotation}deg)`
                : undefined,
            }}
            tabIndex={selected ? 0 : -1}
            aria-hidden={!selected}
            aria-label={
              selected ? instance.name || t("editor.three.scene") : undefined
            }
          />
        );
      })}
    </Fragment>
  );
}

EditorMixedLayers.propTypes = {
  doc: PropTypes.object.isRequired,
  engine: PropTypes.object.isRequired,
  resolveCanvas: PropTypes.func,
  selectedId: PropTypes.string,
  active: PropTypes.bool,
  onSelectInstanceChild: PropTypes.func,
  adjustingInstanceId: PropTypes.string,
  onInstanceCameraChange: PropTypes.func,
  selectedInstanceChild: PropTypes.shape({
    instanceId: PropTypes.string.isRequired,
    sourceCanvasId: PropTypes.string.isRequired,
    nodeId: PropTypes.string.isRequired,
  }),
};
