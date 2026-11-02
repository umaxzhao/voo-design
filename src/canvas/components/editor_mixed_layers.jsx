import PropTypes from "prop-types";
import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { docToScreenRect } from "../editor/chrome_coords.js";
import { effectivePage } from "../editor/scene_model_geometry.js";
import { mixedLayerSegments } from "./editor-mixed-layer-segments.js";

export { mixedLayerSegments } from "./editor-mixed-layer-segments.js";

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
  onSelectInstanceChild = null,
}) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribe = engine.subscribeRender(() =>
      setRevision((value) => value + 1),
    );
    setRevision((value) => value + 1);
    return unsubscribe;
  }, [engine]);

  const segments = mixedLayerSegments(doc.nodes);
  const viewport = engine.getViewport();
  const pageRect = docToScreenRect(effectivePage(doc), viewport);
  const onSelectInstance = useCallback(
    (instance) => onSelectInstanceChild?.(null) ?? engine.selectExactly([instance.id]),
    [engine, onSelectInstanceChild],
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
        {segments.map((segment, index) => (
          <div
            key={segment.id ?? segment.ids.join(":")}
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
            ) : segment.kind === "canvasInstance" && resolveCanvas ? (
              <Suspense fallback={null}>
                <EditorCanvasInstances
                  doc={doc}
                  viewport={viewport}
                  selectedId={selectedId}
                  selectedInstanceChild={selectedInstanceChild}
                  nodeIds={[segment.id]}
                  interactive={false}
                  resolveCanvas={resolveCanvas}
                  onSelect={onSelectInstance}
                />
              </Suspense>
            ) : null}
          </div>
        ))}
      </div>
    </Fragment>
  );
}

EditorMixedLayers.propTypes = {
  doc: PropTypes.object.isRequired,
  engine: PropTypes.object.isRequired,
  resolveCanvas: PropTypes.func,
  selectedId: PropTypes.string,
  selectedInstanceChild: PropTypes.object,
  onSelectInstanceChild: PropTypes.func,
};
