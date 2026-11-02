import { useEffect, useLayoutEffect, useRef } from "react";
import { handleExportShortcut } from "./editor/export_shortcut.js";
import { MAGNETIC_LASSO_SHORTCUT_ACTION, magneticLassoShortcutAction } from "../shared/editor-shortcut-pipeline.js";
import { handleOverlayShortcut, shortcutTargetContext } from "./editor-shortcut-target.js";
import { handleGestureShortcut } from "./editor-shortcut-gestures.js";
import { handleViewShortcut } from "./editor-shortcut-view.js";
import { handleModifierShortcut } from "./editor-shortcut-modifiers.js";
import { handleDrawingShortcut } from "./editor-shortcut-drawing.js";
import { handleToolShortcut } from "./editor-shortcut-tools.js";
import { finishNudge } from "./editor-shortcut-nudge.js";
export { resolveTargetEditorBridge } from "./editor/editor_target_resolver.js";
export { unwindEscape, resolveToolFamilyKeyAction } from "./editor-shortcut-actions.js";

const EDITOR_FOCUS_SURFACE_SELECTOR =
  '[data-testid="editor-pages"] canvas, [data-editor-artboard], [data-testid="editor-three-instance-input"]';
const EDITOR_NATIVE_CONTROL_SELECTOR =
  'input, select, textarea, button, a[href], [contenteditable], [role="link"], [role="button"], [role="listbox"]';
// End keyboard previews before the engine's passive snapshot/dispose cleanup.
const useShortcutLifecycle = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Ordered stages retain ownership: a handled key never falls into another tool. */
function routeKeyDown(event, context) {
  if (!context.engine || context.enabled === false) return;
  if (handleOverlayShortcut(event, context)) return;
  const target = shortcutTargetContext(event, context);
  if (!target || handleExportShortcut(event)) return;
  if (handleGestureShortcut(event, target)) return;
  if (handleViewShortcut(event, target)) return;
  if (handleModifierShortcut(event, target)) return;
  if (handleDrawingShortcut(event, target)) return;
  handleToolShortcut(event, target);
}

/** Register capture listeners once per engine, while callbacks stay current. */
export function useEditorShortcuts(options) {
  const { engine, enabled = true, tool, canvasType: propCanvasType = null,
    targetNodeId = null } = options;
  const currentCanvasType = propCanvasType ?? engine?.doc?.canvasType ??
    (typeof engine?.getCanvasType === "function" ? engine.getCanvasType() : null) ??
    (typeof engine?.getDocument === "function" ? engine.getDocument()?.canvasType : null);
  const targetNodeIdRef = useRef(null);
  targetNodeIdRef.current = targetNodeId ?? engine?.sourceWorkflowNodeId ?? null;
  // The owner is retained until keyup, so focus changes cannot commit another page.
  const nudgedRef = useRef(false);
  const lastToolRef = useRef(null);
  const opacityDigitTimerRef = useRef({ time: 0, firstDigit: null });
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const mousePosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const pressedFamilyCodeRef = useRef(null);
  const latestRef = useRef(null);
  latestRef.current = { ...options, engine, currentCanvasType,
    modalOpen: options.modalOpen ?? false, selectedGuideId: options.selectedGuideId ?? null,
    targetNodeIdRef, nudgedRef, lastToolRef, opacityDigitTimerRef, toolRef,
    mousePosRef, pressedFamilyCodeRef };

  useEffect(() => {
    const onMove = (event) => { mousePosRef.current = { x: event.clientX, y: event.clientY }; };
    window.addEventListener("pointermove", onMove, { passive: true, capture: true });
    return () => window.removeEventListener("pointermove", onMove, { capture: true });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onSurfacePointerDown = (event) => {
      if (latestRef.current.modalOpen || event.defaultPrevented ||
        event.target.closest?.(EDITOR_NATIVE_CONTROL_SELECTOR) ||
        event.target.closest?.('[role="dialog"], [role="menu"]')) return;
      const surface = event.target.closest?.(EDITOR_FOCUS_SURFACE_SELECTOR);
      if (!(surface instanceof HTMLElement)) return;
      // Pointer editing establishes ownership without a new Tab traversal stop.
      if (!surface.hasAttribute("tabindex")) surface.tabIndex = -1;
      surface.focus({ preventScroll: true });
    };
    window.addEventListener("pointerdown", onSurfacePointerDown, true);
    return () => window.removeEventListener("pointerdown", onSurfacePointerDown, true);
  }, [enabled]);

  useShortcutLifecycle(() => {
    if (!enabled || !engine) return undefined;
    const onKeyDown = (event) => routeKeyDown(event, latestRef.current);
    const onKeyUp = (event) => {
      const current = latestRef.current.engine;
      if (!current) {
        if (event.key.startsWith("Arrow")) finishNudge(nudgedRef);
        return;
      }
      const magneticAction = magneticLassoShortcutAction(event, {
        active: Boolean(current.getMagneticLassoDraft?.()), phase: "keyup",
      });
      if (magneticAction === MAGNETIC_LASSO_SHORTCUT_ACTION.STRAIGHT_OFF) {
        current.setMagneticLassoStraight?.(false);
        return;
      }
      if (event.code === "Backslash" || event.key === "\\") {
        current.setBypassAdjustments?.(false);
        return;
      }
      if (pressedFamilyCodeRef.current === event.code) pressedFamilyCodeRef.current = null;
      if (event.key.startsWith("Arrow")) finishNudge(nudgedRef);
    };
    const onBlur = () => {
      finishNudge(nudgedRef);
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
      // A held preview modifier must not stick on a page that loses ownership.
      onBlur();
    };
  }, [enabled, engine]);
}
