/**
 * Decides whether a composer control can be clicked.
 *
 * ChatGPT and Gemini both render a send button that stays in the DOM while
 * disabled (aria-disabled or the disabled property) and sometimes while it is
 * off-screen. Clicking that decoy does not submit.
 */

function eventCtor(name) {
  const ctor = globalThis[name];
  return typeof ctor === "function" ? ctor : null;
}

/** True when the control has a box the user could hit. */
export function isVisible(element) {
  if (!element) return false;
  if (typeof element.getClientRects === "function") {
    return element.getClientRects().length > 0;
  }
  return element.offsetParent != null;
}

/** True when the control is not marked disabled. */
export function isEnabled(element) {
  if (!element) return false;
  if (element.disabled) return false;
  const aria = element.getAttribute?.("aria-disabled");
  return aria !== "true";
}

/**
 * First visible, enabled match in selector order, else the first visible
 * match so the caller can see that a send button exists but is not ready.
 */
export function findSendButton(selectors, root = globalThis.document) {
  const matches = [];
  for (const selector of selectors ?? []) {
    const found = root?.querySelectorAll?.(selector);
    if (!found) continue;
    for (const element of found) matches.push(element);
  }
  return (
    matches.find((element) => isVisible(element) && isEnabled(element)) ??
    matches.find((element) => isVisible(element)) ??
    null
  );
}

/** Pointer sequence both composers treat as a real click. */
export function pressButton(button) {
  if (!button) return;
  const PointerEvent = eventCtor("PointerEvent");
  const MouseEvent = eventCtor("MouseEvent");
  const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" };
  if (PointerEvent) {
    button.dispatchEvent?.(new PointerEvent("pointerdown", pointer));
  }
  if (MouseEvent) {
    button.dispatchEvent?.(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  }
  if (PointerEvent) {
    button.dispatchEvent?.(new PointerEvent("pointerup", pointer));
  }
  if (MouseEvent) {
    button.dispatchEvent?.(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  }
  button.click?.();
}
