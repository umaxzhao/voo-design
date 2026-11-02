/**
 * Hover cursor and preview logic for the editor stage.
 */

import { BRUSH_WIDTH_MAX, TOOL } from "./editor_constants.js";
import { NODE_KIND } from "./scene_model.js";
import {
  cursorForHandle,
  fromNodeLocal,
  handleAtPoint,
} from "./scene_geometry.js";
import { unrotatePointAroundCenterRad } from "./box_transform_math.js";
import { rotationCursorForPoint } from "./editor-cursors.js";
import { HANDLE_GRAB_RADIUS } from "./scene_renderer.js";
import { isCssGradient } from "../color_picker/gradient_fill.js";
import { gradientControlGrab } from "./editor_pointer_gradient.js";
import { visibleSelectedNode } from "./editor_pointer_hit_test.js";

/** Generates a high-contrast circle SVG cursor matching the exact screen size of the brush/eraser. */
const brushCursorCache = new Map();

export function brushCircleCursor(brushSize, zoom = 1) {
  const screenDiameter = Math.max(
    4,
    Math.min(BRUSH_WIDTH_MAX, Math.round(brushSize * zoom)),
  );
  const cached = brushCursorCache.get(screenDiameter);
  if (cached) return cached;
  const pad = 2;
  const svgSize = screenDiameter + pad * 2;
  const radius = screenDiameter / 2;
  const center = pad + radius;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="2.5"/><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/><circle cx="${center}" cy="${center}" r="0.8" fill="white"/></svg>`;
  const encoded = encodeURIComponent(svg);
  const cursor = `url('data:image/svg+xml;utf8,${encoded}') ${center} ${center}, crosshair`;
  if (brushCursorCache.size >= 32) {
    brushCursorCache.delete(brushCursorCache.keys().next().value);
  }
  brushCursorCache.set(screenDiameter, cursor);
  return cursor;
}

export function createHoverCursorController({
  api,
  stage,
  hitTest,
  isSpaceDown,
}) {
  const {
    handleUnder,
    cropHandleUnder,
    nodeHandleUnder,
    rotateHandleUnder,
    rectRadiusHandleUnder,
    nodeRectContains,
    imageAt,
    pointInContours,
  } = hitTest;
  let lastPointerEvent = null;

  function updateHoverCursor(event) {
    lastPointerEvent = event;
    if (isSpaceDown()) {
      stage.style.cursor = "grab";
      return;
    }
    if (api.getSelectionTransform?.()) {
      const transform = api.getSelectionTransform();
      if (transform?.rect) {
        const zoom = Math.max(api.getViewport()?.zoom ?? 1, 0.01);
        const point = api.toDocPoint(event.clientX, event.clientY);
        const { rect, rotation = 0 } = transform;
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const localPoint = unrotatePointAroundCenterRad(
          point,
          { x: cx, y: cy },
          rotation,
        );
        const tol = HANDLE_GRAB_RADIUS / zoom;
        const handle = handleAtPoint(rect, localPoint, tol);
        const onGrip =
          Math.abs(localPoint.x - cx) <= tol * 3 &&
          localPoint.y <= rect.y &&
          localPoint.y >= rect.y - 50 / zoom;
        const cornerDistances = [
          Math.hypot(localPoint.x - rect.x, localPoint.y - rect.y),
          Math.hypot(
            localPoint.x - (rect.x + rect.width),
            localPoint.y - rect.y,
          ),
          Math.hypot(
            localPoint.x - (rect.x + rect.width),
            localPoint.y - (rect.y + rect.height),
          ),
          Math.hypot(
            localPoint.x - rect.x,
            localPoint.y - (rect.y + rect.height),
          ),
        ];
        const nearCorner = cornerDistances.some(
          (d) => d > tol && d <= tol * 3.5,
        );
        const inside =
          localPoint.x >= rect.x - tol &&
          localPoint.x <= rect.x + rect.width + tol &&
          localPoint.y >= rect.y - tol &&
          localPoint.y <= rect.y + rect.height + tol;
        if (handle) {
          stage.style.cursor = cursorForHandle(handle, rotation);
          return;
        }
        if (onGrip || nearCorner) {
          stage.style.cursor = rotationCursorForPoint({ x: cx, y: cy }, point);
          return;
        }
        if (inside) {
          stage.style.cursor = "move";
          return;
        }
      }
    }
    const tool = api.getTool();
    if (tool === TOOL.HAND) {
      // The hand tool always reads as a grab handle; startPan switches to
      // "grabbing" while the drag is in flight.
      stage.style.cursor = "grab";
      return;
    }
    if (
      tool === TOOL.BRUSH ||
      tool === TOOL.ERASER ||
      (tool === TOOL.HEALING && api.getHealingMode?.() !== "clone") ||
      [
        TOOL.BLUR,
        TOOL.SHARPEN,
        TOOL.SMUDGE,
        TOOL.DODGE,
        TOOL.BURN,
        TOOL.SPONGE,
      ].includes(tool)
    ) {
      const zoom = api.getViewport()?.zoom ?? 1;
      const brushSize =
        api.getMaskEdit?.()?.size ?? api.getBrushWidth?.() ?? 24;
      stage.style.cursor = brushCircleCursor(brushSize, zoom);
      return;
    }
    if (
      api.getMaskEdit() ||
      tool === TOOL.REGION ||
      tool === TOOL.LASSO ||
      tool === TOOL.MARQUEE ||
      tool === TOOL.DROPPER ||
      tool === TOOL.RECT ||
      tool === TOOL.FRAME ||
      tool === TOOL.ELLIPSE ||
      tool === TOOL.ARROW ||
      tool === TOOL.TEXT
    ) {
      stage.style.cursor = "crosshair";
      return;
    }
    if (
      (tool === TOOL.SELECT || tool === TOOL.SELECT_REGION) &&
      api.getPixelSelection?.()?.contours?.length &&
      pointInContours(
        api.getPixelSelection(),
        api.toDocPoint(event.clientX, event.clientY),
      )
    ) {
      stage.style.cursor = "move";
      return;
    }
    const crop = api.getCropRect();
    const selected = visibleSelectedNode(api);
    const warpPoint = (() => {
      if (
        !selected ||
        !(
          tool === TOOL.PERSPECTIVE ||
          tool === TOOL.DISTORT ||
          tool === TOOL.PUPPET_WARP
        )
      ) {
        return false;
      }
      const point = api.toDocPoint(event.clientX, event.clientY);
      if (tool === TOOL.PERSPECTIVE) {
        const corners = selected.perspectiveCorners || [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ];
        return corners.some((c) => {
          const m = fromNodeLocal(selected, {
            x: c.x * selected.width,
            y: c.y * selected.height,
          });
          return (
            Math.hypot(m.x - point.x, m.y - point.y) <=
            12 / (api.getViewport()?.zoom || 1)
          );
        });
      }
      if (tool === TOOL.PUPPET_WARP) {
        const pins = selected.puppetPins;
        if (!Array.isArray(pins)) return false;
        return pins.some((pin) => {
          const m = fromNodeLocal(selected, {
            x: pin.x * selected.width,
            y: pin.y * selected.height,
          });
          return (
            Math.hypot(m.x - point.x, m.y - point.y) <=
            12 / (api.getViewport()?.zoom || 1)
          );
        });
      }
      const pts = selected.warpMesh?.points;
      if (!Array.isArray(pts)) return false;
      return pts.some((pt) => {
        const m = fromNodeLocal(selected, {
          x: pt.x * selected.width,
          y: pt.y * selected.height,
        });
        return (
          Math.hypot(m.x - point.x, m.y - point.y) <=
          10 / (api.getViewport()?.zoom || 1)
        );
      });
    })();
    if (warpPoint) {
      stage.style.cursor = "default";
      return;
    }
    const isWarpTool =
      tool === TOOL.PERSPECTIVE ||
      tool === TOOL.DISTORT ||
      tool === TOOL.PUPPET_WARP;
    if (isWarpTool && selected && !selected.locked && !selected.lockPosition) {
      const point = api.toDocPoint(event.clientX, event.clientY);
      const hit = api.nodeAtPoint(point);
      if (hit?.id === selected.id) {
        stage.style.cursor = "move";
        api.setClonePreview?.(null);
        return;
      }
    }
    const handle = crop
      ? cropHandleUnder(crop, event)
      : selected
        ? nodeHandleUnder(selected, event)
        : null;
    if (selected && isCssGradient(selected.fill)) {
      const grabPoint = api.toDocPoint(event.clientX, event.clientY);
      const grabbed = gradientControlGrab(
        selected,
        grabPoint,
        HANDLE_GRAB_RADIUS / (api.getViewport()?.zoom || 1),
      );
      if (grabbed) {
        stage.style.cursor = "default";
        api.setClonePreview?.(null);
        return;
      }
    }
    if (tool === TOOL.SELECT) {
      const point = api.toDocPoint(event.clientX, event.clientY);
      api.setHoveredNode(api.nodeAtPoint(point)?.id ?? null);
    } else if (selected && selected.kind === NODE_KIND.RECT) {
      const isOver =
        nodeRectContains(selected, event) ||
        Boolean(rectRadiusHandleUnder(selected, event));
      api.setHoveredNode(isOver ? selected.id : null);
    } else {
      api.setHoveredNode(null);
    }

    if (handle) {
      const rotation = crop || !selected ? 0 : (selected.rotation ?? 0);
      stage.style.cursor = cursorForHandle(handle, rotation);
      api.setClonePreview?.(null);
      return;
    }
    if (!crop && selected && rectRadiusHandleUnder(selected, event)) {
      stage.style.cursor = "default";
      api.setClonePreview?.(null);
      return;
    }
    if (!crop && selected && rotateHandleUnder(selected, event)) {
      const point = api.toDocPoint(event.clientX, event.clientY);
      const center = {
        x: selected.x + selected.width / 2,
        y: selected.y + selected.height / 2,
      };
      stage.style.cursor = rotationCursorForPoint(center, point);
      api.setClonePreview?.(null);
      return;
    }

    if (tool === TOOL.HEALING && api.getHealingMode?.() === "clone") {
      const point = api.toDocPoint(event.clientX, event.clientY);
      const target =
        selected?.kind === NODE_KIND.IMAGE
          ? selected
          : imageAt(api.getDocument(), point);
      if (target) {
        const source = api.getCloneSource?.();
        const isAligned = api.getCloneAligned?.() ?? true;
        let effectiveSourcePt = source?.point ?? null;
        if (source?.point && isAligned && source.offset) {
          effectiveSourcePt = {
            x: point.x + source.offset.dx,
            y: point.y + source.offset.dy,
          };
        }
        api.setClonePreview?.({
          cursor: point,
          size: api.getBrushWidth?.() ?? 24,
          hardness: api.getBrushHardness?.() ?? 0.5,
          opacity: api.getBrushOpacity?.() ?? 1,
          nodeId: target.id,
          sourcePoint: effectiveSourcePt,
          showSourceCircle: Boolean(event.altKey && source?.point),
        });
        const zoom = api.getViewport()?.zoom ?? 1;
        stage.style.cursor = brushCircleCursor(api.getBrushWidth?.() ?? 24, zoom);
        return;
      }
    }

    api.setClonePreview?.(null);
    stage.style.cursor = "default";
  }

  function refreshBrushCursor() {
    if (lastPointerEvent) updateHoverCursor(lastPointerEvent);
  }

  function clearLastPointerEvent() {
    lastPointerEvent = null;
  }

  return {
    brushCircleCursor,
    updateHoverCursor,
    refreshBrushCursor,
    clearLastPointerEvent,
  };
}
