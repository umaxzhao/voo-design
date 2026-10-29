/**
 * Pointer down tool routing and double-click handlers for the editor stage.
 */

import { NODE_KIND } from "./scene_model.js";
import { TOOL, toolUsesColor } from "./editor_constants.js";
import { marqueeItemForMode } from "./tool_families.js";

export function createPointerDownDispatcher({
  api,
  shared,
  pan,
  drawing,
  shapes,
  marquee,
  selection,
  transform,
  setGesture,
}) {
  function dispatchDown(event, spaceDown) {
    if (spaceDown || event.button === 1 || api.getTool() === TOOL.HAND) {
      if (!shared) pan.startPan(event);
    } else if (event.altKey && toolUsesColor(api.getTool())) {
      drawing.pickColor(event);
    } else if (api.getTool() === TOOL.DROPPER) {
      if (drawing.pickColor(event)) api.setTool(api.getToolBeforeDropper());
    } else if (api.getTool() === TOOL.FILL) {
      const fillCol = event.altKey
        ? api.getToolBackgroundColor?.() ?? api.getBackgroundColor?.() ?? "#ffffff"
        : api.getColor();
      void api.fillSelection?.(fillCol, {
        opacity: api.getFillOpacity?.() ?? 1,
        point: api.toDocPoint(event.clientX, event.clientY),
        tolerance: api.getFillTolerance?.() ?? 32,
        contiguous: api.getFillContiguous?.() ?? true,
        sampleAll: api.getFillSampleAll?.() ?? false,
      });
    } else if (api.getTool() === TOOL.GRADIENT) {
      setGesture({
        kind: "gradient",
        start: api.toDocPoint(event.clientX, event.clientY),
      });
    } else if (api.getSelectionTransform?.()) {
      transform.startSelectionTransformDrag(event);
    } else if (
      api.getTool() === TOOL.BRUSH ||
      api.getTool() === TOOL.ERASER ||
      api.getTool() === TOOL.HEALING ||
      [
        TOOL.BLUR,
        TOOL.SHARPEN,
        TOOL.SMUDGE,
        TOOL.DODGE,
        TOOL.BURN,
        TOOL.SPONGE,
      ].includes(api.getTool())
    ) {
      if (api.getMaskEdit()) {
        setGesture({ kind: "maskPaint" });
        api.beginMaskStroke();
        api.paintMaskStroke(api.toDocPoint(event.clientX, event.clientY));
      } else if (api.getTool() === TOOL.BRUSH) {
        drawing.startBrush(event);
      } else if (
        [
          TOOL.BLUR,
          TOOL.SHARPEN,
          TOOL.SMUDGE,
          TOOL.DODGE,
          TOOL.BURN,
          TOOL.SPONGE,
        ].includes(api.getTool())
      ) {
        drawing.startRetouch(event);
      } else if (api.getTool() === TOOL.ERASER) {
        drawing.startEraser(event);
      } else {
        drawing.startHealing(event);
      }
    } else if (api.getTool() === TOOL.ARROW) {
      shapes.startArrow(event);
    } else if (api.getTool() === TOOL.LINE) {
      shapes.startArrow(event, { line: true });
    } else if (
      api.getTool() === TOOL.FRAME ||
      api.getTool() === TOOL.RECT ||
      api.getTool() === TOOL.ELLIPSE
    ) {
      shapes.startShape(event);
    } else if (api.getTool() === TOOL.POLYGON || api.getTool() === TOOL.STAR) {
      shapes.startPolyShape(event);
    } else if (api.getTool() === TOOL.TEXT) {
      shapes.startText(event);
    } else if (api.getTool() === TOOL.PEN) {
      drawing.startPen(event, "pen");
    } else if (api.getTool() === TOOL.CURVATURE_PEN) {
      drawing.startPen(event, "curvature_pen");
    } else if (api.getTool() === TOOL.FREE_PEN) {
      drawing.startPen(event, "free_pen");
    } else if (api.getTool() === TOOL.LASSO) {
      marquee.startLassoDrag(event);
    } else if (api.getTool() === TOOL.WAND) {
      marquee.startWandSelect(event);
    } else if (api.getTool() === TOOL.MARQUEE) {
      const interaction = marqueeItemForMode(
        api.getMarqueeMode?.(),
      )?.interaction;
      if (interaction === "magicWand") marquee.startWandSelect(event);
      else if (interaction === "polygonLasso") marquee.clickPolygonVertex(event);
      else if (interaction === "magneticLasso") marquee.clickMagneticAnchor(event);
      else marquee.startPixelMarquee(event);
    } else if (api.getTool() === TOOL.SELECT_REGION) {
      if (api.getSelectionTransform?.()) {
        transform.startSelectDrag(event);
      } else {
        marquee.startPixelMarquee(event);
      }
    } else if (api.getTool() === TOOL.REGION) {
      selection.startRegion(event);
    } else if (api.getTool() === TOOL.CROP) {
      transform.startCropDrag(event);
    } else {
      transform.startSelectDrag(event);
    }
  }

  return { dispatchDown };
}

export function handleEditorDoubleClick(event, { api }) {
  if (api.getTool() === TOOL.CROP && api.getCropRect?.()) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const rect = api.getCropRect();
    const inside =
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height;
    if (inside) {
      api.applyCrop();
      api.setTool(TOOL.SELECT);
      return;
    }
    return;
  }
  if (
    api.getTool() === TOOL.MARQUEE &&
    api.getMarqueeMode?.() === "poly" &&
    api.getPolygonDraft?.()
  ) {
    api.closePolygonLasso();
    return;
  }
  if (
    api.getTool() === TOOL.MARQUEE &&
    api.getMarqueeMode?.() === "magnetic" &&
    api.getMagneticLassoDraft?.()
  ) {
    api.finishMagneticLasso?.();
    return;
  }
  const currentTool = api.getTool();
  if (
    (currentTool === TOOL.PEN ||
      currentTool === TOOL.CURVATURE_PEN ||
      currentTool === TOOL.FREE_PEN) &&
    api.getPenDraft?.()
  ) {
    api.finishPen();
    return;
  }
  const point = api.toDocPoint(event.clientX, event.clientY);
  const hit = api.nodeAtPoint(point);
  if (!hit) return;
  if (hit.kind === NODE_KIND.TEXT) {
    api.select(hit.id);
    api.beginTextEdit(hit.id);
    return;
  }
  if (api.getTool() === TOOL.SELECT && api.enterGroup(hit.id)) return;
  if (hit.kind === NODE_KIND.PATH && hit.pen === true) {
    api.select(hit.id);
    api.beginEdit(hit.id);
    return;
  }
  if (hit.kind === NODE_KIND.IMAGE) {
    if (hit.locked) return;
    api.select(hit.id);
    api.setTool(TOOL.CROP);
    return;
  }
  if (hit.kind === NODE_KIND.REGION) {
    api.select(hit.id);
    api.beginRegionLabelEdit(hit.id);
  }
}
