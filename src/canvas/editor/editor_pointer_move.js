/**
 * Pointer move dispatcher for active gestures on the editor stage.
 */

import { constrainAxisDelta } from "./axis_constraint.js";
import { DRAG_SLOP_PX } from "./editor_constants.js";
import { captureMoveRollback } from "./move-gesture-transaction.js";
import { editorSnapOptions, snapNodeBounds } from "./scene_snapping.js";
import {
  combinedBounds,
  cornerRadiusInwardDirection,
  nodeAABB,
  normaliseRect,
  toNodeLocalDelta,
} from "./scene_geometry.js";
import { movePathEndpoint } from "./shape_geometry.js";
import {
  normalizeCornerRadius,
  resolveCornerRadii,
} from "./scene_model_core.js";
import {
  dragGradientEndpoint,
  dragGradientLine,
  dragGradientStop,
} from "./editor_pointer_gradient.js";

export function createPointerMoveDispatcher({
  api,
  pan,
  drawing,
  shapes,
  marquee,
  selection,
  transform,
  warp,
}) {
  const {
    pressureOf,
    smoothBrushPoint,
    extendObjectStroke,
    extendRemoveBrush,
  } = drawing;
  const { dragArrow, dragShape, dragText } = shapes;
  const { dragPixelMarquee, dragPixelLasso } = marquee;
  const { dragRegion, extendFreeRegion } = selection;
  const { dragResize, dragRotate, dragCrop } = transform;
  const { dragPerspectiveCorner, dragMeshPoint, dragPuppetPin } = warp;

  function dispatchMove(event, gesture) {
    switch (gesture.kind) {
      case "pan":
        pan.continuePan(event, gesture);
        break;
      case "paint": {
        const point = smoothBrushPoint(
          gesture.lastPoint,
          api.toDocPoint(event.clientX, event.clientY),
        );
        api.paintStrokeTo(point, pressureOf(event));
        gesture.lastPoint = point;
        break;
      }
      case "arrow":
        dragArrow(event);
        break;
      case "selectionMove":
      case "selectionOutlineMove": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        const dx = point.x - gesture.start.x;
        const dy = point.y - gesture.start.y;
        if (Math.hypot(dx, dy) >= 1) {
          gesture.moved = true;
          api.movePixelSelectionPreview(dx, dy, gesture.base);
        }
        break;
      }
      case "selectionTransformResize":
      case "selectionTransformMove":
      case "selectionTransformRotate":
        transform.dragSelectionTransform?.(event, gesture);
        break;
      case "shape":
        dragShape(event);
        break;
      case "gradientStop": {
        const nextFill = dragGradientStop(
          gesture,
          api.toDocPoint(event.clientX, event.clientY),
        );
        api.updateNode(gesture.id, { fill: nextFill }, { commit: false });
        break;
      }
      case "gradientEndpoint": {
        const nextFill = dragGradientEndpoint(
          gesture,
          api.toDocPoint(event.clientX, event.clientY),
          event.shiftKey,
        );
        api.updateNode(gesture.id, { fill: nextFill }, { commit: false });
        break;
      }
      case "gradientLine": {
        const nextFill = dragGradientLine(
          gesture,
          api.toDocPoint(event.clientX, event.clientY),
        );
        api.updateNode(gesture.id, { fill: nextFill }, { commit: false });
        break;
      }
      case "text":
        dragText(event);
        break;
      case "pen":
        api.penMove(api.toDocPoint(event.clientX, event.clientY), {
          independent: event.altKey,
          constrain: event.shiftKey,
        });
        break;
      case "penBend":
        api.bendMove(api.toDocPoint(event.clientX, event.clientY));
        break;
      case "penLasso":
        api.lassoMove(api.toDocPoint(event.clientX, event.clientY));
        break;
      case "penEdit":
        api.editMove(api.toDocPoint(event.clientX, event.clientY), {
          independent: event.altKey,
          constrain: event.shiftKey,
        });
        break;
      case "maskPaint":
        api.paintMaskStroke(api.toDocPoint(event.clientX, event.clientY));
        break;
      case "lasso":
        api.addLassoPoint(api.toDocPoint(event.clientX, event.clientY));
        break;
      case "pixelMarquee":
        dragPixelMarquee(event);
        break;
      case "pixelLasso":
        dragPixelLasso(event);
        break;
      case "objectStroke":
        extendObjectStroke(event);
        break;
      case "removeBrush":
        extendRemoveBrush(event);
        break;
      case "healing": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        const last = gesture.points[gesture.points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 1) {
          gesture.points.push(point);
          api.setRemoveStroke?.({
            points: gesture.points.map((p) => [p.x, p.y]),
            size: gesture.size,
            closed: false,
          });
        }
        break;
      }
      case "cloneStamp": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        const last = gesture.points[gesture.points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 1) {
          gesture.points.push(point);
        }
        const dx = point.x - gesture.targetAnchor.x;
        const dy = point.y - gesture.targetAnchor.y;
        const liveSourcePt = {
          x: gesture.sourceAnchor.x + dx,
          y: gesture.sourceAnchor.y + dy,
        };
        api.setCloneSource?.({
          nodeId: gesture.targetId,
          point: liveSourcePt,
          offset: {
            dx: gesture.sourceAnchor.x - gesture.targetAnchor.x,
            dy: gesture.sourceAnchor.y - gesture.targetAnchor.y,
          },
        });
        api.setClonePreview?.({
          cursor: point,
          size: gesture.size,
          hardness: gesture.hardness,
          opacity: gesture.opacity,
          nodeId: gesture.targetId,
          sourcePoint: liveSourcePt,
          sourceAnchor: gesture.sourceAnchor,
          targetAnchor: gesture.targetAnchor,
          points: [...gesture.points],
        });
        break;
      }
      case "patchLasso": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        const last = gesture.points[gesture.points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 1) {
          gesture.points.push(point);
          api.setRemoveStroke?.({
            points: gesture.points.map((p) => [p.x, p.y]),
            size: 2,
            closed: true,
          });
        }
        break;
      }
      case "patchDrag": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        const dx = point.x - gesture.start.x;
        const dy = point.y - gesture.start.y;
        api.setPatchDraft?.({
          ...gesture.patch,
          offset: { dx, dy },
        });
        break;
      }
      case "region":
        dragRegion(event);
        break;
      case "regionFree":
        extendFreeRegion(event);
        break;
      case "perspectiveCorner":
        dragPerspectiveCorner(event, gesture);
        break;
      case "meshPoint":
        dragMeshPoint(event, gesture);
        break;
      case "puppetPin":
        dragPuppetPin(event, gesture);
        break;
      case "cornerRadius": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        const node = api
          .getDocument()
          .nodes.find((candidate) => candidate.id === gesture.id);
        if (!node) break;
        const inward = cornerRadiusInwardDirection(gesture.handle);
        if (!inward) break;
        const delta = toNodeLocalDelta(node, {
          x: point.x - gesture.start.x,
          y: point.y - gesture.start.y,
        });
        const along = delta.x * inward.x + delta.y * inward.y;
        const cornerKey = {
          "radius-nw": "tl",
          "radius-ne": "tr",
          "radius-se": "br",
          "radius-sw": "bl",
        }[gesture.handle];

        const adjustSingleCorner = event.altKey || gesture.isIndependent;
        captureMoveRollback(api, gesture);
        gesture.moved = true;
        if (adjustSingleCorner && cornerKey) {
          const currentRadii = resolveCornerRadii(
            node.cornerRadius,
            node.width,
            node.height,
          );
          const initialCornerR =
            typeof gesture.initialRadius === "object"
              ? (gesture.initialRadius?.[cornerKey] ?? 0)
              : (gesture.initialRadius ?? 0);
          const nextR = Math.max(
            0,
            Math.min(gesture.maxRadius, initialCornerR + along),
          );
          const nextRadii = {
            ...currentRadii,
            [cornerKey]: Math.round(nextR),
          };
          api.updateNode(
            gesture.id,
            { cornerRadius: normalizeCornerRadius(nextRadii) },
            { commit: false },
          );
        } else {
          const baseInitial =
            typeof gesture.initialRadius === "number"
              ? gesture.initialRadius
              : (gesture.initialRadius?.[cornerKey] ?? 0);
          const nextRadius = Math.max(
            0,
            Math.min(gesture.maxRadius, baseInitial + along),
          );
          api.updateNode(
            gesture.id,
            { cornerRadius: Math.round(nextRadius) },
            { commit: false },
          );
        }
        break;
      }
      case "endpoint": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        const node = api
          .getDocument()
          .nodes.find((candidate) => candidate.id === gesture.id);
        if (node) {
          captureMoveRollback(api, gesture);
          gesture.moved = true;
          api.updateNode(
            gesture.id,
            movePathEndpoint(node, gesture.index, point),
            { commit: false },
          );
        }
        break;
      }
      case "resize":
        captureMoveRollback(api, gesture);
        gesture.moved = true;
        dragResize(event);
        break;
      case "rotate":
        captureMoveRollback(api, gesture);
        gesture.moved = true;
        dragRotate(event);
        break;
      case "cropMove":
      case "cropResize":
        dragCrop(event);
        break;
      case "move": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        captureMoveRollback(api, gesture);
        if (api.isSelected(gesture.id)) {
          const total = constrainAxisDelta(
            point.x - gesture.start.x,
            point.y - gesture.start.y,
            event.shiftKey,
          );
          const zoom = api.getViewport().zoom;
          if (
            !gesture.moved &&
            Math.hypot(total.dx, total.dy) * zoom < DRAG_SLOP_PX
          ) {
            break;
          }
          if (gesture.beginDuplicate && !gesture.duplicated) {
            if (!gesture.beginDuplicate(gesture)) break;
          }
          const doc = api.getDocument();
          const visibleDoc = doc;
          const moved = gesture.origins.flatMap((origin) => {
            const savedNode = doc.nodes.find((each) => each.id === origin.id);
            const visibleNode = visibleDoc.nodes.find(
              (each) => each.id === origin.id,
            );
            return savedNode && visibleNode
              ? [
                  {
                    node: visibleNode,
                    savedNode,
                    x: origin.x + total.dx,
                    y: origin.y + total.dy,
                  },
                ]
              : [];
          });
          if (moved.length === 0) break;

          const boxes = moved.map((entry) =>
            nodeAABB({ ...entry.node, x: entry.x, y: entry.y }),
          );
          const bounds = combinedBounds(boxes);
          const bypassSnap =
            Boolean(event.metaKey || event.ctrlKey) ||
            api.getSnappingEnabled?.() === false;
          const snap = bypassSnap
            ? { x: bounds.x, y: bounds.y, guides: [] }
            : snapNodeBounds({
                doc: visibleDoc,
                activeIds: gesture.origins.map((origin) => origin.id),
                rect: bounds,
                zoom,
                // Grid snapping is unreachable without this: the flag lives in
                // settings and the grid overlay supplies type/size.
                options: {
                  ...editorSnapOptions({
                    grid: api.getGrid?.() ?? null,
                    activeSnap: Boolean(gesture.activeSnap),
                  }),
                  spatialIndex: api.getSpatialIndex?.() ?? visibleDoc.spatialIndex,
                },
              });
          gesture.activeSnap = Boolean(snap.guides && snap.guides.length > 0);
          const correctionX = snap.x - bounds.x;
          const correctionY = snap.y - bounds.y;
          const updates = moved.map((entry) => ({
            id: entry.node.id,
            x: entry.x + correctionX,
            y: entry.y + correctionY,
          }));
          api.updateNodes(updates, { commit: false, preview: true });
          api.setGuides(snap.guides);
        } else {
          {
            api.moveNodeBy(
              gesture.id,
              point.x - gesture.lastX,
              point.y - gesture.lastY,
              { commit: false, preview: true },
            );
          }
        }
        gesture.lastX = point.x;
        gesture.lastY = point.y;
        gesture.moved = true;
        break;
      }
      case "marquee": {
        const point = api.toDocPoint(event.clientX, event.clientY);
        gesture.rect = normaliseRect({
          x: gesture.start.x,
          y: gesture.start.y,
          width: point.x - gesture.start.x,
          height: point.y - gesture.start.y,
        });
        gesture.moved = true;
        api.setMarquee(gesture.rect);
        break;
      }
      default:
        break;
    }
  }

  return { dispatchMove };
}
