import { TOOL, bracketBrushAdjustment } from './editor/editor_constants.js';
import { getNodeWarpTool } from './editor/perspective_geometry.js';
import { executeEditorCommand } from './editor/command_table.js';
/** Return true when this ordered shortcut stage owns the event. */
export function handleModifierShortcut(event, context) {
  const { engine, toolRef, targetNodeIdRef, onSaveAs, onSave, onApply, onOpen, onDuplicateCanvas, onZoomToHundred, onTool, onNew, onZoomStep, onZoomToFit } = context;
  if (event.metaKey || event.ctrlKey) {
    switch (event.code) {
      case "KeyU":
        if (event.altKey) {
          event.preventDefault();
          engine.destructiveBoolean?.("union");
          return true;
        }
        break;
      case "KeyS":
        if (event.altKey) {
          event.preventDefault();
          engine.destructiveBoolean?.("subtract");
        } else {
          event.preventDefault();
          if (event.shiftKey) {
            if (onSaveAs) onSaveAs();
            else if (onSave) onSave({ saveAs: true });
            else onApply?.();
          } else if (onSave) {
            onSave({ saveAs: false });
          } else {
            onApply?.();
          }
        }
        return true;
      case "KeyI":
        if (event.altKey) {
          event.preventDefault();
          engine.destructiveBoolean?.("intersect");
          return true;
        }
        break;
      case "KeyX":
        if (event.altKey) {
          event.preventDefault();
          engine.destructiveBoolean?.("exclude");
          return true;
        }
        if (engine.getPixelSelection?.()) {
          event.preventDefault();
          void engine.cutSelectionPixels?.();
          return true;
        }
        if (engine.getSelected() || engine.getSelectedIds?.()?.length) {
          event.preventDefault();
          engine.cut();
          return true;
        }
        return true;
      case "KeyO":
        if (event.shiftKey && event.altKey) {
          event.preventDefault();
          engine.expandSelectedStroke?.();
        } else if (event.shiftKey) {
          event.preventDefault();
          engine.convertSelectedToPath?.();
        } else {
          event.preventDefault();
          onOpen?.();
        }
        return true;
      case "KeyD":
        event.preventDefault();
        if (engine.getPixelSelection?.()?.contours?.length) {
          engine.clearPixelSelection?.();
          return true;
        }
        if (event.shiftKey) {
          engine.select(null);
          return true;
        }
        if (
          engine.getSelected?.() ||
          (engine.getSelectedIds?.()?.length ?? 0) > 0
        ) {
          engine.duplicateSelected();
        } else if (onDuplicateCanvas) {
          onDuplicateCanvas();
        }
        return true;
      case "KeyA":
        event.preventDefault();
        engine.selectAll();
        return true;
      case "KeyC": {
        if (event.altKey) {
          event.preventDefault();
          engine.copyStyle?.();
          return true;
        }
        const hasTextSelection =
          (window.getSelection()?.toString().length ?? 0) > 0;
        if (hasTextSelection) return true;
        if (engine.getPixelSelection?.()) {
          event.preventDefault();
          void engine.copySelectionPixels?.();
          return true;
        }
        if (engine.getSelected() || engine.getSelectedIds?.()?.length) {
          event.preventDefault();
          engine.copy();
          return true;
        }
        return true;
      }
      case "KeyV": {
        if (event.altKey) {
          event.preventDefault();
          engine.pasteStyle?.();
          return true;
        }
        if (engine.canPasteFromInternalClipboard?.()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          engine.paste();
          return true;
        }
        // Otherwise the paste event carries system clipboard data for
        // external images, SVGs, or an application-owned layer copy.
        return true;
      }
      case "KeyJ":
        event.preventDefault();
        if (engine.getPixelSelection?.()) {
          void executeEditorCommand("layer_via_copy", engine, {
            targetNodeId: targetNodeIdRef.current,
          }).catch((err) => {
            if (err?.code !== "NO_SELECTION") {
              console.error("layer_via_copy failed", err);
            }
          });
          return true;
        }
        engine.duplicateSelected();
        return true;
      case "BracketRight": {
        event.preventDefault();
        const edit = engine.getMaskEdit?.();
        const brushArmed =
          toolRef.current === TOOL.BRUSH ||
          toolRef.current === TOOL.ERASER ||
          toolRef.current === TOOL.HEALING;
        if (edit || brushArmed) {
          const adjustment = bracketBrushAdjustment({
            maskEditActive: Boolean(edit),
            brushTool: brushArmed,
            shiftKey: event.shiftKey,
            grow: true,
          });
          if (adjustment) {
            if (adjustment.target === "mask") {
              engine.setMaskBrushSize(edit.size + adjustment.delta);
            } else if (adjustment.target === "hardness") {
              engine.setBrushHardness(
                engine.getBrushHardness() + adjustment.delta,
              );
            } else {
              engine.setBrushWidth(
                engine.getBrushWidth() + adjustment.delta,
              );
            }
            return true;
          }
        }
        engine.bringToFront();
        return true;
      }
      case "BracketLeft": {
        event.preventDefault();
        const edit = engine.getMaskEdit?.();
        const brushArmed =
          toolRef.current === TOOL.BRUSH ||
          toolRef.current === TOOL.ERASER ||
          toolRef.current === TOOL.HEALING;
        if (edit || brushArmed) {
          const adjustment = bracketBrushAdjustment({
            maskEditActive: Boolean(edit),
            brushTool: brushArmed,
            shiftKey: event.shiftKey,
            grow: false,
          });
          if (adjustment) {
            if (adjustment.target === "mask") {
              engine.setMaskBrushSize(edit.size + adjustment.delta);
            } else if (adjustment.target === "hardness") {
              engine.setBrushHardness(
                engine.getBrushHardness() + adjustment.delta,
              );
            } else {
              engine.setBrushWidth(
                engine.getBrushWidth() + adjustment.delta,
              );
            }
            return true;
          }
        }
        engine.sendToBack();
        return true;
      }
      case "Digit0":
        event.preventDefault();
        if (onZoomToHundred) onZoomToHundred();
        else engine.zoomToHundred();
        return true;
      case "KeyT": {
        event.preventDefault();
        if (engine.getPixelSelection?.()?.bounds) {
          if (engine.beginSelectionTransform?.()) {
            return true;
          }
        }
        const selectedNodes = engine.getSelectedNodes?.() ?? [];
        const activeNode = selectedNodes[0] || null;
        const targetTool = getNodeWarpTool(activeNode, TOOL.SELECT_REGION);
        onTool(targetTool);
        return true;
      }
      case "KeyG":
        event.preventDefault();
        if (event.altKey) {
          if (event.shiftKey) engine.releaseClippingMask();
          else engine.createClippingMask();
        } else if (event.shiftKey) engine.ungroupSelection();
        else engine.groupSelection();
        return true;
      case "KeyN":
        event.preventDefault();
        onNew?.();
        return true;
      case "Equal":
      case "NumpadAdd":
        event.preventDefault();
        if (onZoomStep) onZoomStep(1);
        else engine.zoomStep(1);
        return true;
      case "Minus":
      case "NumpadSubtract":
        event.preventDefault();
        if (onZoomStep) onZoomStep(-1);
        else engine.zoomStep(-1);
        return true;
      case "Digit0":
      case "Numpad0":
        event.preventDefault();
        if (onZoomToFit) onZoomToFit();
        else engine.zoomToFit();
        return true;
      case "Digit1":
      case "Numpad1":
        event.preventDefault();
        if (onZoomToHundred) onZoomToHundred();
        else engine.zoomToHundred();
        return true;
      case "Digit2":
      case "Numpad2":
        event.preventDefault();
        engine.zoomToSelection?.();
        return true;
      default:
        break;
    }
  }


  return false;
}
