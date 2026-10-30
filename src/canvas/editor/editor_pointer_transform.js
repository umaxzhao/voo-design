/**
 * Transform pointer gestures for the editor stage.
 *
 * Node move, resize, rotate, and facade composition for crop and warp gestures.
 */

import * as ops from "./doc_ops.js";
import { NODE_KIND, nodeRect } from "./scene_model.js";
import { resolveCornerRadii } from "./scene_model_core.js";
import { absolutePathEndpoints, isEndpointEditable } from "./shape_geometry.js";
import {
  combinedBounds,
  cursorForHandle,
  fromNodeLocal,
  handleFromPoints,
  handlePoints,
  nodeAABB,
  resizeNodeRect,
  rotationFromPointer,
  toNodeLocal,
} from "./scene_geometry.js";
import { HANDLE_GRAB_RADIUS, docToScreenPoint } from "./scene_renderer.js";
import { TOOL } from "./editor_constants.js";
import { createWarpPointerGestures } from "./editor_pointer_warp.js";
import { createCropPointerGestures } from "./editor_pointer_crop.js";
import { visibleSelectedNode } from "./editor_pointer_hit_test.js";
import { captureMoveGestureFrame, moveGestureIds } from "./move_gesture.js";
import { editorSnapOptions, snapNodeBounds } from "./scene_snapping.js";
import { rotationCursorForPoint } from "./editor-cursors.js";

export function scaleNodePoints(points, scaleX, scaleY) {
  if (!Array.isArray(points)) return points;
  return points.map((p) => {
    if (Array.isArray(p)) {
      const [px, py, ...rest] = p;
      return [px * scaleX, py * scaleY, ...rest];
    }
    if (p && typeof p === "object") {
      const updated = {
        ...p,
        x: p.x * scaleX,
        y: p.y * scaleY,
      };
      if (Array.isArray(p.in)) {
        updated.in = [p.in[0] * scaleX, p.in[1] * scaleY, ...p.in.slice(2)];
      }
      if (Array.isArray(p.out)) {
        updated.out = [p.out[0] * scaleX, p.out[1] * scaleY, ...p.out.slice(2)];
      }
      return updated;
    }
    return p;
  });
}

export function createTransformPointerGestures(ctx) {
  const {
    api,
    stage,
    screenPoint,
    nodeHandleUnder,
    rotateHandleUnder,
    rectRadiusHandleUnder,
    gradientControlGrab,
    pointInContours,
    penEditPress,
    getGesture,
    setGesture,
  } = ctx;

  const warp = createWarpPointerGestures(ctx);
  const crop = createCropPointerGestures(ctx);
  const { grabWarpControl } = warp;

  function startSelectDrag(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    if (api.isEditing?.()) {
      const subTool = api.getPenSubTool?.() ?? "move";
      if (subTool === "lasso" || subTool === "bend" || subTool === "cut") {
        penEditPress(event);
        return;
      }
      if (api.editDown?.(point, { convert: event.altKey })) {
        setGesture({ kind: "penEdit" });
        return;
      }
      api.endEdit?.();
    }
    const frame = api.getEvaluatedDocument?.() ?? api.getDocument();
    const selected = visibleSelectedNode(api);
    function pointInWarpNode(node, pt) {
      if (!node) return false;
      if (
        Array.isArray(node.perspectiveCorners) &&
        node.perspectiveCorners.length === 4
      ) {
        const pts = node.perspectiveCorners.map((c) =>
          fromNodeLocal(node, { x: c.x * node.width, y: c.y * node.height }),
        );
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i].x,
            yi = pts[i].y;
          const xj = pts[j].x,
            yj = pts[j].y;
          const intersect =
            yi > pt.y !== yj > pt.y &&
            pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
          if (intersect) inside = !inside;
        }
        if (inside) return true;
      }
      const local = toNodeLocal(node, pt);
      return (
        local.x >= 0 &&
        local.x <= node.width &&
        local.y >= 0 &&
        local.y <= node.height
      );
    }

    const transformTool =
      api.getTool() === TOOL.PERSPECTIVE ||
      api.getTool() === TOOL.DISTORT ||
      api.getTool() === TOOL.PUPPET_WARP;

    if (transformTool) {
      if (selected) {
        const grabbed = grabWarpControl(selected, event, point);
        if (grabbed) return;
      }
      const hit = api.nodeAtPoint(point);
      if (hit && hit.id !== selected?.id) {
        api.select(hit.id);
        const grabbed = grabWarpControl(hit, event, point);
        if (grabbed) return;
      }
      const target = selected || hit;
      if (
        target &&
        !target.locked &&
        !target.lockPosition &&
        pointInWarpNode(target, point)
      ) {
        // Allow falling through to move target object from center/body
      } else {
        setGesture(null);
        return;
      }
    }

    const pixelSelection = api.getPixelSelection?.();
    if (
      pixelSelection?.contours?.length &&
      pointInContours(pixelSelection, point)
    ) {
      setGesture({
        kind: "selectionMove",
        nodeId: pixelSelection.nodeId,
        start: point,
        base: pixelSelection,
        moved: false,
      });
      return;
    }

    const multiNodes = (api.getSelectedNodes?.() ?? []).filter(
      (node) => !node.locked && !node.lockPosition,
    );
    if (multiNodes.length > 1) {
      const combined = combinedBounds(multiNodes.map((node) => nodeAABB(node)));
      if (combined) {
        const viewport = api.getViewport();
        const screenHandles = handlePoints(combined).map((pt) => ({
          handle: pt.handle,
          ...docToScreenPoint(pt, viewport),
        }));
        const multiHandle = handleFromPoints(
          screenHandles,
          screenPoint(event),
          HANDLE_GRAB_RADIUS,
        );
        if (multiHandle) {
          setGesture({
            kind: "resize",
            handle: multiHandle,
            start: point,
            rect: combined,
            multi: true,
            nodes: multiNodes.map((node) => ({
              id: node.id,
              kind: node.kind,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              baseWidth: node.baseWidth,
              baseHeight: node.baseHeight,
              rotation: node.rotation ?? 0,
              fontSize: node.fontSize,
              boxWidth: node.boxWidth,
              points: node.points
                ? JSON.parse(JSON.stringify(node.points))
                : undefined,
            })),
          });
          stage.style.cursor = cursorForHandle(multiHandle, 0);
          return;
        }

        const cornerHandles = ["nw", "ne", "se", "sw"];
        const screenCorners = screenHandles.filter((p) =>
          cornerHandles.includes(p.handle),
        );
        const margin = 3 / (viewport.zoom || 1);
        const isInsideCombined =
          point.x >= combined.x - margin &&
          point.x <= combined.x + combined.width + margin &&
          point.y >= combined.y - margin &&
          point.y <= combined.y + combined.height + margin;

        // Match single-layer hit priority: corner rotation is an empty-space
        // affordance, while another layer's body remains selectable.
        if (!isInsideCombined && !api.nodeAtPoint(point)) {
          const cursorPt = screenPoint(event);
          const isNearCorner = screenCorners.some((corner) => {
            const dist = Math.hypot(cursorPt.x - corner.x, cursorPt.y - corner.y);
            return dist > HANDLE_GRAB_RADIUS + 2 && dist <= HANDLE_GRAB_RADIUS + 24;
          });
          if (isNearCorner) {
            const center = {
              x: combined.x + combined.width / 2,
              y: combined.y + combined.height / 2,
            };
            const initialAngle = rotationFromPointer(center, point);
            setGesture({
              kind: "rotate",
              multi: true,
              center,
              initialAngle,
              startRotation: 0,
              nodes: multiNodes.map((node) => ({
                id: node.id,
                x: node.x,
                y: node.y,
                width: node.width,
                height: node.height,
                rotation: node.rotation ?? 0,
              })),
            });
            try {
              stage.style.cursor = rotationCursorForPoint(center, point);
            } catch {
              stage.style.cursor = "crosshair";
            }
            return;
          }
        }
      }
    }

    if (
      selected &&
      !selected.locked &&
      selected.kind !== NODE_KIND.ADJUSTMENT
    ) {
      const endpointEditable = isEndpointEditable(selected);
      if (endpointEditable) {
        const cursor = screenPoint(event);
        const viewport = api.getViewport();
        const endpointIndex = absolutePathEndpoints(selected).findIndex(
          (endpoint) => {
            const screen = docToScreenPoint(endpoint, viewport);
            return (
              Math.hypot(screen.x - cursor.x, screen.y - cursor.y) <=
              HANDLE_GRAB_RADIUS
            );
          },
        );
        if (endpointIndex >= 0) {
          setGesture({
            kind: "endpoint",
            id: selected.id,
            index: endpointIndex,
          });
          stage.style.cursor = "move";
          return;
        }
      }

      const zoom = api.getViewport()?.zoom || 1;
      const gradientGrab = gradientControlGrab(
        selected,
        point,
        HANDLE_GRAB_RADIUS / zoom,
      );
      if (gradientGrab) {
        setGesture(gradientGrab);
        stage.style.cursor = "default";
        api.setGradientAdjusting?.(true);
        return;
      }

      const radiusHandle =
        selected.kind === NODE_KIND.RECT
          ? rectRadiusHandleUnder(selected, event)
          : null;
      if (radiusHandle) {
        const radii = resolveCornerRadii(
          selected.cornerRadius,
          selected.width,
          selected.height,
        );
        setGesture({
          kind: "cornerRadius",
          id: selected.id,
          handle: radiusHandle,
          start: point,
          initialRadius: radii,
          maxRadius: Math.min(selected.width / 2, selected.height / 2),
          isIndependent:
            typeof selected.cornerRadius === "object" &&
            selected.cornerRadius !== null,
        });
        return;
      }
      const handle = nodeHandleUnder(selected, event);
      if (grabWarpControl(selected, event, point)) return;

      if (handle && !selected.lockPosition && !endpointEditable) {
        setGesture({
          kind: "resize",
          id: selected.id,
          handle,
          start: point,
          rect:
            selected.kind === NODE_KIND.REGION
              ? (ops.regionOutlineInDoc(api.getDocument(), selected)?.box ??
                nodeRect(selected))
              : nodeRect(selected),
          fontSize: selected.fontSize,
          baseWidth: selected.baseWidth,
          baseHeight: selected.baseHeight,
          points: selected.points
            ? JSON.parse(JSON.stringify(selected.points))
            : undefined,
        });
        return;
      }
      if (rotateHandleUnder(selected, event) && !selected.lockPosition) {
        const center = {
          x: selected.x + selected.width / 2,
          y: selected.y + selected.height / 2,
        };
        const initialAngle = rotationFromPointer(center, point);
        setGesture({
          kind: "rotate",
          id: selected.id,
          center,
          initialAngle,
          startRotation: selected.rotation ?? 0,
        });
        try {
          stage.style.cursor = rotationCursorForPoint(center, point);
        } catch {
          stage.style.cursor = "crosshair";
        }
        return;
      }
    }

    let hit = api.nodeAtPoint(point);

    if (hit) {
      const altTargetLocked =
        event.altKey &&
        api.getDocument().nodes.find((node) => node.id === hit.id)
          ?.lockPosition === true;
      let target = hit;
      let duplicated = false;
      if (event.altKey && !altTargetLocked) {
        const currentSelected = api.getSelectedNodes?.() ?? [];
        const isHitInMultiSelection =
          currentSelected.length > 1 &&
          currentSelected.some((n) => n.id === hit.id);

        if (typeof api.duplicateSelected === "function") {
          if (!isHitInMultiSelection && !api.isSelected(hit.id)) {
            api.select(hit.id);
          }
          api.duplicateSelected();
          duplicated = true;
          target = api.getSelected?.() ?? hit;
        } else {
          const result = ops.duplicateNode(api.getDocument(), hit.id, 0);
          if (result.id) {
            api.setDoc(result.doc, { commit: false });
            target = { ...hit, id: result.id };
            duplicated = true;
          }
        }
      }

      const deepSelect = Boolean(event.metaKey || event.ctrlKey);
      if (event.shiftKey && !duplicated) {
        if (deepSelect && typeof api.toggleExactly === "function") {
          api.toggleExactly(target.id);
        } else if (api.toggleSelect) {
          api.toggleSelect(target.id);
        } else if (api.toggleSelected) {
          api.toggleSelected(target.id);
        }
        if (!api.isSelected(target.id)) return;
      } else if (!api.isSelected(target.id)) {
        if (deepSelect && typeof api.selectExactly === "function") {
          api.selectExactly([target.id]);
        } else {
          api.select(target.id);
        }
      }

      const moving = api.getSelectedNodes();
      const base = moving.length > 0 ? moving : [{ ...hit, id: target.id }];
      const docNow = api.getDocument();
      const setIds = moveGestureIds(api, docNow, base);
      if (setIds.length === 0) return;
      const frame = captureMoveGestureFrame(docNow, setIds);

      if (frame.origins.length > 0) {
        setGesture({
          kind: "move",
          id: target.id,
          origins: frame.origins,
          start: point,
          origin: { x: hit.x, y: hit.y },
          lastX: point.x,
          lastY: point.y,
          moved: false,
          duplicated,
        });
      }
    } else {
      if (!event.shiftKey) {
        api.select(null);
        api.clearPixelSelection?.();
      }
      const additive = event.shiftKey;
      setGesture({
        kind: "marquee",
        start: point,
        additive,
        base: additive ? api.getSelectedIds() : [],
        moved: false,
        rect: null,
      });
    }
  }

  function regionPatchFromDoc(node, docRect) {
    const host = ops.regionHost(api.getDocument(), node);
    if (!host) return docRect;
    const origin = toNodeLocal(host, { x: docRect.x, y: docRect.y });
    const far = toNodeLocal(host, {
      x: docRect.x + docRect.width,
      y: docRect.y + docRect.height,
    });
    return {
      x: origin.x,
      y: origin.y,
      width: far.x - origin.x,
      height: far.y - origin.y,
    };
  }

  function dragResize(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    gesture.lastPoint = point;
    const delta = {
      x: point.x - gesture.start.x,
      y: point.y - gesture.start.y,
    };
    const fromCentre = Boolean(event.altKey);
    const bypassSnap = Boolean(event.metaKey || event.ctrlKey);

    if (gesture.multi && gesture.nodes?.length > 0) {
      stage.style.cursor = cursorForHandle(gesture.handle, 0);
      const keepRatio = Boolean(event.shiftKey);
      let effectiveDelta = { ...delta };
      let snapGuides = [];

      if (!bypassSnap) {
        const proposedCombined = resizeNodeRect(
          { ...gesture.rect, rotation: 0 },
          gesture.handle,
          delta,
          {
            minSize: 4,
            keepRatio,
            lockRatio: keepRatio,
            fromCentre,
          },
        );
        const doc = api.getEvaluatedDocument?.() ?? api.getDocument();
        const snapDisabled = api.getSnappingEnabled?.() === false;
        const snap = snapDisabled
          ? { guides: [], deltaX: 0, deltaY: 0 }
          : snapNodeBounds({
              doc,
              activeIds: gesture.nodes.map((n) => n.id),
              rect: proposedCombined,
              zoom: api.getViewport().zoom,
              handle: gesture.handle,
              // Grid snapping needs the explicit option; guide snapping is on
              // unless the guides are hidden in the ruler overlay.
              options: {
                ...editorSnapOptions({
                  grid: api.getGrid?.() ?? null,
                  activeSnap: Boolean(gesture.activeSnap),
                }),
                spatialIndex: api.getSpatialIndex?.() ?? doc.spatialIndex,
              },
            });
        gesture.activeSnap = Boolean(snap.guides && snap.guides.length > 0);
        if (snap.guides.length > 0) {
          snapGuides = snap.guides;
          effectiveDelta.x += snap.deltaX;
          effectiveDelta.y += snap.deltaY;
        }
      }
      api.setGuides?.(snapGuides);

      const newCombined = resizeNodeRect(
        { ...gesture.rect, rotation: 0 },
        gesture.handle,
        effectiveDelta,
        {
          minSize: 4,
          keepRatio,
          lockRatio: keepRatio,
          fromCentre,
        },
      );

      const origW = gesture.rect.width;
      const origH = gesture.rect.height;
      const scaleX = origW > 0 ? newCombined.width / origW : 1;
      const scaleY = origH > 0 ? newCombined.height / origH : 1;

      const updates = [];
      for (const initial of gesture.nodes) {
        const relX = initial.x - gesture.rect.x;
        const relY = initial.y - gesture.rect.y;
        const nextX = newCombined.x + relX * scaleX;
        const nextY = newCombined.y + relY * scaleY;
        const nextW = Math.max(1, initial.width * scaleX);
        const nextH = Math.max(1, initial.height * scaleY);

        let patch = {
          x: nextX,
          y: nextY,
          width: nextW,
          height: nextH,
        };

        if (initial.kind === NODE_KIND.TEXT) {
          if (initial.boxWidth > 0) {
            patch = {
              x: nextX,
              y: nextY,
              boxWidth: Math.max(
                1,
                (initial.boxWidth ?? initial.width) * scaleX,
              ),
            };
          } else {
            patch = {
              x: nextX,
              y: nextY,
              fontSize: Math.max(
                4,
                ((initial.fontSize ?? 16) * nextH) / Math.max(1, initial.height),
              ),
            };
          }
        } else if (
          initial.points &&
          Array.isArray(initial.points) &&
          !initial.baseWidth &&
          !initial.baseHeight
        ) {
          const nodeScaleX = initial.width > 0 ? nextW / initial.width : scaleX;
          const nodeScaleY = initial.height > 0 ? nextH / initial.height : scaleY;
          patch.points = scaleNodePoints(initial.points, nodeScaleX, nodeScaleY);
        }

        updates.push({ id: initial.id, ...patch });
      }
      if (typeof api.updateNodes === "function") {
        api.updateNodes(updates, { commit: false, preview: true });
      } else {
        for (const item of updates) {
          api.updateNode(item.id, item, { commit: false, preview: true });
        }
      }
      return;
    }

    const node = api.getSelected();
    const keepRatio = Boolean(
      event.shiftKey || (node ? Boolean(node.lockRatio) : false),
    );
    let effectiveDelta = { ...delta };
    let snapGuides = [];

    const isTransformed = Boolean(
      (node?.rotation ?? 0) !== 0 || (node?.shear ?? 0) !== 0,
    );
    if (!bypassSnap && !isTransformed) {
      const proposedRect = resizeNodeRect(
        node ? { ...node, ...gesture.rect } : gesture.rect,
        gesture.handle,
        delta,
        {
          minSize: 4,
          keepRatio,
          lockRatio: keepRatio,
          fromCentre,
        },
      );
      const doc = api.getEvaluatedDocument?.() ?? api.getDocument();
      const snapDisabled = api.getSnappingEnabled?.() === false;
      const snap = snapDisabled
        ? { guides: [], deltaX: 0, deltaY: 0 }
        : snapNodeBounds({
            doc,
            activeId: node?.id ?? gesture.id,
            rect: proposedRect,
            zoom: api.getViewport().zoom,
            handle: gesture.handle,
            // Same option plumbing as the multi-node resize above.
            options: {
              ...editorSnapOptions({
                grid: api.getGrid?.() ?? null,
                activeSnap: Boolean(gesture.activeSnap),
              }),
              spatialIndex: api.getSpatialIndex?.() ?? doc.spatialIndex,
            },
          });
      gesture.activeSnap = Boolean(snap.guides && snap.guides.length > 0);
      if (snap.guides.length > 0) {
        snapGuides = snap.guides;
        effectiveDelta.x += snap.deltaX;
        effectiveDelta.y += snap.deltaY;
      }
    }
    api.setGuides?.(snapGuides);

    const rect = resizeNodeRect(
      node ? { ...node, ...gesture.rect } : gesture.rect,
      gesture.handle,
      effectiveDelta,
      {
        minSize: 4,
        keepRatio,
        lockRatio: keepRatio,
        fromCentre,
      },
    );
    let patch;
    if (node?.kind === NODE_KIND.TEXT) {
      if (node.boxWidth > 0) {
        patch = { x: rect.x, y: rect.y, boxWidth: rect.width };
      } else if (gesture.handle === "e" || gesture.handle === "w") {
        patch = { x: rect.x, y: rect.y, boxWidth: Math.max(1, rect.width) };
      } else {
        patch = {
          x: rect.x,
          y: rect.y,
          fontSize: Math.max(
            4,
            (gesture.fontSize * rect.height) /
              Math.max(1, gesture.rect.height),
          ),
        };
      }
    } else if (node?.kind === NODE_KIND.REGION) {
      patch = regionPatchFromDoc(node, rect);
    } else {
      patch = { ...rect };
      if (
        gesture.points &&
        Array.isArray(gesture.points) &&
        !gesture.baseWidth &&
        !gesture.baseHeight
      ) {
        const origW = gesture.rect.width;
        const origH = gesture.rect.height;
        const sX = origW > 0 ? rect.width / origW : 1;
        const sY = origH > 0 ? rect.height / origH : 1;
        patch.points = scaleNodePoints(gesture.points, sX, sY);
      }
    }
    // A frame's children obey constraints while the frame is dragged/resized,
    // not only when its W/H fields are edited from the panel.
    if (node?.isFrame && typeof api.updateFrameNode === "function") {
      api.updateFrameNode(gesture.id, patch, { commit: false, preview: true });
      return;
    }
    api.updateNode(gesture.id, patch, { commit: false, preview: true });
  }

  function dragRotate(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    try {
      stage.style.cursor = rotationCursorForPoint(gesture.center, point);
    } catch {
      // Fallback
    }
    const currentAngle = rotationFromPointer(gesture.center, point);
    let delta = currentAngle - gesture.initialAngle;
    let nextRotation = (gesture.startRotation + delta) % 360;
    if (nextRotation < 0) nextRotation += 360;

    if (event.shiftKey) {
      nextRotation = Math.round(nextRotation / 15) * 15;
    } else {
      const cardinals = [0, 90, 180, 270];
      const magneticTolerance = 4;
      for (const target of cardinals) {
        const diff = Math.abs(nextRotation - target);
        const angularDistance = Math.min(diff, 360 - diff);
        if (angularDistance <= magneticTolerance) {
          nextRotation = target;
          break;
        }
      }
    }
    if (nextRotation > 180) nextRotation -= 360;

    if (gesture.multi && Array.isArray(gesture.nodes)) {
      const deltaAngle = nextRotation - gesture.startRotation;
      const rad = (deltaAngle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const cx = gesture.center.x;
      const cy = gesture.center.y;

      const updates = [];
      for (const origin of gesture.nodes) {
        const origCenterX = origin.x + origin.width / 2;
        const origCenterY = origin.y + origin.height / 2;
        const dx = origCenterX - cx;
        const dy = origCenterY - cy;
        const newCenterX = cx + dx * cos - dy * sin;
        const newCenterY = cy + dx * sin + dy * cos;
        const newX = newCenterX - origin.width / 2;
        const newY = newCenterY - origin.height / 2;
        let nodeRot = ((origin.rotation ?? 0) + deltaAngle) % 360;
        if (nodeRot < 0) nodeRot += 360;
        if (nodeRot > 180) nodeRot -= 360;

        updates.push({
          id: origin.id,
          x: newX,
          y: newY,
          rotation: nodeRot,
        });
      }
      if (typeof api.updateNodes === "function") {
        api.updateNodes(updates, { commit: false, preview: true });
      } else {
        for (const item of updates) {
          api.updateNode(item.id, item, { commit: false, preview: true });
        }
      }
    } else {
      api.updateNode(
        gesture.id,
        { rotation: nextRotation },
        { commit: false, preview: true },
      );
    }
  }

  return {
    ...crop,
    ...warp,
    startSelectDrag,
    dragResize,
    dragRotate,
    regionPatchFromDoc,
  };
}
