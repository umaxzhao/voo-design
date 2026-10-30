/** Keep arrow keys inside a menu instead of moving the selected canvas node. */
export function moveEditorMenuFocus(event, menu) {
  if (!menu?.contains(event.target) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  const items = [...menu.querySelectorAll('[role^="menuitem"]:not(:disabled)')]
    .filter((item) => item.getClientRects().length && item.getAttribute("aria-disabled") !== "true");
  if (!items.length) return false;
  event.preventDefault();
  event.stopPropagation();
  const current = items.indexOf(menu.ownerDocument.activeElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
    : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next].focus();
  return true;
}
