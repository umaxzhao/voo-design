import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { useRef } from "react";
import { getNodeSpatial } from "../editor/canvas-composition-model.js";
import { docToScreenRect } from "../editor/chrome_coords.js";
import { getInstanceView, setInstanceView } from "../editor/instance-view.js";
import { patchThreeSceneNode } from "../editor/three-scene-node-patch.js";
import { AXIS_COLORS } from "../editor/three-scene-view-axes.js";

const DEGREES_PER_PIXEL = 0.5;
const SNAP_DEGREES = 15;
const MIN_RADIUS = 36;
const FLATTEN = 0.32;
const HIT_WIDTH = 16;
const css = (color) => `#${color.toString(16).padStart(6, "0")}`;
const ringClipPolygons = (cx, cy, rx, ry) => {
  const steps = 72;
  const innerRx = Math.max(0, rx - HIT_WIDTH / 2);
  const innerRy = Math.max(0, ry - HIT_WIDTH / 2);
  return Array.from({ length: steps }, (_, index) => {
    const overlap = Math.PI / steps / 2;
    const start = (index * Math.PI * 2) / steps - overlap;
    const end = ((index + 1) * Math.PI * 2) / steps + overlap;
    const points = [
      [rx + HIT_WIDTH / 2, ry + HIT_WIDTH / 2, start],
      [rx + HIT_WIDTH / 2, ry + HIT_WIDTH / 2, end],
      [innerRx, innerRy, end],
      [innerRx, innerRy, start],
    ].map(([pointRx, pointRy, angle]) => {
      const x = cx + Math.cos(angle) * pointRx;
      const y = cy + Math.sin(angle) * pointRy;
      return `${x}px ${y}px`;
    });
    return `polygon(${points.join(", ")})`;
  });
};

const snap = (value, event) =>
  event.shiftKey ? Math.round(value / SNAP_DEGREES) * SNAP_DEGREES : value;
const angleOf = (cx, cy, event) =>
  (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;

/** The angle the rings edit: the node's own, or an instance's own view. */
function readAngle(node, field) {
  return node.kind === "canvasInstance"
    ? getInstanceView(node.instance)[field]
    : getNodeSpatial(node)[field];
}

function writeAngle(engine, node, field, value) {
  if (node.kind !== "canvasInstance") {
    patchThreeSceneNode(engine, node.id, { [field]: value });
    return;
  }
  const current = engine.getSelected() ?? node;
  engine.updateNode(
    node.id,
    { instance: setInstanceView(current.instance, { [field]: value }) },
    { commit: false },
  );
}

/**
 * Rotation rings drawn on a 3D object inside a Design or Motion frame, so it
 * can be turned in place. On an instance of a 3D frame the rings set that
 * instance's own view and leave the main component untouched. The green ring turns it about Y (drag sideways), the
 * red about X (drag up or down), and the blue ring about Z (drag around).
 * Shift snaps to 15 degrees. One drag is one undo step.
 */
export default function EditorObject3dGizmo({
  engine,
  node,
  viewport,
  containerSize,
  portalOffset,
  portalTarget,
  interactive = true,
}) {
  const dragRef = useRef(null);
  if (!engine || !node || !portalTarget) return null;
  const rect = docToScreenRect(node, viewport);
  const radius = Math.max(
    MIN_RADIUS,
    (Math.max(rect.width, rect.height) / 2) * 1.05,
  );
  const size = radius * 2 + HIT_WIDTH * 2;
  const centre = size / 2;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const requestedLeft = cx - centre - portalOffset.x;
  const requestedTop = cy - centre - portalOffset.y;
  const left =
    containerSize.width >= size
      ? Math.min(Math.max(0, requestedLeft), containerSize.width - size)
      : requestedLeft;
  const top =
    containerSize.height >= size
      ? Math.min(Math.max(0, requestedTop), containerSize.height - size)
      : requestedTop;

  const begin = (field) => (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
    svg.setAttribute("data-drag-field", field);
    dragRef.current = {
      field,
      startValue: readAngle(engine.getSelected() ?? node, field),
      startX: event.clientX,
      startY: event.clientY,
      startAngle: angleOf(
        svg.getBoundingClientRect().left + centre,
        svg.getBoundingClientRect().top + centre,
        event,
      ),
      moved: false,
    };
  };
  const move = (event) => {
    const drag = dragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId))
      return;
    const box = (
      event.currentTarget.ownerSVGElement ?? event.currentTarget
    ).getBoundingClientRect();
    let delta;
    if (drag.field === "rotationY") {
      delta = (event.clientX - drag.startX) * DEGREES_PER_PIXEL;
    } else if (drag.field === "rotationX") {
      delta = (event.clientY - drag.startY) * DEGREES_PER_PIXEL;
    } else {
      delta =
        angleOf(box.left + centre, box.top + centre, event) - drag.startAngle;
    }
    drag.moved = true;
    const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
    svg.setAttribute("data-drag-angle", String(drag.startValue + delta));
    writeAngle(engine, node, drag.field, snap(drag.startValue + delta, event));
  };
  const end = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag?.moved) engine.commit("editor.history.entry.layer");
  };

  const ring = (field, axis, props) => (
    <ellipse
      key={field}
      cx={centre}
      cy={centre}
      fill="none"
      stroke={css(AXIS_COLORS[axis])}
      strokeWidth={2}
      pointerEvents="none"
      {...props}
    />
  );

  const ringHandle = (field, axis, rx, ry) =>
    ringClipPolygons(centre, centre, rx, ry).map((clipPath, index) => (
      <div
        key={`${field}-${index}`}
        data-testid={`editor-object3d-ring-${axis}`}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute z-40 cursor-grab active:cursor-grabbing"
        style={{
          left,
          top,
          width: size,
          height: size,
          pointerEvents: interactive ? "auto" : "none",
          clipPath,
        }}
        onPointerDown={begin(field)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    ));

  return createPortal(
    <>
      <svg
        data-testid="editor-object3d-gizmo"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        pointerEvents="none"
        className="pointer-events-none absolute z-40 overflow-visible"
        style={{ left, top }}
      >
        {ring("rotationZ", "z", { rx: radius, ry: radius })}
        {ring("rotationY", "y", { rx: radius, ry: radius * FLATTEN })}
        {ring("rotationX", "x", { rx: radius * FLATTEN, ry: radius })}
      </svg>
      {interactive
        ? [
            ringHandle("rotationZ", "z", radius, radius),
            ringHandle("rotationY", "y", radius, radius * FLATTEN),
            ringHandle("rotationX", "x", radius * FLATTEN, radius),
          ]
        : null}
    </>,
    portalTarget,
  );
}

EditorObject3dGizmo.propTypes = {
  engine: PropTypes.object,
  node: PropTypes.object,
  viewport: PropTypes.shape({
    zoom: PropTypes.number,
    panX: PropTypes.number,
    panY: PropTypes.number,
  }).isRequired,
  containerSize: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number,
  }).isRequired,
  portalOffset: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
  }).isRequired,
  portalTarget: PropTypes.instanceOf(Element),
  interactive: PropTypes.bool,
};
