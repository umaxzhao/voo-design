import { HISTORY_SHORTCUT_ACTION, historyShortcutAction, MAGNETIC_LASSO_SHORTCUT_ACTION, magneticLassoShortcutAction } from '../shared/editor-shortcut-pipeline.js';
import { TOOL } from './editor/tool_ids.js';
import { unwindEscape } from './editor-shortcut-actions.js';
/** Return true when this ordered shortcut stage owns the event. */
export function handleGestureShortcut(event, context) {
  const { engine, pressedFamilyCodeRef, onClosePieMenu, onTool, onDeselectCanvas, onRedo, onUndo, activeTool, isCropArmed } = context;
  const magneticAction = magneticLassoShortcutAction(event, {
    active: Boolean(engine.getMagneticLassoDraft?.()),
  });
  if (magneticAction) {
    event.preventDefault();
    if (magneticAction === MAGNETIC_LASSO_SHORTCUT_ACTION.CANCEL)
      engine.cancelMagneticLasso?.();
    else if (magneticAction === MAGNETIC_LASSO_SHORTCUT_ACTION.FINISH)
      engine.finishMagneticLasso?.();
    else if (
      magneticAction === MAGNETIC_LASSO_SHORTCUT_ACTION.REMOVE_ANCHOR
    )
      engine.removeMagneticLassoAnchor?.();
    else engine.setMagneticLassoStraight?.(true);
    return true;
  }

  if (event.key === "Escape") {
    if (event.isComposing) return true;
    if (pressedFamilyCodeRef.current) {
      pressedFamilyCodeRef.current = null;
      onClosePieMenu?.();
    }
    unwindEscape({
      engine,
      tool: activeTool,
      onTool,
      onDeselectCanvas,
    });
    return true;
  }

  const isWarpTool =
    activeTool === TOOL.SELECT_REGION ||
    activeTool === TOOL.PERSPECTIVE ||
    activeTool === TOOL.DISTORT ||
    activeTool === TOOL.PUPPET_WARP;

  if (event.key === "Enter" && engine.getSelectionTransform?.()) {
    event.preventDefault();
    void engine.applySelectionTransform?.();
    return true;
  }

  if (event.key === "Enter" && isCropArmed && engine.getCropRect?.()) {
    event.preventDefault();
    engine.applyCrop?.();
    onTool(TOOL.SELECT);
    return true;
  }

  if (event.key === "Enter" && isWarpTool) {
    event.preventDefault();
    engine.commit?.();
    onTool(TOOL.SELECT);
    return true;
  }

  if (
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    engine.isEditing?.()
  ) {
    event.preventDefault();
    engine.endEdit();
    return true;
  }

  if (event.key === "Enter" && engine.getPenDraft?.()) {
    event.preventDefault();
    engine.finishPen();
    return true;
  }

  if (event.key === "Enter" && engine.getPolygonDraft?.()) {
    event.preventDefault();
    engine.closePolygonLasso();
    return true;
  }

  if (event.key === "Enter") {
    const selected = engine.getSelected();
    if (selected && selected.kind === "group") {
      event.preventDefault();
      engine.enterGroup(selected.id);
      return true;
    }
    if (selected && selected.kind === "pen") {
      event.preventDefault();
      engine.startEdit(selected.id);
      return true;
    }
  }

  const historyAction = historyShortcutAction(event);
  if (historyAction) {
    event.preventDefault();
    if (historyAction === HISTORY_SHORTCUT_ACTION.REDO)
      void (onRedo ? onRedo() : engine.redo());
    else void (onUndo ? onUndo() : engine.undo());
    return true;
  }


  return false;
}
