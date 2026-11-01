import { firstHandledShortcutAction } from '../shared/editor-shortcut-pipeline.js';
import { TOOL } from './editor/tool_ids.js';
import { getFamilyByCode } from './editor/tool_families.js';

/**
 * What Escape does in the editor: undo one level of whatever is in progress.
 */
export function unwindEscape({
  engine,
  tool,
  onTool,
  onDeselectCanvas = null,
}) {
  if (!engine) return false;
  const modalTool =
    tool === TOOL.CROP ||
    tool === TOOL.PERSPECTIVE ||
    tool === TOOL.DISTORT ||
    tool === TOOL.PUPPET_WARP;

  return Boolean(
    firstHandledShortcutAction([
      // An active pointer gesture (move/resize/rotate/draw) unwinds first.
      () => (engine.cancelActiveGesture?.() ? "pointerGesture" : null),
      // A live selection transform cancels whole on Escape (Photoshop's Esc).
      () => {
        if (!engine.getSelectionTransform?.()) return null;
        engine.cancelSelectionTransform?.();
        return "selectionTransform";
      },
      // The pen tool unwinds its own gesture first.
      () => {
        if (!engine.getPenDraft?.()) return null;
        engine.cancelPen();
        if (tool !== TOOL.SELECT) onTool?.(TOOL.SELECT);
        return "penDraft";
      },
      () => {
        if (!engine.isEditing?.()) return null;
        engine.endEdit();
        if (tool !== TOOL.SELECT) onTool?.(TOOL.SELECT);
        return "edit";
      },
      () => {
        if (!engine.getMagneticLassoDraft?.()) return null;
        engine.cancelMagneticLasso?.();
        return "magneticLasso";
      },
      () => {
        if (!engine.getPolygonDraft?.()) return null;
        engine.cancelPolygonLasso();
        return "polygonDraft";
      },
      () => {
        if (!engine.getFreehandDraft?.()) return null;
        engine.cancelFreehandLasso();
        return "freehandDraft";
      },
      () => {
        if (!engine.getLasso?.()) return null;
        engine.cancelLasso?.();
        return "lasso";
      },
      () => {
        if (!engine.getMaskEdit?.()) return null;
        if (typeof engine.endMaskEdit === "function") engine.endMaskEdit();
        else engine.exitMaskEdit?.();
        return "maskEdit";
      },
      () => {
        if (!engine.getIsolatedGroupId?.()) return null;
        engine.exitGroup();
        return "isolatedGroup";
      },
      () => (engine.exitGroup?.() ? "group" : null),
      () => {
        if (!modalTool) return null;
        onTool?.(TOOL.SELECT);
        return "modalTool";
      },
      () => {
        if (
          !engine.getSelected?.() &&
          !engine.getSelectedGroup?.() &&
          !(engine.getSelectedIds?.()?.length > 0)
        ) {
          return null;
        }
        engine.select(null);
        return "selection";
      },
      () => {
        if (typeof onDeselectCanvas === "function") {
          onDeselectCanvas();
          return "canvas";
        }
        return null;
      },
    ]),
  );
}

/**
 * Pure router for tool-family shortcut keys.
 *
 * A tool-family key opens the Pie Menu immediately on keydown — the user's
 * long-standing behaviour. Holding is not required and a quick tap must not
 * cycle the tool family instead of showing the menu.
 *
 * @returns one of:
 *  - { type: "openPie", code, family }  first keydown; caller opens the Pie Menu
 *  - { type: "familyHold", code, family } repeated keydown while already held
 *  - { type: "pieRelease", code }       keyup; caller clears the held key
 *  - null for modifiers or non-family keys
 */
export function resolveToolFamilyKeyAction({
  phase,
  code,
  shiftKey = false,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  repeat = false,
  pressedCode = null,
}) {
  if (shiftKey || ctrlKey || metaKey || altKey) return null;
  const family = getFamilyByCode(code);
  if (!family || family.items.length <= 1) return null;

  if (phase === "keydown") {
    return repeat || pressedCode === code
      ? { type: "familyHold", code, family }
      : { type: "openPie", code, family };
  }
  if (phase === "keyup") {
    if (pressedCode !== code) return null;
    return { type: "pieRelease", code };
  }
  return null;
}

