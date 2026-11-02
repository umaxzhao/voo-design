import { useEffect } from "react";

const TOP_OVERLAY_SELECTOR =
  '[role="dialog"], [aria-modal="true"], [data-testid="command-palette"], [role="menu"]';

function hasTopOverlay() {
  if (typeof document === "undefined" || !document.querySelectorAll) return false;
  const overlays = document.querySelectorAll(TOP_OVERLAY_SELECTOR);
  for (const element of overlays) {
    if (element.closest?.('[aria-hidden="true"], [inert]') || element.hidden) continue;
    return true;
  }
  return false;
}

/** Keep the browser's Escape behavior consistent with its former overlay. */
export function useBrowserOverlay(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (hasTopOverlay()) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
    };
  }, [open, onClose]);
}

