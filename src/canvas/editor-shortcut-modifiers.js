import { TOOL } from './editor/editor_constants.js';
import { getNodeWarpTool } from './editor/perspective_geometry.js';
import { executeEditorCommand } from './editor/command_table.js';
import { alignNodes } from './editor/align_ops.js';
/** Return true when this ordered shortcut stage owns the event. */
export function handleModifierShortcut(event, context) {
  const { engine, toolRef, targetNodeIdRef, onSaveAs, onSave, onApply, onOpen, onDuplicateCanvas, onZoomToHundred, onTool, onNew, onZoomStep, onZoomToFit, onToggleAgent } = context;
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
      case "KeyL":
        if (event.shiftKey) {
          event.preventDefault();
          const ids = engine.getSelectedIds?.() ?? (engine.getSelected?.() ? [engine.getSelected().id] : []);
          for (const id of ids) {
            engine.toggleLockNode?.(id);
          }
          return true;
        }
        break;
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
        if (event.altKey) {
          event.preventDefault();
          if (onToggleAgent) onToggleAgent();
          else if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("voo:toggle-agent-panel"));
          }
          return true;
        }
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
      case "BracketRight":
        event.preventDefault();
        engine.bringToFront?.();
        return true;
      case "BracketLeft":
        event.preventDefault();
        engine.sendToBack?.();
        return true;
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
          else engine.frameSelection?.();
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

  if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    const alignmentTypes = {
      KeyA: "left",
      KeyD: "right",
      KeyW: "top",
      KeyS: "bottom",
      KeyH: "hcenter",
      KeyV: "vcenter",
    };
    const type = alignmentTypes[event.code];
    if (type && typeof engine.layoutSelection === "function") {
      const selectedNodes = engine.getSelectedNodes?.() ?? [];
      const single = selectedNodes[0] ?? engine.getSelected?.();
      if (selectedNodes.length > 1 || single?.parentId) {
        event.preventDefault();
        engine.layoutSelection(alignNodes, type);
        return true;
      }
    }
  }

  return false;
}
