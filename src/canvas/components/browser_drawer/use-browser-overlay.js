import { useEffect } from "react";

/** Keep the browser's Escape behavior consistent with its former overlay. */
export function useBrowserOverlay(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("keydown", close, true);
    };
  }, [open, onClose]);
}
