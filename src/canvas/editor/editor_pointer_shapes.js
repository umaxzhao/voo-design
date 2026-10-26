/**
 * Vector shape, text, and arrow/line pointer gestures for the editor stage.
 *
 * Extracted from editor_pointer.js and editor_pointer_drawing.js.
 */

import * as ops from "./doc_ops.js";
import { NODE_KIND, createPathNode } from "./scene_model.js";
import {
  absolutePathEndpoints,
  polygonNodeFromBox,
  starNodeFromBox,
} from "./shape_geometry.js";
import { normaliseRect } from "./scene_geometry.js";
import { TOOL } from "./editor_constants.js";
import { commitEditorAction } from "../undo-action-contracts.js";

/**
 * One text-tool drag step, in document space.
 *
 * A drag past the 4px click threshold fixes the wrap column — Figma's area
 * text — and the box normalises, so a leftward or upward drag still yields a
 * box anchored at its top-left corner instead of one that grows the wrong way
 * from the press point. The drag height is deliberately ignored: an area-text
 * box is auto-height (it grows with the lines), so the height the user drags
 * must never drive the font size the way the old code did. A click or a
 * vertical-only drag leaves point text untouched (auto width, the press point
 * as origin), matching the pre-box era and Figma's click behaviour.
 */
export function textBoxDrag(start, point, { zoom = 1 } = {}) {
  const width = point.x - start.x;
  const height = point.y - start.y;
  // Screen-constant ~4px click threshold (matches move DRAG_SLOP_PX).
  const clickThreshold = 4 / Math.max(Number(zoom) || 1, 1e-6);
  if (Math.abs(width) < clickThreshold) return null;
  const boxWidth = Math.round(Math.abs(width));
  return {
    patch: {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      boxWidth,
    },
    draftRect: {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: boxWidth,
      height: Math.abs(height),
    },
  };
}

/** A node drawn from `point` joins the frame the drag starts inside. */
function insideFrame(doc, node, point) {
  const frame = ops.frameAtPoint(doc, point);
  return frame ? { ...node, parentId: frame.id } : node;
}

export function createShapesPointerGestures({
  api,
  getGesture,
  setGesture,
}) {
  function startArrow(event, { line = false } = {}) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const node = createPathNode({
      points: [
        [point.x, point.y],
        [point.x, point.y],
      ],
      stroke: api.getColor(),
      strokeWidth: api.getPenStrokeWidth?.() ?? 2,
      strokeDash: api.getShapeStrokeDash?.() ?? "solid",
      ...(line
        ? { line: true }
        : {
            arrow: true,
            arrowSize: api.getArrowSize?.() ?? 12,
            arrowStart: api.getArrowStart?.() ?? false,
            arrowEnd: api.getArrowEnd?.() ?? true,
          }),
    });
    api.setDoc(
      ops.addNode(api.getDocument(), insideFrame(api.getDocument(), node, point)),
      { commit: false },
    );
    api.select(node.id);
    setGesture({ kind: "arrow", id: node.id, start: point, node, line });
  }

  function dragArrow(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    let dx = point.x - gesture.start.x;
    let dy = point.y - gesture.start.y;
    // Shift snaps the arrow to the eight compass directions.
    if (event.shiftKey) {
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.hypot(dx, dy);
      dx = Math.cos(snapped) * length;
      dy = Math.sin(snapped) * length;
    }
    const startX = event.altKey ? gesture.start.x - dx : gesture.start.x;
    const startY = event.altKey ? gesture.start.y - dy : gesture.start.y;
    const next = createPathNode({
      points: [
        [startX, startY],
        [gesture.start.x + dx, gesture.start.y + dy],
      ],
      stroke: gesture.node.stroke,
      strokeWidth: gesture.node.strokeWidth,
      strokeDash: gesture.node.strokeDash,
      ...(gesture.line
        ? { line: true }
        : {
            arrow: true,
            arrowSize: gesture.node.arrowSize,
            arrowStart: gesture.node.arrowStart,
            arrowEnd: gesture.node.arrowEnd,
          }),
    });
    api.setDoc(
      ops.updateNode(api.getDocument(), gesture.id, {
        ...next,
        id: gesture.id,
      }),
      { commit: false },
    );
  }

  function finishArrow(event, finished) {
    const node = api
      .getDocument()
      .nodes.find((candidate) => candidate.id === finished.id);
    const endpoints = node ? absolutePathEndpoints(node) : null;
    const tooShort =
      !endpoints ||
      Math.hypot(
        endpoints[1].x - endpoints[0].x,
        endpoints[1].y - endpoints[0].y,
      ) < 4;
    if (tooShort) {
      api.removeNode(finished.id);
      api.select(null);
    } else {
      api.select(finished.id);
      commitEditorAction("editor.pointer.draw", () => api.commit());
    }
  }

  function startShape(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    // The colour wheel is the fill; stroke colour/weight and opacity are the
    // shape tool's other paint axes (Pen-style).
    const style = {
      intoFrame: true,
      fill: api.getColor?.() ?? "#999999",
      stroke: api.getShapeStrokeColor?.() ?? "#ffffff",
      strokeWidth: api.getStrokeWidth?.() ?? 0,
      strokeDash: api.getShapeStrokeDash?.() ?? "solid",
      opacity: api.getShapeOpacity?.() ?? 1,
    };
    const node =
      api.getTool() === TOOL.FRAME
        ? api.addFrameAt(point, { intoFrame: true })
        : api.getTool() === TOOL.ELLIPSE
          ? api.addEllipseAt(point, style)
          : api.addRectAt(point, style);
    api.select(node.id);
    setGesture({ kind: "shape", id: node.id, start: point });
  }

  function dragShape(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    let width = point.x - gesture.start.x;
    let height = point.y - gesture.start.y;
    const shape = api.getTool();
    if (
      event.shiftKey &&
      [TOOL.ELLIPSE, TOOL.RECT, TOOL.POLYGON, TOOL.STAR].includes(shape)
    ) {
      const side = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width || 1) * side;
      height = Math.sign(height || 1) * side;
    }
    const box = event.altKey
      ? {
          x: gesture.start.x - Math.abs(width),
          y: gesture.start.y - Math.abs(height),
          width: Math.abs(width) * 2,
          height: Math.abs(height) * 2,
        }
      : normaliseRect({
          x: gesture.start.x,
          y: gesture.start.y,
          width,
          height,
        });
    if (shape === TOOL.POLYGON || shape === TOOL.STAR) {
      const next = (shape === TOOL.STAR ? starNodeFromBox : polygonNodeFromBox)(
        box,
        {
          fill: gesture.fill,
          stroke: gesture.stroke ?? gesture.fill,
          strokeWidth: gesture.strokeWidth ?? 0,
          ...(gesture.strokeDash ? { strokeDash: gesture.strokeDash } : {}),
        },
      );
      api.setDoc(
        ops.updateNode(api.getDocument(), gesture.id, {
          ...next,
          id: gesture.id,
          ...(gesture.opacity != null ? { opacity: gesture.opacity } : {}),
        }),
        { commit: false },
      );
      return;
    }
    api.updateNode(gesture.id, box, { commit: false });
  }

  function finishShape(event, finished) {
    const node = api
      .getDocument()
      .nodes.find((candidate) => candidate.id === finished.id);
    const tooSmall = !node || node.width < 4 || node.height < 4;
    if (tooSmall) {
      api.removeNode(finished.id);
      api.select(null);
    } else {
      api.select(finished.id);
      commitEditorAction("editor.pointer.draw", () => api.commit());
    }
    api.setTool(TOOL.SELECT);
  }

  function startPolyShape(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const fill = api.getColor();
    const stroke = api.getShapeStrokeColor?.() ?? fill;
    const strokeWidth = api.getStrokeWidth?.() ?? 0;
    const strokeDash = api.getShapeStrokeDash?.() ?? "solid";
    const opacity = api.getShapeOpacity?.() ?? 1;
    const star = api.getTool() === TOOL.STAR;
    const node = {
      ...(star ? starNodeFromBox : polygonNodeFromBox)(
        { x: point.x, y: point.y, width: 1, height: 1 },
        { fill, stroke, strokeWidth, strokeDash },
      ),
      ...(opacity !== 1 ? { opacity } : {}),
    };
    api.setDoc(
      ops.addNode(api.getDocument(), insideFrame(api.getDocument(), node, point)),
      { commit: false },
    );
    api.select(node.id);
    setGesture({
      kind: "shape",
      id: node.id,
      start: point,
      fill,
      stroke,
      strokeWidth,
      strokeDash,
      opacity,
    });
  }

  function startText(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const hit = api.nodeAtPoint(point);
    if (hit?.kind === NODE_KIND.TEXT) {
      api.select(hit.id);
      api.setTool(TOOL.SELECT);
      api.beginTextEdit(hit.id);
      return;
    }
    const node = api.addTextAt(point, "", { intoFrame: true, useToolDefaults: true });
    setGesture({ kind: "text", id: node.id, start: point });
  }

  function dragText(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    const step = textBoxDrag(gesture.start, point, {
      zoom: api.getViewport?.()?.zoom ?? 1,
    });
    if (!step) return;
    api.updateNode(gesture.id, step.patch, { commit: false });
    api.setTextDraftRect?.(step.draftRect);
  }

  function finishText(event, finished) {
    api.setTextDraftRect?.(null);
    api.select(finished.id);
    api.setTool(TOOL.SELECT);
    // Defer the placement snapshot until content exists, so undo never
    // resurrects an empty box between placing and typing.
    api.beginTextEdit(finished.id, {
      commitPlacement: () => commitEditorAction("editor.pointer.draw", () => api.commit()),
    });
  }

  return {
    startArrow,
    dragArrow,
    finishArrow,
    startShape,
    dragShape,
    finishShape,
    startPolyShape,
    startText,
    dragText,
    finishText,
  };
}
