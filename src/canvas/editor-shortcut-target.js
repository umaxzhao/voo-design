import { isTextEditingTarget, shortcutBlockedByTarget } from '../shared/dom_targets.js';
import { TOOL } from './editor/tool_ids.js';

/** A pointer-opened menu can leave focus on its trigger outside the portal. */
function hasVisibleEscapeSurface(event) {
  if (event.key !== "Escape") return false;
  const ownerDocument = event.target?.ownerDocument;
  if (!ownerDocument?.querySelectorAll) return false;
  // The persistent Layers listbox is document navigation, not a dismissible overlay.
  return [...ownerDocument.querySelectorAll('[role="menu"], [role="listbox"]:not([data-layers-list]), [role="dialog"]')]
    .some((surface) => surface.getClientRects().length > 0 &&
      ownerDocument.defaultView.getComputedStyle(surface).visibility !== "hidden");
}

export function handleOverlayShortcut(event, context) {
  const { onSaveAndExit, onToggleCommandPalette, onToggleShortcuts, onOpenFindReplace, modalOpen } = context;
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
    return true;
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
      return true;
    }
    if (event.code === "Slash" && onToggleShortcuts) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onToggleShortcuts();
      return true;
    }
    if (event.code === "KeyF" && onOpenFindReplace) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!modalOpen) onOpenFindReplace();
      return true;
    }
  }


  return false;
}

/**
 * Single-character keys that switch tools or update layer opacity on the canvas.
 * These must never fire while the user is typing in a sidebar / inspector panel.
 * The list covers all entries in TOOL_KEYS + TOOL_SHIFT_KEYS + digit opacity +
 * color swap X. Keep in sync with editor-shortcut-tools.js.
 */
const SINGLE_CHAR_CANVAS_KEYS = new Set([
  // Tool keys (from editor_constants TOOL_KEYS / TOOL_SHIFT_KEYS)
  "KeyA", "KeyB", "KeyC", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI",
  "KeyJ", "KeyK", "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ",
  "KeyR", "KeyS", "KeyT", "KeyU", "KeyV", "KeyW", "KeyX", "KeyY",
  "KeyZ",
  // Digit opacity shortcuts (0–9)
  "Digit0", "Digit1", "Digit2", "Digit3", "Digit4",
  "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
  "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4",
  "Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9",
  // Other single-key canvas shortcuts
  "Backslash", "BracketLeft", "BracketRight", "Comma", "Period",
  "Semicolon", "Quote", "Backquote", "Minus", "Equal",
  "Space", "Delete", "Backspace",
]);

/**
 * Selector for non-canvas UI regions whose controls must retain all keystrokes.
 * A keydown that lands inside any of these containers must not trigger single-
 * character canvas shortcuts (tool switches, digit opacity, color swap).
 * Ctrl/Meta combos (undo, copy, paste) pass through regardless.
 */
const SIDEBAR_REGION_SELECTOR =
  "[data-testid='editor-layers-panel'], " +
  "[data-testid='editor-properties-panel'], " +
  "aside, " +
  "[data-inspector-control], " +
  "[data-inspector-part], " +
  "[data-layers-list], " +
  "[data-testid='web-sidebar'], " +
  "[data-testid='agent-panel'], " +
  "[data-settings-drawer]";

/**
 * True when a keydown event originates inside a sidebar / inspector panel AND
 * carries no Ctrl/Meta modifier.  In that case single-character canvas shortcuts
 * must be suppressed so the user can type freely without tool changes firing.
 */
function isSidebarSingleKeyEvent(event) {
  if (event.ctrlKey || event.metaKey) return false;
  if (!SINGLE_CHAR_CANVAS_KEYS.has(event.code)) return false;
  return Boolean(event.target?.closest?.(SIDEBAR_REGION_SELECTOR));
}

/** Resolve keyboard ownership before running gesture or canvas commands. */
export function shortcutTargetContext(event, context) {
  const { engine, toolRef, modalOpen, currentCanvasType, onTool } = context;
  // A capture listener sees events before a dialog's DOM handlers. Pause
  // editor actions explicitly so export controls, dialogs, drawers, and menus retain their native keys.
  if (
    modalOpen || hasVisibleEscapeSurface(event) ||
    event.target.closest?.(
      "[data-presentation-overlay], [data-modal-overlay], [data-floating-surface], [role='dialog'], [role='menu'], [data-settings-drawer]",
    )
  )
    return null;

  // Suppress single-character canvas shortcuts when the event originates inside
  // a sidebar panel or inspector control.  This catches the timing window where
  // the user clicks an inspector field and starts typing before the browser has
  // moved activeElement: the keydown target is still a panel div, not an input,
  // so the text-editing guard above misses it and tool shortcuts fire instead.
  if (isSidebarSingleKeyEvent(event)) return null;

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
    return null;
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
    return null;
  const activeTool = engine?.getTool?.() ?? toolRef.current;
  const isCropArmed = activeTool === TOOL.CROP;

  if (isTextEditingTarget(event.target)) {
    if (event.key === "Enter" && isCropArmed && engine.getCropRect?.()) {
      event.preventDefault();
      event.target.blur?.();
      engine.applyCrop?.();
      onTool(TOOL.SELECT);
      return null;
    }
    return null;
  }
  // Non-text controls (range/number/checkbox) never accept text: plain
  // keys stay muted, but ⌘/Ctrl combos pass — undo right after a slider.
  if (shortcutBlockedByTarget(event.target, event)) return null;


  return { ...context, activeTool, isCropArmed, isThreeD, isTimelineTarget };
}
