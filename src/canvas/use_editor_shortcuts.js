import { handleExportShortcut } from "./editor/export_shortcut.js";
import { useEffect, useRef } from "react";
import {
  isTextEditingTarget,
  isNonTextControlTarget,
  shortcutBlockedByTarget,
} from "../shared/dom_targets.js";
import {
  firstHandledShortcutAction,
  HISTORY_SHORTCUT_ACTION,
  historyShortcutAction,
  MAGNETIC_LASSO_SHORTCUT_ACTION,
  magneticLassoShortcutAction,
} from "../shared/editor-shortcut-pipeline.js";
import {
  TOOL,
  TOOL_KEYS,
  TOOL_SHIFT_KEYS,
  bracketBrushAdjustment,
  bracketReorderDirection,
  toggleToolKey,
} from "./editor/editor_constants.js";
import {
  getFamilyByCode,
  marqueeItemForMode,
  MARQUEE_MODE_IDS,
} from "./editor/tool_families.js";
import { getNodeWarpTool } from "./editor/perspective_geometry.js";
import { executeEditorCommand } from "./editor/command_table.js";
export { resolveTargetEditorBridge } from "./editor/editor_target_resolver.js";

/** Small grid step for arrow-key nudges; Shift multiplies it (Figma uses ×10). */
const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;
const EDITOR_FOCUS_SURFACE_SELECTOR =
  '[data-testid="editor-pages"] canvas, [data-editor-artboard], [data-testid="editor-three-instance-input"]';
const EDITOR_NATIVE_CONTROL_SELECTOR =
  'input, select, textarea, button, a[href], [contenteditable], [role="link"], [role="button"], [role="listbox"]';

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

export function useEditorShortcuts({
  engine,
  canvasType: propCanvasType = null,
  enabled = true,
  modalOpen = false,
  onUndo,
  onRedo,
  targetNodeId = null,
  tool,
  onTool,
  onApply,
  onSave,
  onSaveAs,
  onOpen,
  onNew,
  onSaveAndExit,
  onZoomStep,
  onZoomToFit,
  onZoomToHundred,
  onToggleShortcuts,
  onToggleRulers,
  onToggleGuides,
  onClearGuides,
  onToggleSnapToGrid,
  onToggleComments,
  onToggleCommentMode,
  onToggleCommandPalette,
  onOpenFindReplace,
  selectedGuideId = null,
  onDeleteGuide,
  onSwapColors,
  onDeleteCanvas,
  onDuplicateCanvas,
  onDeselectCanvas,
  onCreateComponent,
  onDetachInstance,
  onOpenPieMenu,
  onClosePieMenu,
}) {
  const currentCanvasType =
    propCanvasType ??
    engine?.doc?.canvasType ??
    (typeof engine?.getCanvasType === "function"
      ? engine.getCanvasType()
      : null) ??
    (typeof engine?.getDocument === "function"
      ? engine.getDocument()?.canvasType
      : null);

  const activeTargetNodeId =
    targetNodeId ?? engine?.sourceWorkflowNodeId ?? null;
  const targetNodeIdRef = useRef(activeTargetNodeId);
  targetNodeIdRef.current = activeTargetNodeId;
  /** Set while arrow keys move a node; one snapshot per nudge burst. */
  const nudgedRef = useRef(false);
  /** The tool used before the last keyboard tool switch — the toggle target. */
  const lastToolRef = useRef(null);
  /** Stores timestamp and first digit for quick double-digit opacity entries (e.g. 4 + 5 = 45%). */
  const opacityDigitTimerRef = useRef({ time: 0, firstDigit: null });
  /** Latest tool value for the keydown closure. */
  const toolRef = useRef(tool);
  toolRef.current = tool;

  /** Track mouse position so Pie Menu can appear right at the cursor. */
  const mousePosRef = useRef({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  useEffect(() => {
    const onMove = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove, {
      passive: true,
      capture: true,
    });
    return () =>
      window.removeEventListener("pointermove", onMove, { capture: true });
  }, []);

  /** Track currently pressed family key to show/hide Pie Menu */
  const pressedFamilyCodeRef = useRef(null);

  /** Keep canvas focus after pointer editing without affecting Tab traversal. */
  useEffect(() => {
    if (!enabled) return undefined;
    const onSurfacePointerDown = (event) => {
      if (
        modalOpen ||
        event.defaultPrevented ||
        event.target.closest?.(EDITOR_NATIVE_CONTROL_SELECTOR) ||
        event.target.closest?.('[role="dialog"], [role="menu"]')
      )
        return;
      const surface = event.target.closest?.(EDITOR_FOCUS_SURFACE_SELECTOR);
      if (!(surface instanceof HTMLElement)) return;
      // Canvas is not natively focusable. A real editing gesture must establish
      // shortcut ownership without adding a stop to native control traversal.
      if (!surface.hasAttribute("tabindex")) surface.tabIndex = -1;
      surface.focus({ preventScroll: true });
    };
    window.addEventListener("pointerdown", onSurfacePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onSurfacePointerDown, true);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !engine) return undefined;

    const nudge = (dx, dy) => {
      if (engine.isEditing?.()) {
        const moved = engine.nudgeActiveAnchor?.(dx, dy);
        if (moved) {
          nudgedRef.current = true;
          return;
        }
      }
      const selectedNodes = engine.getSelectedNodes?.() ?? [
        engine.getSelected(),
      ];
      const movableNodes = selectedNodes.filter(
        (node) => node && !node.locked && !node.lockPosition,
      );
      if (movableNodes.length === 0) return;
      if (typeof engine.moveNodesBy === "function") {
        engine.moveNodesBy(
          movableNodes.map((node) => node.id),
          dx,
          dy,
          { commit: false },
        );
      } else {
        for (const node of movableNodes) {
          engine.moveNodeBy?.(node.id, dx, dy, { commit: false });
        }
      }
      nudgedRef.current = true;
    };

    const onKeyDown = (event) => {
      // Require three modifiers so saving and exiting cannot happen by accident.
      if (
        event.code === "KeyE" &&
        event.ctrlKey &&
        event.altKey &&
        event.shiftKey &&
        !event.metaKey &&
        !event.isComposing &&
        onSaveAndExit
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onSaveAndExit();
        return;
      }
      // Editor-owned overlays are handled before the modal guard: ⌘K/⌘F must
      // never reach the browser's own find dialog while the user is typing in
      // the find bar, and ⌘K has to toggle the palette even though the palette
      // itself counts as a modal. Other single-key shortcuts stay paused.
      if (
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing &&
        (event.metaKey || event.ctrlKey)
      ) {
        if (event.code === "KeyK" && onToggleCommandPalette) {
          event.preventDefault();
          event.stopImmediatePropagation();
          // Toggle even while the palette is open: ⌘K is its own close key.
          // Other modals do not block it, because the palette floats above
          // them and Esc returns to whatever was underneath.
          onToggleCommandPalette();
          return;
        }
        if (event.code === "Slash" && onToggleShortcuts) {
          event.preventDefault();
          event.stopImmediatePropagation();
          onToggleShortcuts();
          return;
        }
        if (event.code === "KeyF" && onOpenFindReplace) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!modalOpen) onOpenFindReplace();
          return;
        }
      }

      // A capture listener sees events before a dialog's DOM handlers. Pause
      // editor actions explicitly so export controls, dialogs, drawers, and menus retain their native keys.
      if (
        modalOpen ||
        event.target.closest?.(
          "[data-presentation-overlay], [data-modal-overlay], [data-floating-surface], [role='dialog'], [role='menu'], [data-settings-drawer]",
        )
      )
        return;

      const is3DTarget = Boolean(
        event.target.closest?.(
          '[data-testid="editor-3d-canvas"], [data-testid="three-scene-canvas"], [data-testid="three-scene-viewport"], [data-surface="three-scene"]',
        ),
      );
      const isThreeD = currentCanvasType === "3d" || is3DTarget;

      // Allow 3D viewport gizmo and camera shortcuts to pass through to ThreeSceneViewport
      if (
        is3DTarget &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        ["KeyW", "KeyE", "KeyR", "KeyS", "KeyG", "KeyF"].includes(event.code)
      ) {
        return;
      }

      // Let the timeline handle navigation before canvas shortcuts can nudge
      // or delete the selected artwork. Modified history keys still pass.
      const isTimelineTarget = Boolean(
        event.target.closest?.('[data-testid="editor-motion-timeline"]'),
      );
      if (
        isTimelineTarget &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        [
          " ",
          "Delete",
          "Backspace",
          "Escape",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "s",
          "S",
        ].includes(event.key)
      )
        return;
      const activeTool = engine?.getTool?.() ?? toolRef.current;
      const isCropArmed = activeTool === TOOL.CROP;

      if (isTextEditingTarget(event.target)) {
        if (event.key === "Enter" && isCropArmed && engine.getCropRect?.()) {
          event.preventDefault();
          event.target.blur?.();
          engine.applyCrop?.();
          onTool(TOOL.SELECT);
          return;
        }
        return;
      }
      // Non-text controls (range/number/checkbox) never accept text: plain
      // keys stay muted, but ⌘/Ctrl combos pass — undo right after a slider.
      if (shortcutBlockedByTarget(event.target, event)) return;

      if (handleExportShortcut(event)) return;

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
        return;
      }

      if (event.key === "Escape") {
        if (event.isComposing) return;
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
        return;
      }

      const isWarpTool =
        activeTool === TOOL.SELECT_REGION ||
        activeTool === TOOL.PERSPECTIVE ||
        activeTool === TOOL.DISTORT ||
        activeTool === TOOL.PUPPET_WARP;

      if (event.key === "Enter" && engine.getSelectionTransform?.()) {
        event.preventDefault();
        void engine.applySelectionTransform?.();
        return;
      }

      if (event.key === "Enter" && isCropArmed && engine.getCropRect?.()) {
        event.preventDefault();
        engine.applyCrop?.();
        onTool(TOOL.SELECT);
        return;
      }

      if (event.key === "Enter" && isWarpTool) {
        event.preventDefault();
        engine.commit?.();
        onTool(TOOL.SELECT);
        return;
      }

      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        engine.isEditing?.()
      ) {
        event.preventDefault();
        engine.endEdit();
        return;
      }

      if (event.key === "Enter" && engine.getPenDraft?.()) {
        event.preventDefault();
        engine.finishPen();
        return;
      }

      if (event.key === "Enter" && engine.getPolygonDraft?.()) {
        event.preventDefault();
        engine.closePolygonLasso();
        return;
      }

      if (event.key === "Enter") {
        const selected = engine.getSelected();
        if (selected && selected.kind === "group") {
          event.preventDefault();
          engine.enterGroup(selected.id);
          return;
        }
        if (selected && selected.kind === "pen") {
          event.preventDefault();
          engine.startEdit(selected.id);
          return;
        }
      }

      const historyAction = historyShortcutAction(event);
      if (historyAction) {
        event.preventDefault();
        if (historyAction === HISTORY_SHORTCUT_ACTION.REDO)
          void (onRedo ? onRedo() : engine.redo());
        else void (onUndo ? onUndo() : engine.undo());
        return;
      }

      // Canvas view aids. Bindings avoid the browser's own ⌘R reload and the
      // grid/snap pair already taken by ⌘' and ⇧⌘':
      //   ⇧R        show/hide rulers          (Figma's binding)
      //   ⌘;        show/hide guides
      //   ⌥⌘;       clear all guides
      //   ⌥⌘'       snap to grid
      {
        const modifier = event.metaKey || event.ctrlKey;
        if (
          !modifier &&
          !event.altKey &&
          event.shiftKey &&
          event.code === "KeyR" &&
          onToggleRulers
        ) {
          event.preventDefault();
          onToggleRulers();
          return;
        }
        if (
          modifier &&
          !event.altKey &&
          !event.shiftKey &&
          event.code === "Semicolon" &&
          onToggleGuides
        ) {
          event.preventDefault();
          onToggleGuides();
          return;
        }
        if (
          modifier &&
          event.altKey &&
          !event.shiftKey &&
          event.code === "Semicolon" &&
          onClearGuides
        ) {
          event.preventDefault();
          onClearGuides();
          return;
        }
        if (
          modifier &&
          event.altKey &&
          !event.shiftKey &&
          (event.code === "Quote" || event.key === "'") &&
          onToggleSnapToGrid
        ) {
          event.preventDefault();
          onToggleSnapToGrid();
          return;
        }
        // Comments: ⌥⌘M opens the thread list, ⌥⌘⇧M arms placement. Alt is
        // required because ⌘M is the OS "minimise window" on macOS.
        if (
          modifier &&
          event.altKey &&
          event.shiftKey &&
          event.code === "KeyM" &&
          onToggleCommentMode
        ) {
          event.preventDefault();
          onToggleCommentMode();
          return;
        }
        if (
          modifier &&
          event.altKey &&
          !event.shiftKey &&
          event.code === "KeyM" &&
          onToggleComments
        ) {
          event.preventDefault();
          onToggleComments();
          return;
        }
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "KeyI"
      ) {
        event.preventDefault();
        if (engine.getPixelSelection?.()?.contours?.length) {
          void engine.invertPixelSelection?.();
          return;
        }
        const selected = engine.getSelected?.();
        if (selected?.id) {
          void engine.invertMask?.(selected.id);
        }
        return;
      }

      // Figma's component keys: Cmd/Ctrl+Alt+K creates, Cmd/Ctrl+Alt+B detaches.
      if ((event.metaKey || event.ctrlKey) && event.altKey) {
        if (event.code === "KeyK" && onCreateComponent) {
          event.preventDefault();
          onCreateComponent();
          return;
        }
        if (event.code === "KeyB" && onDetachInstance) {
          const selected = engine.getSelected();
          if (selected?.kind === "canvasInstance") {
            event.preventDefault();
            onDetachInstance(selected.id);
            return;
          }
        }
      }

      if (event.metaKey || event.ctrlKey) {
        switch (event.code) {
          case "KeyU":
            if (event.altKey) {
              event.preventDefault();
              engine.destructiveBoolean?.("union");
              return;
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
            return;
          case "KeyI":
            if (event.altKey) {
              event.preventDefault();
              engine.destructiveBoolean?.("intersect");
              return;
            }
            break;
          case "KeyX":
            if (event.altKey) {
              event.preventDefault();
              engine.destructiveBoolean?.("exclude");
              return;
            }
            if (engine.getPixelSelection?.()) {
              event.preventDefault();
              void engine.cutSelectionPixels?.();
              return;
            }
            if (engine.getSelected() || engine.getSelectedIds?.()?.length) {
              event.preventDefault();
              engine.cut();
              return;
            }
            return;
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
            return;
          case "KeyD":
            event.preventDefault();
            if (engine.getPixelSelection?.()?.contours?.length) {
              engine.clearPixelSelection?.();
              return;
            }
            if (event.shiftKey) {
              engine.select(null);
              return;
            }
            if (
              engine.getSelected?.() ||
              (engine.getSelectedIds?.()?.length ?? 0) > 0
            ) {
              engine.duplicateSelected();
            } else if (onDuplicateCanvas) {
              onDuplicateCanvas();
            }
            return;
          case "KeyA":
            event.preventDefault();
            engine.selectAll();
            return;
          case "KeyC": {
            if (event.altKey) {
              event.preventDefault();
              engine.copyStyle?.();
              return;
            }
            const hasTextSelection =
              (window.getSelection()?.toString().length ?? 0) > 0;
            if (hasTextSelection) return;
            if (engine.getPixelSelection?.()) {
              event.preventDefault();
              void engine.copySelectionPixels?.();
              return;
            }
            if (engine.getSelected() || engine.getSelectedIds?.()?.length) {
              event.preventDefault();
              engine.copy();
              return;
            }
            return;
          }
          case "KeyV": {
            if (event.altKey) {
              event.preventDefault();
              engine.pasteStyle?.();
              return;
            }
            if (engine.canPasteFromInternalClipboard?.()) {
              event.preventDefault();
              event.stopImmediatePropagation();
              engine.paste();
              return;
            }
            // Otherwise the paste event carries system clipboard data for
            // external images, SVGs, or an application-owned layer copy.
            return;
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
              return;
            }
            engine.duplicateSelected();
            return;
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
                return;
              }
            }
            engine.bringToFront();
            return;
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
                return;
              }
            }
            engine.sendToBack();
            return;
          }
          case "Digit0":
            event.preventDefault();
            if (onZoomToHundred) onZoomToHundred();
            else engine.zoomToHundred();
            return;
          case "KeyT": {
            event.preventDefault();
            if (engine.getPixelSelection?.()?.bounds) {
              if (engine.beginSelectionTransform?.()) {
                return;
              }
            }
            const selectedNodes = engine.getSelectedNodes?.() ?? [];
            const activeNode = selectedNodes[0] || null;
            const targetTool = getNodeWarpTool(activeNode, TOOL.SELECT_REGION);
            onTool(targetTool);
            return;
          }
          case "KeyG":
            event.preventDefault();
            if (event.altKey) {
              if (event.shiftKey) engine.releaseClippingMask();
              else engine.createClippingMask();
            } else if (event.shiftKey) engine.ungroupSelection();
            else engine.groupSelection();
            return;
          case "KeyN":
            event.preventDefault();
            onNew?.();
            return;
          case "Equal":
          case "NumpadAdd":
            event.preventDefault();
            if (onZoomStep) onZoomStep(1);
            else engine.zoomStep(1);
            return;
          case "Minus":
          case "NumpadSubtract":
            event.preventDefault();
            if (onZoomStep) onZoomStep(-1);
            else engine.zoomStep(-1);
            return;
          case "Digit0":
          case "Numpad0":
            event.preventDefault();
            if (onZoomToFit) onZoomToFit();
            else engine.zoomToFit();
            return;
          case "Digit1":
          case "Numpad1":
            event.preventDefault();
            if (onZoomToHundred) onZoomToHundred();
            else engine.zoomToHundred();
            return;
          case "Digit2":
          case "Numpad2":
            event.preventDefault();
            engine.zoomToSelection?.();
            return;
          default:
            break;
        }
      }

      if (event.shiftKey && event.code === "Digit1") {
        event.preventDefault();
        if (onZoomToFit) onZoomToFit();
        else engine.zoomToFit();
        return;
      }
      if (event.shiftKey && event.code === "Digit2") {
        event.preventDefault();
        engine.zoomToSelection?.();
        return;
      }
      if (event.shiftKey && event.code === "Digit0") {
        event.preventDefault();
        if (onZoomToHundred) onZoomToHundred();
        else engine.zoomToHundred();
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.code === "Slash")) {
        event.preventDefault();
        onToggleShortcuts?.();
        return;
      }

      if (event.code === "Backslash" || event.key === "\\") {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          const fg = engine.getColor?.() || "#000000";
          void engine.fillSelection?.(fg);
          return;
        }
        if (event.altKey) {
          event.preventDefault();
          const bg = engine.getBackgroundColor?.() || "#ffffff";
          void engine.fillSelection?.(bg);
          return;
        }
        if (event.repeat) return;
        event.preventDefault();
        engine.setBypassAdjustments?.(true);
        return;
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
          return;
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
          return;
        }
      }

      if (isPlusKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        engine.zoomIn?.();
        return;
      }
      if (isMinusKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        engine.zoomOut?.();
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        // A selected guide owns Delete: removing it must not also remove the
        // selected layer underneath (the ruler overlay selects guides only).
        if (selectedGuideId && onDeleteGuide) {
          event.preventDefault();
          onDeleteGuide(selectedGuideId);
          return;
        }
        if (event.altKey && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          const fg = engine.getColor?.() || "#000000";
          void engine.fillSelection?.(fg);
          return;
        }
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          const bg = engine.getBackgroundColor?.() || "#ffffff";
          void engine.fillSelection?.(bg);
          return;
        }
        event.preventDefault();
        if (engine.getPenDraft?.()?.anchors?.length > 0) {
          engine.popDraftAnchor?.();
          return;
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
          return;
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
          (engine.getSelectedIds?.()?.length ?? 0) > 0
        ) {
          engine.deleteSelected();
        } else if (onDeleteCanvas) {
          onDeleteCanvas();
        }
        return;
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
          nudgedRef.current = true;
          return;
        }
        nudge(arrow[0] * step, arrow[1] * step);
        return;
      }

      if (event.altKey) return;

      // Grouped tool modes: Cmd/Ctrl+1..7
      if ((event.ctrlKey || event.metaKey) && /^Digit[1-7]$/.test(event.code)) {
        const slot = Number(event.code.slice(-1));
        const activeTool = toolRef.current;
        const transformModes = [
          TOOL.DISTORT,
          TOOL.PERSPECTIVE,
          TOOL.PUPPET_WARP,
        ];
        const brushModes = [
          "normal",
          "smudge",
          "blur",
          "sharpen",
          "dodge",
          "burn",
          "sponge",
        ];
        if (
          activeTool === TOOL.PERSPECTIVE ||
          activeTool === TOOL.DISTORT ||
          activeTool === TOOL.PUPPET_WARP
        ) {
          const mode = transformModes[slot - 1];
          if (mode) {
            event.preventDefault();
            onTool(mode);
            return;
          }
        }
        if (
          activeTool === TOOL.MARQUEE ||
          activeTool === TOOL.LASSO ||
          activeTool === TOOL.WAND ||
          activeTool === TOOL.REGION
        ) {
          const item = marqueeItemForMode(MARQUEE_MODE_IDS[slot - 1]);
          if (item) {
            event.preventDefault();
            if (item.toolId === TOOL.MARQUEE) engine.setMarqueeMode?.(item.id);
            onTool(item.toolId);
            return;
          }
        }
        if (activeTool === TOOL.BRUSH) {
          const mode = brushModes[slot - 1];
          if (mode) {
            event.preventDefault();
            engine.setBrushMode?.(mode);
            return;
          }
        }
      }

      // Cmd/Ctrl + Quote: 切换网格 (Affinity / Figma ⌘')
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        (event.code === "Quote" || event.key === "'")
      ) {
        event.preventDefault();
        const currentGrid = engine.getGrid?.();
        const gridEnabled = currentGrid && currentGrid?.enabled !== false;
        engine.setGrid?.({
          ...currentGrid,
          enabled: !gridEnabled,
          size: currentGrid?.size ?? 32,
        });
        return;
      }

      // Shift + Cmd/Ctrl + Semicolon or Quote: 切换智能吸附 (Affinity ⇧⌘;')
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        (event.code === "Semicolon" ||
          event.code === "Quote" ||
          event.key === ";" ||
          event.key === "'")
      ) {
        event.preventDefault();
        engine.toggleSnapping?.();
        return;
      }

      if (event.metaKey || event.ctrlKey) return;

      // Photoshop-style number keys for opacity
      const isDigit = /^Digit([0-9])$/.exec(event.code);
      const isNumpad = /^Numpad([0-9])$/.exec(event.code);
      const digitMatch = isDigit || isNumpad;
      if (digitMatch && !event.shiftKey) {
        const brushArmed = toolRef.current === TOOL.BRUSH;
        const selected = engine.getSelected();
        if (brushArmed || (selected && !selected.locked)) {
          event.preventDefault();
          const digit = parseInt(digitMatch[1], 10);
          const now = Date.now();
          let targetPct = 100;
          if (
            now - opacityDigitTimerRef.current.time < 800 &&
            opacityDigitTimerRef.current.firstDigit !== null
          ) {
            targetPct = opacityDigitTimerRef.current.firstDigit * 10 + digit;
            opacityDigitTimerRef.current = { time: 0, firstDigit: null };
          } else {
            targetPct = digit === 0 ? 100 : digit * 10;
            opacityDigitTimerRef.current = { time: now, firstDigit: digit };
          }
          const nextOpacity = Math.max(0, Math.min(1, targetPct / 100));
          if (brushArmed) engine.setBrushOpacity?.(nextOpacity);
          else engine.updateNode(selected.id, { opacity: nextOpacity });
          return;
        }
      }

      // X swaps colors
      if (
        event.code === "KeyX" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (onSwapColors) {
          event.preventDefault();
          onSwapColors();
          return;
        }
      }

      // S arms clone stamp (2D canvas only)
      if (
        event.code === "KeyS" &&
        !isTimelineTarget &&
        !isThreeD &&
        currentCanvasType !== "motion"
      ) {
        event.preventDefault();
        engine.setHealingMode?.("clone");
        onTool(TOOL.HEALING);
        return;
      }

      // 2D drawing tool keys and tool families do not fire in 3D canvas mode
      if (isThreeD) {
        return;
      }

      // Shifted tool keys and geometry actions
      if (event.shiftKey) {
        if (event.code === "KeyA") {
          event.preventDefault();
          void engine.toggleAutoLayoutSelection?.();
          return;
        }
        if (event.code === "KeyH") {
          event.preventDefault();
          void engine.flipHorizontal?.();
          return;
        }
        if (event.code === "KeyV") {
          event.preventDefault();
          void engine.flipVertical?.();
          return;
        }
        const shiftedTool = TOOL_SHIFT_KEYS[event.code];
        if (shiftedTool) {
          event.preventDefault();
          onTool(shiftedTool);
          return;
        }
      }

      // A tool-family key opens the Pie Menu immediately. This branch must
      // stay before TOOL_KEYS so the family key never falls through to a
      // single-tool switch while the radial is meant to show.
      const familyKeyAction = resolveToolFamilyKeyAction({
        phase: "keydown",
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: Boolean(event.repeat),
        pressedCode: pressedFamilyCodeRef.current,
      });
      if (familyKeyAction) {
        event.preventDefault();
        if (familyKeyAction.type === "openPie") {
          pressedFamilyCodeRef.current = event.code;
          onOpenPieMenu?.(
            familyKeyAction.family,
            mousePosRef.current,
            event.code,
          );
        }
        // familyHold (OS auto-repeat while the same key is held) is a no-op:
        // the menu is already open and must not reopen on every repeat.
        return;
      }

      const nextTool = TOOL_KEYS[event.code];
      if (nextTool) {
        event.preventDefault();
        const toggled = toggleToolKey(
          toolRef.current,
          nextTool,
          lastToolRef.current,
        );
        lastToolRef.current = toggled.lastTool;
        onTool(toggled.tool);
      }
    };

    const onKeyUp = (event) => {
      const magneticAction = magneticLassoShortcutAction(event, {
        active: Boolean(engine.getMagneticLassoDraft?.()),
        phase: "keyup",
      });
      if (magneticAction === MAGNETIC_LASSO_SHORTCUT_ACTION.STRAIGHT_OFF) {
        engine.setMagneticLassoStraight?.(false);
        return;
      }
      if (event.code === "Backslash" || event.key === "\\") {
        engine.setBypassAdjustments?.(false);
        return;
      }

      if (pressedFamilyCodeRef.current === event.code) {
        pressedFamilyCodeRef.current = null;
      }

      if (!event.key.startsWith("Arrow") || !nudgedRef.current) return;
      nudgedRef.current = false;
      engine.commit("editor.history.entry.transform");
    };

    const onBlur = () => {
      engine.setBypassAdjustments?.(false);
      engine.setMagneticLassoStraight?.(false);
      pressedFamilyCodeRef.current = null;
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      pressedFamilyCodeRef.current = null;
    };
  }, [
    engine,
    currentCanvasType,
    enabled,
    onCreateComponent,
    onDetachInstance,
    modalOpen,
    onUndo,
    onRedo,
    onTool,
    onApply,
    onSaveAndExit,
    onZoomStep,
    onZoomToFit,
    onZoomToHundred,
    onToggleShortcuts,
    onToggleRulers,
    onToggleGuides,
    onClearGuides,
    onToggleSnapToGrid,
    onToggleComments,
    onToggleCommentMode,
    onToggleCommandPalette,
    onOpenFindReplace,
    selectedGuideId,
    onDeleteGuide,
    onSwapColors,
    onDeleteCanvas,
    onDuplicateCanvas,
    onDeselectCanvas,
    onOpenPieMenu,
    onClosePieMenu,
  ]);
}
