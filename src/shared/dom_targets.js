/**
 * Form-target classification for global keyboard-shortcut guards.
 *
 * Global shortcut handlers (undo, tool switching, nudges) must not hijack
 * keystrokes while the user is typing into a text field. The historical guard
 * matched on tagName alone, so EVERY input — including range sliders and
 * number spinners, which never accept text — swallowed ⌘Z and left undo
 * looking broken right after a slider drag. The classification is by input
 * `type`, not tagName:
 *
 * - isTextEditingTarget: real text entry (textarea, contentEditable, text-like
 *   input types). All shortcuts stay muted here.
 * - isNonTextControlTarget: range/number/checkbox and friends. Plain keys stay
 *   muted (native arrows still adjust a slider; digits still type into a
 *   spinner), but ⌘/Ctrl combos pass through so undo/redo always works.
 *
 * Both editors' shortcut modules share these predicates — one classification,
 * one place to fix.
 */

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "url",
  "tel",
  "password",
  "email",
]);

// Tab switches workspaces on the canvas; controls and panels retain native
// traversal. Both Workflow and Design must use the same ownership boundary.
export const NATIVE_TAB_TARGET_SELECTOR =
  "input, textarea, select, button, a[href], [contenteditable='true'], [role='link'], [role='textbox'], [role='listbox'], [role='dialog'], [role='menu'], [role='toolbar'], aside, [data-testid='web-sidebar'], [data-testid='agent-panel'], [data-testid='editor-motion-timeline']";

export function isNativeTabTarget(target) {
  if (
    target?.isContentEditable ||
    target?.closest?.(NATIVE_TAB_TARGET_SELECTOR)
  ) {
    return true;
  }
  // ReactFlow exposes selectable graph wrappers as ARIA buttons. They belong
  // to the canvas; actual controls inside them were handled above.
  const roleButton = target?.closest?.("[role='button']");
  return Boolean(
    roleButton &&
    !roleButton.classList?.contains("react-flow__node") &&
    !roleButton.classList?.contains("react-flow__edge"),
  );
}

/** True when the event target is genuinely accepting typed text. */
export function isTextEditingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "INPUT") return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

/** True for form controls that never accept text (range, number, checkbox…). */
export function isNonTextControlTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName !== "INPUT" && target.tagName !== "SELECT") return false;
  return !isTextEditingTarget(target);
}

/**
 * Whether a global keydown handler should ignore the event because of where
 * it landed. Text editing mutes everything; non-text controls mute only plain
 * (unmodified) keys so ⌘/Ctrl combos like undo still fire over a slider.
 */
export function shortcutBlockedByTarget(target, event) {
  if (isTextEditingTarget(target)) return true;
  if (
    target instanceof HTMLElement &&
    target.tagName === "INPUT" &&
    target.type === "number" &&
    (event?.metaKey || event?.ctrlKey) &&
    ["KeyA", "KeyC", "KeyX", "KeyV"].includes(event.code)
  ) {
    return true;
  }
  if (isNonTextControlTarget(target) && !(event?.metaKey || event?.ctrlKey)) {
    return true;
  }
  return false;
}
