/**
 * Drawing pointer gestures for the editor stage.
 *
 * Brush, retouch, eraser, healing, clone strokes, eyedropper, and pen tools.
 */

import { contourBounds } from "./mask_contour.js";
import { NODE_KIND } from "./scene_model.js";
import { TOOL } from "./editor_constants.js";
import { createShapesPointerGestures } from "./editor_pointer_shapes.js";

/**
 * Resolves the clone stamp's sample anchor for a stroke start.
 */
export function resolveCloneAnchor(source, strokeStart, aligned) {
  if (!source) {
    return { anchor: strokeStart, nextSource: null };
  }
  if (!aligned) {
    return { anchor: source.point, nextSource: source };
  }
  if (source.offset) {
    return {
      anchor: {
        x: strokeStart.x + source.offset.dx,
        y: strokeStart.y + source.offset.dy,
      },
      nextSource: source,
    };
  }
  const offset = {
    dx: source.point.x - strokeStart.x,
    dy: source.point.y - strokeStart.y,
  };
  const nextSource = { nodeId: source.nodeId, point: source.point, offset };
  return {
    anchor: {
      x: strokeStart.x + offset.dx,
      y: strokeStart.y + offset.dy,
    },
    nextSource,
  };
}

export function createDrawingPointerGestures(ctx) {
  const {
    api,
    imageAt,
    getGesture,
    setGesture,
    getLastBrushPoint,
    setLastBrushPoint,
    resolveCloneAnchor: customResolveAnchor,
  } = ctx;
  const resolveAnchor = customResolveAnchor || resolveCloneAnchor;

  const shapes = createShapesPointerGestures(ctx);

  /** Pointer pressure as the brush understands it; a mouse reads as 0.5. */
  const pressureOf = (event) =>
    typeof event.pressure === "number" && event.pressure > 0
      ? event.pressure
      : 0.5;

  /**
   * The brush settings, captured for one stroke. `event` is the pointerdown
   * that starts it: a pen stroke applies pressure on its own, while mouse and
   * touch leave pressure to the panel toggles.
   */
  const strokeOptions = (mode, event = null) => ({
    mode,
    penStroke: event?.pointerType === "pen",
    size: api.getBrushWidth(),
    hardness: api.getBrushHardness(),
    color: api.getColor(),
    opacity: api.getBrushOpacity(),
    flow: api.getBrushFlow?.(),
    smoothing: api.getBrushSmoothing?.(),
    roundness: api.getBrushRoundness?.(),
    angle: api.getBrushAngle?.(),
    blendMode: api.getBrushBlendMode?.(),
    strength: api.getBrushStrength?.(),
    exposure: api.getBrushExposure?.(),
    tonalRange: api.getBrushTonalRange?.(),
    protectLuminosity: api.getBrushProtectLuminosity?.(),
    saturating: api.getBrushSaturating?.(),
    pressureSize: api.getPressureSize?.(),
    pressureOpacity: api.getPressureOpacity?.(),
  });

  /** Applies the brush's input smoothing without changing Flow or pressure. */
  const smoothBrushPoint = (previous, point) => {
    const amount = Math.min(
      1,
      Math.max(0, Number(api.getBrushSmoothing?.()) || 0),
    );
    if (!previous || amount <= 0) return point;
    const follow = 1 - amount * 0.75;
    return {
      x: previous.x + (point.x - previous.x) * follow,
      y: previous.y + (point.y - previous.y) * follow,
    };
  };

  function startBrush(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const brushMode = api.getBrushMode?.() ?? "normal";
    if (brushMode !== "normal") {
      startRetouch(event, brushMode);
      return;
    }
    if (event.shiftKey && getLastBrushPoint()) {
      api.beginPaintStroke(null, strokeOptions("paint"));
      api.paintStrokeTo(getLastBrushPoint(), 0.5);
      api.paintStrokeTo(point, 0.5);
      void api.finishPaintStroke();
      setLastBrushPoint(point);
      return;
    }
    api.beginPaintStroke(null, strokeOptions("paint", event));
    api.paintStrokeTo(point, pressureOf(event));
    setGesture({ kind: "paint", tool: TOOL.BRUSH, lastPoint: point });
  }

  function startRetouch(event, requestedMode = null) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const selected = api.getSelected();
    const target =
      selected?.kind === NODE_KIND.IMAGE &&
      !selected.locked &&
      !selected.lockImagePixels
        ? selected
        : imageAt(api.getDocument(), point);
    if (!target) return;
    const mode = requestedMode || api.getTool();
    api.beginPaintStroke(target.id, strokeOptions(mode, event));
    api.paintStrokeTo(point, pressureOf(event));
    setGesture({ kind: "paint", tool: mode, lastPoint: point });
  }

  function startEraser(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const selected = api.getSelected();
    let target = null;
    if (
      selected &&
      selected.kind === NODE_KIND.IMAGE &&
      !selected.locked &&
      !selected.lockImagePixels
    ) {
      target = selected;
    } else {
      target = imageAt(api.getDocument(), point);
    }
    if (!target) return;
    if (!api.beginPaintStroke(target.id, strokeOptions("erase", event))) return;
    api.paintStrokeTo(point, pressureOf(event));
    setGesture({ kind: "paint", tool: TOOL.ERASER, lastPoint: point });
  }

  function startHealing(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const selected = api.getSelected();
    let target = null;
    if (
      selected &&
      selected.kind === NODE_KIND.IMAGE &&
      !selected.locked &&
      !selected.lockImagePixels
    ) {
      target = selected;
    } else {
      target = imageAt(api.getDocument(), point);
    }
    if (!target) {
      api.setRegionHint?.("editor.healing.needImage", "error");
      return;
    }
    // Healing modes share TOOL.HEALING. The move/finish dispatchers consume
    // targetId and mode; using nodeId/tool here silently discarded every stroke.
    const mode = api.getHealingMode?.() ?? "aiRepair";
    if (mode === "clone") {
      const cloneSource = api.getCloneSource?.();
      if (event.altKey) {
        api.setCloneSource?.({
          nodeId: target.id,
          point,
          offset: null,
        });
        return;
      }
      const aligned = api.getCloneAligned?.() ?? true;
      const { anchor: sourceAnchor, nextSource } = resolveAnchor(
        cloneSource,
        point,
        aligned,
      );
      if (nextSource !== cloneSource) {
        api.setCloneSource?.(nextSource);
      }
      setGesture({
        kind: "cloneStamp",
        targetId: target.id,
        sourceAnchor,
        targetAnchor: point,
        points: [point],
        size: api.getBrushWidth(),
        hardness: api.getBrushHardness(),
        opacity: api.getBrushOpacity(),
      });
      return;
    }
    if (mode === "patch") {
      const patch = api.getPatchDraft?.();
      if (patch && patch.points && patch.points.length >= 3) {
        setGesture({
          kind: "patchDrag",
          patch,
          start: point,
          targetId: target.id,
        });
        return;
      }
      setGesture({
        kind: "patchLasso",
        targetId: target.id,
        points: [point],
      });
      return;
    }
    const size = api.getBrushWidth();
    setGesture({
      kind: "healing",
      mode,
      targetId: target.id,
      points: [point],
      size,
    });
    api.setRemoveStroke?.({
      points: [[point.x, point.y]],
      size,
      closed: false,
    });
  }

  function extendObjectStroke(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    const last = gesture.points[gesture.points.length - 1];
    if (Math.hypot(point.x - last[0], point.y - last[1]) < 1) return;
    gesture.points.push([point.x, point.y]);
    if (gesture.points.length < 3) return;
    const contours = [gesture.points.slice()];
    api.combinePixelSelection(
      gesture.baseSelection ?? null,
      {
        nodeId: gesture.hostId,
        contours,
        bounds: contourBounds(contours),
      },
      gesture.mode ?? "replace",
    );
  }

  function extendRemoveBrush(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    const last = gesture.points[gesture.points.length - 1];
    if (Math.hypot(point.x - last[0], point.y - last[1]) < 1) return;
    gesture.points.push([point.x, point.y]);
    api.setRemoveStroke?.({ points: gesture.points, size: gesture.size });
  }

  function pickColor(event) {
    const hex = api.sampleColorAt(api.toDocPoint(event.clientX, event.clientY));
    if (!hex) return false;
    api.setColor(hex);
    return true;
  }

  function penEditPress(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const mod = event.metaKey || event.ctrlKey;
    const subTool = api.getPenSubTool?.() ?? "move";
    if (subTool === "lasso") {
      api.lassoDown(point);
      setGesture({ kind: "penLasso" });
      return;
    }
    if (subTool === "bend") {
      if (api.bendDown(point)) setGesture({ kind: "penBend" });
      return;
    }
    if (subTool === "cut") {
      api.cutAt(point);
      return;
    }
    if (api.editDown(point, { convert: event.altKey })) {
      setGesture({ kind: "penEdit" });
    } else if (!mod && !event.altKey) api.endEdit();
  }

  function startPen(event, toolKind = "pen") {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const mod = event.metaKey || event.ctrlKey;
    if (api.isEditing()) {
      penEditPress(event);
      return;
    }
    if (mod) {
      const selected = api.getSelected();
      if (
        selected &&
        selected.kind === NODE_KIND.PATH &&
        selected.pen === true
      ) {
        api.beginEdit(selected.id);
        if (api.editDown(point, { convert: event.altKey })) {
          setGesture({ kind: "penEdit" });
          return;
        }
      }
    }
    const committed = api.penDown(
      point,
      api.getColor(),
      api.getPenStrokeWidth?.() ?? 1,
      toolKind,
      {
        constrain: event.shiftKey,
      },
    );
    if (!committed) setGesture({ kind: "pen" });
  }

  return {
    pressureOf,
    smoothBrushPoint,
    startBrush,
    startRetouch,
    startEraser,
    startHealing,
    extendObjectStroke,
    extendRemoveBrush,
    pickColor,
    penEditPress,
    startPen,
    ...shapes,
  };
}
