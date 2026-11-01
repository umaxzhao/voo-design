/**
 * Grid snapping helpers for shape and vector drawing gestures.
 *
 * Ensures newly drawn shapes (rectangles, ellipses, frames, polygons, stars,
 * and arrows) have origin coordinates and dimensions aligned to grid multiples
 * when 'voo.editor.snapToGrid' is active.
 */

import { getSetting } from "../../shared/settings.js";
import { SNAP_SETTING_KEYS } from "./scene_snapping.js";
import * as ops from "./doc_ops.js";

/** Default grid size when neither engine grid nor setting provides one. */
export const DEFAULT_SHAPE_GRID_SIZE = 8;

/**
 * Determines whether snap-to-grid should be active for the current pointer event.
 * Modifier keys (Ctrl / Cmd) or engine disabling temporarily turn off snapping.
 */
export function isSnapToGridActive(api, event = null) {
  if (event && (event.metaKey || event.ctrlKey)) {
    return false;
  }
  if (api?.getSnappingEnabled?.() === false) {
    return false;
  }
  if (typeof api?.getSnapToGrid === "function") {
    return Boolean(api.getSnapToGrid());
  }
  const settingKey = SNAP_SETTING_KEYS?.snapToGrid || "voo.editor.snapToGrid";
  return getSetting(settingKey) === true;
}

/**
 * Resolves the effective grid size from settings, engine grid, or default.
 */
export function getShapeGridSize(api) {
  const settingKey = SNAP_SETTING_KEYS?.gridSize || "voo.editor.gridSize";
  const fromSetting = Number(getSetting(settingKey));
  if (Number.isFinite(fromSetting) && fromSetting > 0) {
    return fromSetting;
  }
  const fromApi = Number(api?.getGrid?.()?.size);
  if (Number.isFinite(fromApi) && fromApi > 0) {
    return fromApi;
  }
  return DEFAULT_SHAPE_GRID_SIZE;
}

/**
 * Snaps a single scalar coordinate to the nearest grid line.
 */
export function snapCoordinateToGrid(val, gridSize = DEFAULT_SHAPE_GRID_SIZE) {
  if (!Number.isFinite(val)) return 0;
  const size = Number(gridSize) > 0 ? Number(gridSize) : DEFAULT_SHAPE_GRID_SIZE;
  return Math.round(val / size) * size;
}

/**
 * Snaps a 2D point (x, y) to the nearest grid vertex.
 */
export function snapPointToGrid(point, gridSize = DEFAULT_SHAPE_GRID_SIZE) {
  if (!point) return { x: 0, y: 0 };
  return {
    x: snapCoordinateToGrid(point.x, gridSize),
    y: snapCoordinateToGrid(point.y, gridSize),
  };
}

/**
 * Snaps bounding box position and dimensions to exact grid multiples.
 */
export function snapBoxToGrid(box, gridSize = DEFAULT_SHAPE_GRID_SIZE) {
  if (!box) return { x: 0, y: 0, width: 0, height: 0 };
  const size = Number(gridSize) > 0 ? Number(gridSize) : DEFAULT_SHAPE_GRID_SIZE;
  return {
    ...box,
    x: snapCoordinateToGrid(box.x, size),
    y: snapCoordinateToGrid(box.y, size),
    width: Math.round((box.width ?? 0) / size) * size,
    height: Math.round((box.height ?? 0) / size) * size,
  };
}

/** A node drawn from `point` joins the frame the drag starts inside. */
export function insideFrame(doc, node, point) {
  const frame = ops.frameAtPoint(doc, point);
  return frame ? { ...node, parentId: frame.id } : node;
}

/**
 * Calculates snapped endpoints for arrow and line drawing.
 */
export function calculateArrowEndpoints({
  start,
  point,
  shiftKey = false,
  altKey = false,
  snapActive = false,
  gridSize = DEFAULT_SHAPE_GRID_SIZE,
}) {
  let dx = point.x - start.x;
  let dy = point.y - start.y;
  if (shiftKey) {
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    dx = Math.cos(snapped) * length;
    dy = Math.sin(snapped) * length;
  }
  let startX = altKey ? start.x - dx : start.x;
  let startY = altKey ? start.y - dy : start.y;
  let endX = start.x + dx;
  let endY = start.y + dy;
  if (snapActive) {
    startX = snapCoordinateToGrid(startX, gridSize);
    startY = snapCoordinateToGrid(startY, gridSize);
    endX = snapCoordinateToGrid(endX, gridSize);
    endY = snapCoordinateToGrid(endY, gridSize);
  }
  return [
    [startX, startY],
    [endX, endY],
  ];
}

/**
 * Resolves start point (raw and snapped) for free canvas drawing.
 */
export function resolveFreeDrawingStart({ targetEngine, event }) {
  const rawPoint = targetEngine.toDocPoint(event.clientX, event.clientY);
  const snapActive = isSnapToGridActive(targetEngine, event);
  const gridSize = getShapeGridSize(targetEngine);
  const point = snapActive ? snapPointToGrid(rawPoint, gridSize) : rawPoint;
  return { point, rawPoint };
}

/**
 * Calculates snapped bounding box for free canvas drawing move gestures.
 */
export function calculateFreeDrawingBox({ engine, event, drawing }) {
  const rawPoint = engine.toDocPoint(event.clientX, event.clientY);
  const snapActive = isSnapToGridActive(engine, event);
  const gridSize = getShapeGridSize(engine);
  const start = snapActive
    ? snapPointToGrid(drawing.rawStart ?? drawing.start, gridSize)
    : (drawing.rawStart ?? drawing.start);
  const point = snapActive ? snapPointToGrid(rawPoint, gridSize) : rawPoint;
  const box = {
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    width: Math.abs(point.x - start.x),
    height: Math.abs(point.y - start.y),
  };
  return snapActive ? snapBoxToGrid(box, gridSize) : box;
}
