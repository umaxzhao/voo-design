import { TOOL, bracketBrushAdjustment, bracketReorderDirection } from './editor/editor_constants.js';
import { executeEditorCommand } from './editor/command_table.js';
import { nudgeSelection } from './editor-shortcut-nudge.js';
const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;
/** Return true when this ordered shortcut stage owns the event. */
export function handleDrawingShortcut(event, context) {
  const { engine, toolRef, targetNodeIdRef, nudgedRef, selectedGuideId, onDeleteGuide, onDeleteCanvas, onZoomToFit, onZoomToHundred, onToggleShortcuts } = context;
  if (event.shiftKey && event.code === "Digit1") {
    event.preventDefault();
    if (onZoomToFit) onZoomToFit();
    else engine.zoomToFit();
    return true;
  }
  if (event.shiftKey && event.code === "Digit2") {
    event.preventDefault();
    engine.zoomToSelection?.();
    return true;
  }
  if (event.shiftKey && event.code === "Digit0") {
    event.preventDefault();
    if (onZoomToHundred) onZoomToHundred();
    else engine.zoomToHundred();
    return true;
  }

  if (event.key === "?" || (event.shiftKey && event.code === "Slash")) {
    event.preventDefault();
    onToggleShortcuts?.();
    return true;
  }

  if (event.code === "Backslash" || event.key === "\\") {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      const fg = engine.getColor?.() || "#000000";
      void engine.fillSelection?.(fg);
      return true;
    }
    if (event.altKey) {
      event.preventDefault();
      const bg = engine.getBackgroundColor?.() || "#ffffff";
      void engine.fillSelection?.(bg);
      return true;
    }
    if (event.repeat) return true;
    event.preventDefault();
    engine.setBypassAdjustments?.(true);
    return true;
  }

  const isBrushSizingTool =
    toolRef.current === TOOL.BRUSH ||
    toolRef.current === TOOL.ERASER ||
    toolRef.current === TOOL.HEALING;

  const isBracketGrow = event.code === "BracketRight";
  const isBracketShrink = event.code === "BracketLeft";
  const isPlusKey =
    event.key === "+" ||
    event.key === "=" ||
    event.code === "Equal" ||
    event.code === "NumpadAdd";
  const isMinusKey =
    event.key === "-" ||
    event.key === "_" ||
    event.code === "Minus" ||
    event.code === "NumpadSubtract";

  if (
    isBracketGrow ||
    isBracketShrink ||
    (isBrushSizingTool && (isPlusKey || isMinusKey))
  ) {
    const edit = engine.getMaskEdit?.();
    const grow = isBracketGrow || isPlusKey;
    const adjustment = bracketBrushAdjustment({
      maskEditActive: Boolean(edit),
      brushTool: isBrushSizingTool,
      shiftKey: event.shiftKey && (isBracketGrow || isBracketShrink),
      grow,
    });
    if (adjustment) {
      event.preventDefault();
      if (adjustment.target === "mask") {
        engine.setMaskBrushSize(edit.size + adjustment.delta);
      } else if (adjustment.target === "hardness") {
        engine.setBrushHardness(
          engine.getBrushHardness() + adjustment.delta,
        );
      } else {
        engine.setBrushWidth(engine.getBrushWidth() + adjustment.delta);
      }
      return true;
    }
    const reorder = bracketReorderDirection({
      maskEditActive: Boolean(edit),
      brushTool: isBrushSizingTool,
      hasSelection: Boolean(engine.getSelected()),
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      grow,
    });
    if (reorder !== null && (isBracketGrow || isBracketShrink)) {
      event.preventDefault();
      if (reorder > 0) engine.bringForward();
      else engine.sendBackward();
      return true;
    }
  }

  if (isPlusKey && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    engine.zoomIn?.();
    return true;
  }
  if (isMinusKey && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    engine.zoomOut?.();
    return true;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    // A selected guide owns Delete: removing it must not also remove the
    // selected layer underneath (the ruler overlay selects guides only).
    if (selectedGuideId && onDeleteGuide) {
      event.preventDefault();
      onDeleteGuide(selectedGuideId);
      return true;
    }
    if (event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const fg = engine.getColor?.() || "#000000";
      void engine.fillSelection?.(fg);
      return true;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      const bg = engine.getBackgroundColor?.() || "#ffffff";
      void engine.fillSelection?.(bg);
      return true;
    }
    event.preventDefault();
    if (engine.getPenDraft?.()?.anchors?.length > 0) {
      engine.popDraftAnchor?.();
      return true;
    }
    if (engine.getPolygonDraft?.()?.points?.length > 0) {
      if (typeof engine.popPolygonVertex === "function") {
        engine.popPolygonVertex();
      } else {
        engine.cancelPolygonLasso?.();
      }
      return true;
    }
    if (
      engine.isEditing?.() &&
      (engine.getSelectedAnchorIndex?.() >= 0 ||
        engine.getPenEdit?.()?.active !== null ||
        (engine.getPenEdit?.()?.selected?.length ?? 0) > 0)
    ) {
      if (typeof engine.deleteActiveAnchor === "function") {
        engine.deleteActiveAnchor();
      } else if (typeof engine.deleteSelectedAnchor === "function") {
        engine.deleteSelectedAnchor();
      }
      return true;
    } else if (
      toolRef.current === TOOL.PUPPET_WARP &&
      engine.getSelectedPuppetPin?.()
    ) {
      void engine.deletePuppetPin?.();
    } else if (engine.getMaskEdit?.()?.nodeId) {
      engine.clearMask?.(engine.getMaskEdit().nodeId);
    } else if (engine.getPixelSelection?.()) {
      void executeEditorCommand("delete_selection_pixels", engine, {
        targetNodeId: targetNodeIdRef.current,
      }).catch((err) => {
        if (err?.code !== "NO_SELECTION") {
          console.error("delete_selection_pixels failed", err);
        }
      });
    } else if (
      engine.getSelected?.() ||
      engine.getSelectedGroup?.() ||
      (engine.getSelectedIds?.()?.length ?? 0) > 0
    ) {
      engine.deleteSelected();
    } else if (onDeleteCanvas) {
      onDeleteCanvas();
    }
    return true;
  }

  const arrow = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[event.key];
  if (arrow) {
    event.preventDefault();
    const step = event.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
    const transform = engine.getSelectionTransform?.();
    if (transform?.rect) {
      engine.setSelectionTransform?.({
        rect: {
          ...transform.rect,
          x: transform.rect.x + arrow[0] * step,
          y: transform.rect.y + arrow[1] * step,
        },
      });
      nudgedRef.current = engine;
      return true;
    }
    nudgeSelection(context, arrow[0] * step, arrow[1] * step);
    return true;
  }


  return false;
}
